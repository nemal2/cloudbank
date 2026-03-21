# Demo Script — CloudBank (20 min max)

## Setup before recording
```bash
docker compose up --build   # wait for all services healthy
open http://localhost:8025   # Mailhog — email capture UI
open http://localhost:3001   # Grafana monitoring
open http://localhost:3000   # CloudBank app
```

---

## Section 1 — Architecture Overview (4 min)

**Show:** the architecture diagram from the README / report.

**Explain:**
- 4 Spring Boot microservices behind an Nginx API Gateway
- React + Vite frontend
- PostgreSQL for ACID transactions, Redis for caching and sessions
- Kafka for async event-driven notifications (Outbox Pattern)
- MinIO (S3-compatible) for local object storage
- Prometheus + Grafana for monitoring

**Show:** `docker-compose.yml` — point out the 12 services and health-check dependencies.

**Show:** `docker ps` in terminal — all containers running and healthy.

---

## Section 2 — Google OAuth Login (2 min)

**Show:** `http://localhost:3000/login`
- Click "Sign in with Google"
- Complete Google OAuth flow
- Redirect to dashboard

**Explain:**
- Google returns an ID token (JWT signed by Google)
- auth-service verifies it against Google's public keys
- Issues our own JWT containing userId and role
- JWT stored in Redis for 24h session; also in localStorage for subsequent requests

**Show:** Redis CLI:
```bash
docker exec -it bank-redis redis-cli -a redispass keys "session:*"
```

---

## Section 3 — Create Account (2 min)

**Show:** Navigate to Accounts → "New Account"
- Choose SAVINGS, USD → Create

**Show:** PostgreSQL:
```bash
docker exec -it bank-postgres psql -U bankuser -d bankdb \
  -c "SELECT account_number, account_type, balance, status FROM accounts;"
```

**Explain:** Account number auto-generated. Balance starts at 0.

---

## Section 4 — Fund Transfer — Success path (4 min)

**Show:** Transfer page
- From: Alice's account (ACC-0000001, $5000 balance)
- To: Bob's account ID (paste the UUID from AccountsPage)
- Amount: $500
- Description: "Demo transfer"
- Click Review → Confirm

**Show:** Success screen with reference number.

**Show:** Mailhog `http://localhost:8025`
- Two emails arrived: "Transfer Sent" to Alice, "Funds Received" to Bob
- Open one — show the HTML email template

**Show:** transaction history — completed row visible.

**Explain flow:**
1. REST call → API Gateway → transaction-service
2. Pessimistic lock on both account rows in PostgreSQL
3. Debit Alice, credit Bob — single ACID transaction
4. Outbox event written atomically in same transaction
5. OutboxRelay polls every second → publishes to Kafka `txn.completed` topic
6. notification-service consumes event → sends emails via SMTP

---

## Section 5 — Fund Transfer — Failure path (2 min)

**Show:** Transfer page
- Amount: $999,999 (more than Alice's balance)
- Confirm

**Show:** Error screen — "Insufficient funds"

**Explain:** No money was moved. The transaction rolled back before any balance was changed. No Kafka event was published. The Outbox table has no new row.

```bash
docker exec -it bank-postgres psql -U bankuser -d bankdb \
  -c "SELECT * FROM outbox ORDER BY created_at DESC LIMIT 5;"
```

---

## Section 6 — Redis Cache Demo (2 min)

**Show:** Redis CLI:
```bash
docker exec -it bank-redis redis-cli -a redispass keys "balance:*"
docker exec -it bank-redis redis-cli -a redispass get "balance:<account-id>"
```

**Explain:** First account lookup hits PostgreSQL (cache miss), writes to Redis. Second request served from Redis — ~60x faster. Cache invalidated on any balance update.

---

## Section 7 — Profile Photo Upload (S3) (1 min)

**Show:** Accounts page → Upload Photo → select an image file.

**Show:** MinIO Console `http://localhost:9001`
- Login: minioadmin / minioadmin
- Browse `bank-profiles` bucket → `avatars/` folder → file visible

**Explain:** Pre-signed URL returned — client displays image directly from S3, backend not involved.

---

## Section 8 — Horizontal Scaling (1 min)

**Show:** In a terminal:
```bash
docker compose up --scale transaction-service=3 -d
docker ps | grep transaction
```

**Explain:** Nginx round-robins across 3 instances. Sessions are in Redis so any instance serves any request. Zero downtime scaling.

---

## Section 9 — Admin Panel (1 min)

**Show:** Login as admin@bank.com (or set role=ADMIN in DB first).

**Show:** Admin panel — user list, freeze/unfreeze account button.

**Explain:** RBAC enforced at two layers:
1. React Router — non-ADMIN users are redirected at the browser
2. Spring Security — `hasRole("ADMIN")` on admin endpoints; a non-ADMIN JWT gets HTTP 403 even if they call the API directly

---

## Section 10 — Monitoring (1 min)

**Show:** Prometheus `http://localhost:9090`
- Query: `http_server_requests_seconds_count`

**Show:** Grafana `http://localhost:3001`
- JVM memory, request rate, Kafka consumer lag

**Explain:** All services expose `/actuator/prometheus`. Prometheus scrapes every 15s. In production these metrics trigger AWS CloudWatch alarms and autoscaling policies.

---

## Closing (30 sec)

Summarise:
- Full microservices banking system — login, accounts, ACID transfers, notifications, S3 uploads
- Sync (REST) + async (Kafka/Outbox) communication demonstrated
- Horizontally scalable, Redis-cached, JWT-secured
- One command to deploy: `docker compose up`
- GitHub Actions CI/CD for production push to AWS ECS
