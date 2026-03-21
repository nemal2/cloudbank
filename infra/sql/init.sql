-- ============================================================
--  Banking System - PostgreSQL Schema
--  University of Ruhuna · EC7205 Cloud Computing Assignment 2
-- ============================================================

-- ── Users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub    VARCHAR(255) UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    full_name     VARCHAR(255) NOT NULL,
    avatar_url    TEXT,
    role          VARCHAR(50)  NOT NULL DEFAULT 'USER',  -- USER | ADMIN
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Accounts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL REFERENCES users(id),
    account_number VARCHAR(20)  NOT NULL UNIQUE,
    account_type   VARCHAR(50)  NOT NULL DEFAULT 'SAVINGS', -- SAVINGS | CHECKING
    balance        DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
    currency       VARCHAR(3)   NOT NULL DEFAULT 'USD',
    status         VARCHAR(50)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | FROZEN | CLOSED
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_account_number ON accounts(account_number);

-- ── Transactions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_account_id   UUID          REFERENCES accounts(id),
    to_account_id     UUID          REFERENCES accounts(id),
    amount            DECIMAL(19,4) NOT NULL,
    currency          VARCHAR(3)    NOT NULL DEFAULT 'USD',
    type              VARCHAR(50)   NOT NULL,  -- TRANSFER | DEPOSIT | WITHDRAWAL
    status            VARCHAR(50)   NOT NULL DEFAULT 'PENDING',
    -- PENDING | COMPLETED | FAILED | REVERSED
    description       TEXT,
    reference         VARCHAR(100)  UNIQUE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ,
    CONSTRAINT amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_transactions_from_account ON transactions(from_account_id);
CREATE INDEX idx_transactions_to_account   ON transactions(to_account_id);
CREATE INDEX idx_transactions_status       ON transactions(status);
CREATE INDEX idx_transactions_created_at   ON transactions(created_at DESC);

-- ── Saga State (Orchestrator) ───────────────────────────────
CREATE TABLE IF NOT EXISTS saga_state (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saga_type    VARCHAR(100) NOT NULL,  -- bank-transfer
    payload      JSONB        NOT NULL,
    saga_status  VARCHAR(50)  NOT NULL DEFAULT 'STARTED',
    -- STARTED | COMPLETING | ABORTING | COMPLETED | ABORTED
    step_status  VARCHAR(50)  NOT NULL DEFAULT 'STARTED',
    -- STARTED | SUCCEEDED | FAILED | COMPENSATING | COMPENSATED
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Outbox Table (Transactional Outbox Pattern) ─────────────
CREATE TABLE IF NOT EXISTS outbox (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id    VARCHAR(255) NOT NULL,
    aggregate_type  VARCHAR(100) NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    payload         JSONB        NOT NULL,
    published       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbox_unpublished ON outbox(published, created_at) WHERE published = FALSE;

-- ── Audit Log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         REFERENCES users(id),
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id   UUID,
    details     JSONB,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id    ON audit_log(user_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at DESC);

-- ── Sample Data ────────────────────────────────────────────
INSERT INTO users (id, email, full_name, role, google_sub)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@bank.com',   'Admin User',   'ADMIN', NULL),
  ('00000000-0000-0000-0000-000000000002', 'alice@example.com','Alice Johnson', 'USER', NULL),
  ('00000000-0000-0000-0000-000000000003', 'bob@example.com',  'Bob Smith',     'USER', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO accounts (id, user_id, account_number, account_type, balance, currency)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'ACC-0000001', 'SAVINGS',  5000.0000, 'USD'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'ACC-0000002', 'CHECKING', 3000.0000, 'USD')
ON CONFLICT DO NOTHING;
