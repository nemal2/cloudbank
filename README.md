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

### Services
| Service | Port | Responsibility |
|---|---|---|
| auth-service | 8081 | Google OAuth, JWT issue/verify, Redis session |
| account-service | 8082 | Account CRUD, S3 avatar upload, Redis balance cache |
| transaction-service | 8083 | ACID transfers, Saga orchestrator, Outbox relay |
| notification-service | 8084 | Kafka consumer, email via SMTP (Mailhog/SendGrid) |
| api-gateway (Nginx) | 80 | Rate limiting, routing, CORS, SSL termination |
| frontend | 3000 | React + Vite SPA |

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
