package com.bank.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class AccountService {

    private final JdbcTemplate        jdbc;
    private final StringRedisTemplate redis;

    @Value("${bank.account.starter-balance:15.00}")
    private BigDecimal starterBalance;

    private static final String BALANCE_CACHE_PREFIX = "balance:";
    private static final long   CACHE_TTL_SECONDS    = 60;

    public List<Map<String, Object>> getAccountsForUser(UUID userId) {
        String sql = """
            SELECT id, account_number, account_type, balance, currency, status, created_at
            FROM accounts WHERE user_id = ? ORDER BY created_at DESC
            """;
        return jdbc.queryForList(sql, userId);
    }

    public Map<String, Object> getAccountById(UUID accountId) {
        String cacheKey = BALANCE_CACHE_PREFIX + accountId;
        String cached   = redis.opsForValue().get(cacheKey);
        if (cached != null) {
            log.debug("Cache HIT for account balance: {}", accountId);
            return Map.of("id", accountId.toString(), "balance", cached, "source", "cache");
        }
        log.debug("Cache MISS for account balance: {}", accountId);
        String sql = """
            SELECT id, account_number, account_type, balance, currency, status, created_at
            FROM accounts WHERE id = ?
            """;
        Map<String, Object> account = jdbc.queryForMap(sql, accountId);
        redis.opsForValue().set(
            cacheKey,
            account.get("balance").toString(),
            CACHE_TTL_SECONDS,
            TimeUnit.SECONDS
        );
        return account;
    }

    @Transactional
    public Map<String, Object> createAccount(UUID userId, String accountType, String currency) {
        String accountNumber = "ACC-" + String.format("%07d", (int)(Math.random() * 9_999_999));
        String sql = """
            INSERT INTO accounts (user_id, account_number, account_type, balance, currency, status)
            VALUES (?, ?, ?, ?, ?, 'ACTIVE')
            RETURNING id, account_number, account_type, balance, currency, status
            """;
        Map<String, Object> account = jdbc.queryForMap(
            sql, userId, accountNumber, accountType, starterBalance, currency
        );
        log.info("Account created: {} for user {} with starter balance {}",
            accountNumber, userId, starterBalance);
        return account;
    }

    @Transactional
    public void updateAvatarUrl(UUID userId, String url) {
        jdbc.update("UPDATE users SET avatar_url = ? WHERE id = ?", url, userId);
    }

    @Transactional
    public void setAccountStatus(UUID accountId, String status) {
        jdbc.update("UPDATE accounts SET status = ? WHERE id = ?", status, accountId);
        redis.delete(BALANCE_CACHE_PREFIX + accountId);
        log.info("Account {} status set to {}", accountId, status);
    }

    public List<Map<String, Object>> getAllUsersForAdmin() {
        String sql = """
            SELECT u.id, u.email, u.full_name, u.role, u.avatar_url,
                   COUNT(a.id) as account_count
            FROM users u
            LEFT JOIN accounts a ON a.user_id = u.id
            GROUP BY u.id ORDER BY u.created_at DESC
            """;
        return jdbc.queryForList(sql);
    }
}