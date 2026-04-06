# CloudBank — Mini Banking System
**University of Ruhuna · Faculty of Engineering · EC7205 Cloud Computing · Assignment 2**

A cloud-native, microservices-based banking system demonstrating scalability, high availability,
secure authentication, asynchronous messaging, and modern deployment practices.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    CLIENT (React + Vite)                      │
│              Google OAuth · JWT session · Recharts            │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTP
┌─────────────────────────▼────────────────────────────────────┐
│              API GATEWAY  (Nginx)                             │
│   Rate limiting · HTTPS · CORS · Reverse proxy routing        │
└──┬──────────┬───────────┬──────────────┬─────────────────────┘
   │          │           │              │   REST (sync)
┌──▼──┐  ┌───▼───┐  ┌────▼────┐  ┌─────▼──────┐
│Auth │  │Account│  │Transact.│  │Notif.      │  Spring Boot services
│8081 │  │ 8082  │  │  8083   │  │ 8084       │
└──┬──┘  └───┬───┘  └────┬────┘  └─────┬──────┘
   │          │           │  Outbox→     │ Kafka (async)
   │    ┌─────▼───────────▼─────────────▼──────┐
   │    │         KAFKA EVENT BUS               │
   │    │  txn.created · txn.completed · txn.   │
   │    │  failed · notification.send · audit   │
   │    └──────────────────────────────────────┘
   │
┌──▼──────────────────────────────────────────────┐
│  DATA LAYER                                      │
│  PostgreSQL (ACID) · Redis (cache/session) · S3  │
└──────────────────────────────────────────────────┘
```

## Overview
 
CloudBank is a production-grade, cloud-native banking platform demonstrating every major cloud-computing concept required by EC7205:
 
| Concept | Implementation |
|---|---|
| Microservices Architecture | 4 independently deployable Spring Boot services |
| Asynchronous Messaging | Apache Kafka with Transactional Outbox Pattern |
| Event-Driven Design | Choreography-based Saga for distributed consistency |
| Caching | Redis — balance cache, session store, JWT blacklist |
| ACID Transactions | PostgreSQL with pessimistic locking for fund transfers |
| Object Storage | AWS S3 / MinIO abstraction for profile photos |
| Containerisation | Docker Compose (12 containers, health-checked startup) |
| CI/CD | GitHub Actions → Amazon ECR → ECS Fargate |
| Observability | Prometheus metrics + Grafana dashboards |
| Security | Google OAuth 2.0 → JWT (HS256) → RBAC |

**What users can do:**
- Sign in with Google (OAuth 2.0)
- Open savings or current accounts
- Transfer funds between accounts with full ACID guarantees
- Receive HTML email confirmations for every transaction
- Upload profile photos stored in S3-compatible storage
- View paginated transaction history with real-time balance updates

### Microservices
 
| Service | Port | Responsibility |
|---|---|---|
| **auth-service** | 8081 | Google OAuth 2.0 ID token verification, JWT issuance (HS256), Redis session, token blacklisting on logout |
| **account-service** | 8082 | Account CRUD, balance enquiry with Redis caching (60s TTL), S3/MinIO profile photo upload, admin freeze/unfreeze |
| **transaction-service** | 8083 | ACID fund transfers (pessimistic locking), Choreography Saga coordinator, Transactional Outbox relay, Kafka event publication |
| **notification-service** | 8084 | Kafka consumer, styled HTML email dispatch via SMTP (Mailhog locally, SendGrid/SES in production) |
| **api-gateway** | 80/443 | Nginx reverse proxy — rate limiting (10 req/min auth, 30 req/min API), CORS, JWT header forwarding, SSL termination |
| **frontend** | 3000 | React + Vite SPA — dashboard, transfer wizard, transaction history, avatar upload, admin panel |

---

## Choreography-based Saga Design

<img width="650" height="620" alt="image" src="https://github.com/user-attachments/assets/8ff82c79-bb8d-4792-be65-face6affa87d" />




### Communication Patterns
 
**Synchronous (REST over HTTP)**
All client-facing operations use REST. The API Gateway routes requests and forwards the validated JWT. Used for: login, account creation, balance lookup, initiating transfers, admin operations, and history queries. These operations require an immediate response.
 
**Asynchronous (Apache Kafka + Transactional Outbox)**
After a transaction completes, the transaction-service writes a Kafka payload to the `outbox` table *within the same database transaction*. The `OutboxRelay` component polls every second and publishes unpublished events to Kafka. The notification-service reacts independently. This fully decouples the notification path - a slow or unavailable mail server never delays a transfer.

```
Kafka Topics         Partitions   Purpose
──────────────────────────────────────────────────────────
txn.completed             3       Successful transfer/deposit
txn.failed                3       Validation or system failure
notification.send         1       Generic notification trigger
audit.log                 1       Immutable audit trail
```

### Data Layer
 
**PostgreSQL** - primary relational store for all persistent data. Chosen for ACID compliance, essential for financial data integrity. Tables: `users`, `accounts`, `transactions`, `outbox_events`, `saga_state`. HikariCP connection pool (10 connections per service).

**Redis** - three independent namespaces on the same instance:
 
| Key pattern | TTL | Set by | Read by | Purpose |
|---|---|---|---|---|
| `session:{userId}` | 24h | Auth | Auth | Email/profile cache, avoids DB on every JWT validation |
| `balance:{accountId}` | 60s | Account | Account | Balance read cache, invalidated on write |
| `blacklist:{token}` | token's remaining TTL | Auth | Auth | Logout - renders JWT invalid before natural expiry |
 
**AWS S3 / MinIO** - object storage for profile photos. The `S3Service` reads `AWS_ENDPOINT`: if set, routes to local MinIO; if unset, uses real AWS S3. No code changes between environments. Returns pre-signed URLs (1hr validity) so the browser fetches photos directly from S3 - zero backend bandwidth for image serving.
 
---

## 🔑 Key Design Patterns
 
### Choreography-Based Saga
 
CloudBank uses a **choreography-based saga** - there is no central orchestrator. Each service reacts to Kafka events and acts autonomously. This contrasts with orchestration (where a central `SagaOrchestrator` issues commands and awaits replies).
 
```
Transfer Request Flow
─────────────────────────────────────────────────────────────────────
 
  Client ──POST /transfer──► Transaction Service
                                     │
                    ┌────────────────▼────────────────────────┐
                    │         @Transactional (single commit)   │
                    │                                          │
                    │  1. PESSIMISTIC_WRITE lock both accounts │
                    │  2. Validate: ACTIVE status + balance    │
                    │  3. Debit fromAccount                    │
                    │  4. Credit toAccount                     │
                    │  5. INSERT transaction (COMPLETED)       │
                    │  6. INSERT outbox_event (published=false)│
                    └────────────────┬────────────────────────┘
                                     │  commit
                                     │
                    ┌────────────────▼────────────────────────┐
                    │         OutboxRelay (every 1s)           │
                    │  Polls outbox WHERE published = false    │
                    │  → kafkaTemplate.send("txn.completed")  │
                    │  → marks published = true after ACK     │
                    └────────────────┬────────────────────────┘
                                     │  Kafka event
                                     │
                    ┌────────────────▼────────────────────────┐
                    │       Notification Service               │
                    │  Consumes txn.completed                  │
                    │  → sendTransferSentEmail(sender)         │
                    │  → sendTransferReceivedEmail(recipient)  │
                    └─────────────────────────────────────────┘
 
 
Failure / Compensation Path
─────────────────────────────────────────────────────────────────────
 
  Insufficient funds / frozen account
       │
       ▼
  IllegalStateException thrown inside @Transactional
       │
       ▼
  Full rollback — NO debit, NO credit, NO outbox row
       │
       ▼
  HTTP 400 returned to client immediately
       │
       (if failure occurs AFTER commit but Kafka is down)
       ▼
  OutboxRelay retries until Kafka is available
  → txn.failed consumed by Notification Service
  → sendTransactionFailedEmail dispatched
```
 
**Why choreography?** Lower coupling — Transaction Service doesn't need to know Notification Service exists. Adding a new reaction (e.g. fraud detection, audit logging) requires only a new Kafka consumer, not changes to the transaction flow.
 
### Transactional Outbox Pattern
 
This pattern solves the **dual-write problem**: how to update the database and publish a Kafka event atomically when they are two separate systems.
 
```
❌  NAIVE (broken) approach:
    transactionRepository.save(txn);        // DB write succeeds
    kafkaTemplate.send("txn.completed");    // Kafka is down → event lost forever
                                            // Money moved, no notification, ever
 
✅  OUTBOX (safe) approach:
    @Transactional {
      transactionRepository.save(txn);      // DB write 1
      outboxRepository.save(outboxEvent);   // DB write 2  ← same transaction
    }
    // OutboxRelay polls and retries until Kafka accepts the event
    // at-least-once delivery guaranteed even across Kafka restarts
```
 
The `outbox_events` table acts as a durable queue. The relay thread provides **at-least-once delivery** — the notification service must tolerate duplicate events (idempotent consumers).
 
> **Reference:** This pattern is described in detail in [Saga Orchestration for Microservices Using the Outbox Pattern — InfoQ](https://www.infoq.com/articles/saga-orchestration-outbox/) and implemented in the [saga-orchestration reference project](https://github.com/semotpan/saga-orchestration).
 
### ACID Fund Transfers
 
Every fund transfer acquires a `SELECT ... FOR UPDATE` (pessimistic write lock) on both account rows before reading any balance. This prevents the classic lost-update race condition:
 
```
Without locking (broken):                With PESSIMISTIC_WRITE (safe):
──────────────────────────────────────   ──────────────────────────────
Thread A reads Alice: $500               Thread A locks Alice + Bob rows
Thread B reads Alice: $500               Thread B BLOCKS waiting for lock
Thread A subtracts $400 → writes $100    Thread A: debit/credit/commit
Thread B subtracts $400 → writes $100   Thread B: acquires lock, reads $100
Alice now has -$300  ← CORRUPT           Thread B: "Insufficient funds" ← CORRECT
```
 
The lock is held for the entire `@Transactional` method duration. Transactions are kept short to minimise lock contention.
 
### Redis Caching Strategy
 
```
GET /api/v1/accounts/{id}
 
  ┌─────────────────────────────────────────┐
  │  Check Redis: GET balance:{accountId}   │
  └──────────────┬──────────────────────────┘
                 │
        ┌────────▼────────┐
        │   Cache HIT?    │
        └────────┬────────┘
        YES ◄────┘    └────► NO
         │                    │
         ▼                    ▼
  Return cached          Query PostgreSQL
  balance (~2ms)         (~120ms)
  source: "cache"              │
                               ▼
                        Write to Redis
                        TTL = 60 seconds
                               │
                               ▼
                        Return balance
                        source: "db"
 
  Cache invalidated on:
    - Balance change (transfer, deposit)
    - Account status change (freeze/unfreeze)
```
 
---
 
## 🔒 Security Model
 
```
Request Lifecycle
──────────────────────────────────────────────────────────────────────
 
  Browser ──► Nginx (TLS termination, rate limit check)
                    │
                    ▼
              JwtAuthFilter (every service, stateless)
                    │
                    ├── No Bearer header? ──► Continue as anonymous
                    │
                    ├── Invalid signature? ──► Continue as anonymous
                    │                         (log debug, no 401)
                    │
                    └── Valid JWT ──► Set SecurityContext
                                      principal = userId
                                      authorities = ROLE_USER / ROLE_ADMIN
                                          │
                                          ▼
                                    @PreAuthorize checks
                                    (admin endpoints only)
```
 
| Layer | Mechanism | Detail |
|---|---|---|
| **Identity** | Google OAuth 2.0 | ID token verified server-side against Google's public keys |
| **Token** | JWT HS256 | Contains `userId` (subject) + `role` claim; shared secret across all services |
| **Session** | Redis | 24h TTL; `session:{userId}` maps to email without DB lookup |
| **Logout** | JWT Blacklist | Token stored in Redis with remaining TTL; renders it invalid immediately |
| **Rate limiting** | Nginx | 10 req/min on `/api/v1/auth/*`; 30 req/min on all other API paths; burst 5 |
| **RBAC** | Spring Security | `hasRole("ADMIN")` on all `/api/v1/admin/**` endpoints |
| **Input** | Jakarta Validation | `@NotNull`, `@DecimalMin`, `@Size` on all request DTOs |
| **SQL injection** | JPA parameterised | All queries use `?` placeholders or JPQL named params |
| **Secrets** | Environment variables | `.env` excluded from git; AWS Secrets Manager in production |
| **Transport** | HTTPS | TLS at Nginx; HTTP Strict Transport Security header in production |
 
**Important JWT design note:** Each service verifies the JWT signature locally using the shared `jwt.secret`. No network call to auth-service is made per request — this is pure stateless verification (HMAC-SHA256 in memory, ~0.1ms). The tradeoff: services do not check the Redis blacklist, so a logged-out token remains valid on Account/Transaction services until natural expiry. Acceptable for this use case; production systems may add a blacklist check or use short-lived tokens (15 min) with refresh tokens.
 
---
 
## 📈 Scalability & High Availability
 
### Horizontal Scaling
 
All services are **fully stateless** — no in-memory session, no local file state. Session data lives in Redis; files live in S3. Any replica can serve any request without affinity.
 
```bash
# Scale transaction-service to 3 replicas — zero config changes
docker compose up --scale transaction-service=3 -d
 
# Nginx automatically round-robins across all healthy instances
docker ps | grep transaction-service
```
 
In production, ECS Fargate autoscaling adjusts replica count based on CPU/memory metrics from CloudWatch.
 
### Kafka Partitioning
 
```
Topic             Partitions   Max parallel consumers   Use case
────────────────────────────────────────────────────────────────────
txn.completed          3            3                  Email on success
txn.failed             3            3                  Email on failure
notification.send      1            1                  Generic emails
audit.log              1            1                  Ordered audit trail
```
 
Scale notification-service to 3 replicas to match `txn.completed` partition count and triple email throughput.
 
### Database Connection Management
 
```
Service                HikariCP pool size
──────────────────────────────────────────
auth-service                 8
account-service              8
transaction-service         10 (higher — holds locks during transfers)
```
 
In production, RDS PostgreSQL with read replicas routes balance-history and account-listing queries to replicas, preserving write throughput on the primary. The Outbox Relay runs on the primary only.
 
---



## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 24+
- [Docker Compose](https://docs.docker.com/compose/) v2.20+
- Java 17+ (for local development without Docker)
- Node.js 20+ (for local frontend development)
- A Google Cloud project with OAuth 2.0 credentials

---

## Quick Start (Docker — recommended)

### 1. Clone the repository
```bash
git clone https://github.com/your-team/cloudbank.git
cd cloudbank
```

### 2. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your values:
#   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
#   JWT_SECRET=your-long-random-secret
```

### 3. Set up Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID (Web Application)
3. Add `http://localhost:3000` to **Authorized JavaScript origins**
4. Add `http://localhost:80/api/v1/auth/google` to **Authorized redirect URIs**
5. Copy the Client ID into `.env`

### 4. Start all services
```bash
docker compose up --build
```

Wait for all services to be healthy (~60 seconds on first run).

### 5. Access the application

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API Gateway | http://localhost:80 |
| Mailhog (email UI) | http://localhost:8025 |
| MinIO Console (S3) | http://localhost:9001 (minioadmin / minioadmin) |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin / admin) |
| Kafka | localhost:9092 |

---

## Scaling Services (Horizontal)

To demonstrate scalability, spin up additional transaction-service replicas:
```bash
docker compose up --scale transaction-service=3
```
Nginx automatically load-balances across all three instances. Sessions are stateless (JWT + Redis), so any replica can serve any request.

---

## Local Development (without Docker)

### Backend
```bash
# Start infrastructure only
docker compose up postgres redis kafka zookeeper mailhog minio -d

# Run a service
cd backend/transaction-service
mvn spring-boot:run
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

---

## API Reference

### Auth Service (port 8081)
```
POST /api/v1/auth/google      — Exchange Google credential for JWT
GET  /api/v1/auth/me          — Get current user profile (requires JWT)
POST /api/v1/auth/logout      — Blacklist JWT in Redis
```

### Account Service (port 8082)
```
GET  /api/v1/accounts             — List accounts for user
POST /api/v1/accounts             — Create new account
GET  /api/v1/accounts/{id}        — Account detail (Redis cached)
POST /api/v1/accounts/avatar      — Upload profile photo (S3/MinIO)
PUT  /api/v1/admin/accounts/{id}/freeze    — Admin: freeze account
PUT  /api/v1/admin/accounts/{id}/unfreeze  — Admin: unfreeze account
```

### Transaction Service (port 8083)
```
POST /api/v1/transactions/transfer      — ACID fund transfer
POST /api/v1/transactions/deposit       — Deposit funds
GET  /api/v1/transactions/history/{id}  — Paginated history
```

---

## Key Design Decisions

### ACID Transactions
Fund transfers use PostgreSQL pessimistic row locks (`SELECT ... FOR UPDATE`) to prevent race conditions. Both the debit and credit happen in a single database transaction — either both succeed or both roll back.

### Transactional Outbox Pattern
After a transfer completes, the service writes a Kafka event to an `outbox` table **in the same database transaction**. A background relay thread polls this table and publishes to Kafka. This guarantees that events are never lost even if Kafka is temporarily unavailable.

### Redis for Two Jobs
- **Session cache**: user IDs mapped to emails, TTL 24h, avoids DB lookup on every request
- **Balance cache**: account balances cached 60s, invalidated on update
- **JWT blacklist**: logged-out tokens stored with their remaining TTL

### S3 / MinIO Abstraction
`S3Service` is configured via environment variables. In development, `AWS_ENDPOINT=http://minio:9000` routes to local MinIO. In production, leave `AWS_ENDPOINT` blank to use real AWS S3. No code changes required.

---

## Security

| Mechanism | Implementation |
|---|---|
| Authentication | Google OAuth 2.0 ID token → verified server-side |
| Authorization | JWT (HS256) · Role claims (USER/ADMIN) |
| Session | Redis with 24h TTL |
| Logout | JWT blacklisted in Redis |
| Rate limiting | Nginx: 30 req/min API, 10 req/min auth |
| Input validation | Jakarta Bean Validation on all DTOs |
| Secrets | Environment variables (never hardcoded) |
| Transport | HTTPS in production (TLS at Nginx) |

---

## Deployment to AWS

### Pre-requisites
- AWS CLI configured
- ECR repositories created
- ECS cluster `bank-cluster` with services defined
- RDS PostgreSQL + ElastiCache Redis + MSK (Kafka) provisioned

### Deploy
Push to `main` branch → GitHub Actions pipeline:
1. Runs tests
2. Builds Docker images
3. Pushes to ECR
4. Updates ECS services with new image tags
5. Waits for deployment stability


---


## Dataset / Demo Accounts

Pre-loaded by `infra/sql/init.sql`:

| Email | Role | Account | Balance |
|---|---|---|---|
| alice@example.com | USER | ACC-0000001 | $5,000.00 |
| bob@example.com | USER | ACC-0000002 | $3,000.00 |
| admin@bank.com | ADMIN | — | — |

---

*University of Ruhuna · Faculty of Engineering · EC7205 Cloud Computing · April 2026*
