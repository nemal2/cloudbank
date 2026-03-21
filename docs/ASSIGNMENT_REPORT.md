# CloudBank — Mini Banking System
## EC7205 Cloud Computing · Assignment 2 · University of Ruhuna · April 2026

---

## 1. Introduction

CloudBank is a cloud-native banking application built to demonstrate real-world principles of cloud computing — scalability, high availability, security, and modern deployment practices. The system enables users to register via Google authentication, create bank accounts, perform fund transfers with full ACID guarantees, receive real-time email notifications, and upload profile photos to cloud storage.

The application is modelled as a microservices architecture adapted from the Saga orchestration pattern, directly mapping the theoretical concepts in the module to a working implementation. Every major cloud-computing concept required by the assignment is implemented and demonstrable: horizontal scaling, asynchronous messaging via Kafka, Redis caching, JWT-based security, containerised deployment via Docker, CI/CD via GitHub Actions, and monitoring via Prometheus and Grafana.

**System purpose:** A simplified retail banking platform allowing users to open accounts, transfer funds between accounts, view transaction history, and receive email confirmations — all secured by Google OAuth 2.0 and deployed to AWS.

---

## 2. Architecture

### 2.1 High-Level Overview

The system follows a microservices architecture with five independently deployable services, each with a single responsibility. An Nginx API Gateway is the single entry point for all client traffic, handling rate limiting, routing, and SSL termination. All services communicate **synchronously** via REST for real-time operations and **asynchronously** via Apache Kafka for event-driven workflows.

```
Client (React + Vite)
        │ HTTPS
  [API Gateway — Nginx]
   ┌────┴─────────────────────────────────┐
   │    JWT verify · rate limit · routing  │
   └─┬──────┬──────────┬──────────┬───────┘
     │      │          │          │   REST (sync)
  [Auth] [Account] [Transaction] [Notification]
  8081   8082      8083           8084
     │      │          │
     │      │    [Outbox → Kafka]   ← async event bus
     │      │          │
  [PostgreSQL · Redis · AWS S3 / MinIO]
```

### 2.2 Microservices

| Service | Port | Responsibility |
|---|---|---|
| **auth-service** | 8081 | Google OAuth 2.0 verification, JWT issuance, Redis session, token blacklisting on logout |
| **account-service** | 8082 | Account CRUD, balance enquiry (Redis cached), S3/MinIO profile photo upload, admin freeze/unfreeze |
| **transaction-service** | 8083 | ACID fund transfers (pessimistic locking), Saga state machine, Transactional Outbox Pattern, Kafka event publication |
| **notification-service** | 8084 | Kafka consumer, HTML email dispatch via SMTP (Mailhog locally, SendGrid in production) |
| **api-gateway** | 80/443 | Nginx reverse proxy — rate limiting, CORS, JWT header forwarding, SSL termination |

### 2.3 Communication Methods

**Synchronous (REST over HTTP):**
All client-facing operations use REST. The API Gateway routes requests to the appropriate service and forwards the validated JWT as an `X-User-Id` header after verification. This is used for: login, account creation, balance lookup, initiating transfers, and admin operations.

**Asynchronous (Apache Kafka):**
After a transaction completes, the transaction-service writes a Kafka event to the `outbox` table **within the same database transaction**. A background relay thread polls this table every second and publishes unpublished events to Kafka. The notification-service consumes these events to send emails. This decouples the notification workflow from the critical transaction path — if the mail server is slow or unavailable, the transfer still succeeds instantly.

Kafka topics used: `txn.completed`, `txn.failed`, `notification.send`, `audit.log`.

### 2.4 Data Layer

- **PostgreSQL** — primary relational store for all persistent data (users, accounts, transactions, saga state, outbox). Chosen for ACID compliance — essential for financial data integrity.
- **Redis** — dual purpose: (a) session cache mapping user IDs to emails with 24-hour TTL, eliminating database lookups on every request; (b) account balance cache with 60-second TTL, invalidated on write; (c) JWT blacklist for logout.
- **AWS S3 / MinIO** — object storage for profile photos. The S3Service abstraction reads an `AWS_ENDPOINT` environment variable: if set, it points to local MinIO; if unset, real AWS S3 is used. No code changes are needed to switch between environments.

### 2.5 Security Design

| Layer | Mechanism |
|---|---|
| Authentication | Google OAuth 2.0 ID token verified server-side by `AuthService` using Google's public keys |
| Authorisation | JWT (HS256) signed with a shared secret; contains `role` claim (USER / ADMIN); validated by every service |
| Session | Redis-backed, 24h TTL; invalidated on logout via JWT blacklist |
| Transport | HTTPS enforced at Nginx; TLS certificates configured in production |
| Rate limiting | Nginx: 10 req/min for auth endpoints, 30 req/min for API; burst allowance of 5 |
| Input validation | Jakarta Bean Validation on all DTOs; SQL injection prevented by JPA parameterised queries |
| Secrets | All credentials injected via environment variables; `.env` excluded from git; AWS Secrets Manager used in production |
| RBAC | Admin endpoints (`/api/v1/admin/**`) protected by `hasRole("ADMIN")` in Spring Security |

---

## 3. Implementation

### 3.1 ACID Transactions

The fund transfer operation is the core of the system. It acquires pessimistic write locks on both account rows (`SELECT ... FOR UPDATE` via JPA `@Lock(PESSIMISTIC_WRITE)`), validates balances, debits the source, credits the destination, persists the transaction record, and writes an outbox event — all in a single `@Transactional` method. If any step fails, the entire transaction rolls back. This guarantees atomicity and isolation even under concurrent load.

### 3.2 Transactional Outbox Pattern

This pattern solves the dual-write problem: how to update the database and publish a Kafka event atomically. The solution writes the Kafka payload into an `outbox` table row within the same database transaction as the transfer. The `OutboxRelay` component polls for unpublished rows every second and publishes them to Kafka, marking each as published only after the Kafka send confirms. This guarantees at-least-once delivery even if Kafka is temporarily unavailable.

### 3.3 Redis Caching

Account balance reads are served from Redis when available (cache hit), falling back to PostgreSQL (cache miss) with a 60-second TTL. This dramatically reduces read load on the database. The cache is explicitly invalidated when an account's balance or status changes. Redis also serves as the session store — every JWT validation needs only a Redis lookup rather than a full database query.

### 3.4 S3-Compatible Image Storage

The `S3Service` is built on the AWS SDK v2 and works identically with AWS S3 and MinIO. Profile photo uploads receive a pre-signed URL valid for one hour, so the client can display the photo directly without routing traffic through the backend. In development, MinIO runs as a Docker container — the only config change is `AWS_ENDPOINT=http://minio:9000`.

### 3.5 Email Notifications

The notification-service consumes `txn.completed` and `txn.failed` Kafka events and sends styled HTML emails using Spring's `JavaMailSender`. In development, Mailhog captures all outbound SMTP traffic with a web UI at `localhost:8025`. In production, the SMTP host and credentials are replaced with SendGrid or AWS SES — again, only configuration changes.

### 3.6 Frontend

The React + Vite frontend uses `@react-oauth/google` for the Google OAuth button. After login, the JWT is stored in `localStorage` and attached to every API request via an Axios request interceptor. The UI includes a dashboard with balance chart (Recharts), fund transfer with a 3-step wizard (form → confirm → result), paginated transaction history, account management with avatar upload, and an admin panel that is only visible to ADMIN-role users.

---

## 4. Scalability and High Availability

### Horizontal Scaling

The transaction-service, account-service, and auth-service are all **stateless** — they hold no in-memory state between requests. Session state lives in Redis; file state lives in S3. This means any number of replicas can run concurrently behind the Nginx load balancer without session affinity. Scaling is a single Docker Compose command:

```bash
docker compose up --scale transaction-service=3
```

In production, ECS task count is adjusted via the AWS console or autoscaling policies triggered by CPU/memory metrics from CloudWatch.

### Database Scaling

PostgreSQL uses HikariCP connection pooling (10 connections per service). For production scale, AWS RDS with read replicas routes read queries (balance history, account listing) to replicas, preserving write throughput on the primary. The Outbox Relay only reads and writes to the primary.

### Kafka Partitioning

Each Kafka topic is configured with 3 partitions, allowing 3 consumer instances per consumer group to process events in parallel. The notification-service can scale to 3 replicas for higher email throughput.

---

## 5. Deployment and DevOps

### Local Deployment (Docker Compose)

```bash
cp .env.example .env  # fill in GOOGLE_CLIENT_ID and JWT_SECRET
docker compose up --build
```

All 12 containers (4 services + gateway + frontend + PostgreSQL + Redis + Kafka + Zookeeper + Mailhog + MinIO) start in the correct dependency order using health checks. The database schema is initialised from `infra/sql/init.sql` with sample data.

### Production Deployment (AWS ECS)

The GitHub Actions pipeline (`.github/workflows/ci-cd.yml`) runs on every push to `main`:
1. Runs unit and integration tests for all backend services
2. Builds React frontend and checks ESLint
3. Builds Docker images for all services and pushes to Amazon ECR
4. Issues `aws ecs update-service --force-new-deployment` for each service
5. Waits for ECS to confirm the new task set is stable

Infrastructure resources used: ECS Fargate (compute), RDS PostgreSQL (database), ElastiCache Redis (cache), MSK Kafka (messaging), S3 (file storage), CloudFront (frontend CDN), ACM (TLS certificates), Secrets Manager (environment secrets).

### Monitoring

Prometheus scrapes `/actuator/prometheus` endpoints from all four services every 15 seconds. Grafana (pre-configured at `localhost:3001`) visualises request rates, JVM heap, Kafka consumer lag, and database connection pool utilisation.

---

## 6. Challenges Faced

**Transactional consistency across async boundaries.** The hardest design challenge was guaranteeing that Kafka events are never lost if the broker is unavailable at the moment of a transfer. Naïvely calling `kafkaTemplate.send()` inside the transaction would fail silently if Kafka was down. The Outbox Pattern resolved this — the event payload is persisted to PostgreSQL atomically with the transaction, and the relay publishes it later when Kafka is available.

**Optimistic vs pessimistic locking.** Initially the Account entity used `@Version` for optimistic locking. Under concurrent transfer load this caused frequent `ObjectOptimisticLockingFailureException` exceptions that required client-side retries. Switching to pessimistic write locks (`SELECT FOR UPDATE`) at the database level was simpler and provided stronger guarantees for financial operations.

**S3 / MinIO local development parity.** AWS SDK v2 requires `pathStyleAccessEnabled(true)` for MinIO but not for real S3. Conditionally applying this setting based on whether `AWS_ENDPOINT` is set allowed the same code to work in both environments without branching.

**Google OAuth ID token verification latency.** Verifying the Google ID token against Google's public keys on every login request added ~300ms of latency. Caching the verified user in Redis after the first login reduced subsequent logins to a Redis lookup (~2ms).

---

## 7. Lessons Learned

- **Microservices complexity is real.** What would be a single service in a monolith becomes 4 services, each needing its own health checks, configuration, security filter chain, and Kafka consumer. A monolith would have been faster to build — microservices pay off at scale.
- **The Outbox Pattern is essential for reliable event-driven systems.** Any system that publishes events after a database write should use it. Without it, a Kafka outage silently drops events.
- **Docker Compose health checks are critical.** Without them, services start before their dependencies are ready, causing cascade failures on startup. The `depends_on: condition: service_healthy` pattern eliminated all race conditions.
- **Stateless services are non-negotiable for horizontal scaling.** Moving all state (session, cache) to Redis from day one made horizontal scaling trivial.
- **Environment-based configuration enables cloud portability.** Every environment-specific value (endpoints, credentials, region) is an environment variable. The same Docker image runs locally with MinIO and in production with real AWS S3.

---

*University of Ruhuna · Faculty of Engineering · EC7205 Cloud Computing · Assignment 2 · April 2026*
