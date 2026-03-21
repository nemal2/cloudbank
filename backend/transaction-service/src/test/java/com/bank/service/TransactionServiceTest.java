package com.bank.service;

import com.bank.dto.TransactionDto;
import com.bank.model.Account;
import com.bank.repository.AccountRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class TransactionServiceTest {

    @Autowired TransactionService transactionService;
    @Autowired AccountRepository  accountRepository;

    private UUID fromId;
    private UUID toId;

    @BeforeEach
    @Transactional
    void setup() {
        Account from = accountRepository.save(Account.builder()
            .userId(UUID.randomUUID())
            .accountNumber("TEST-FROM-" + System.nanoTime())
            .accountType(Account.AccountType.SAVINGS)
            .balance(new BigDecimal("1000.00"))
            .currency("USD")
            .status(Account.AccountStatus.ACTIVE)
            .build());

        Account to = accountRepository.save(Account.builder()
            .userId(UUID.randomUUID())
            .accountNumber("TEST-TO-" + System.nanoTime())
            .accountType(Account.AccountType.SAVINGS)
            .balance(new BigDecimal("500.00"))
            .currency("USD")
            .status(Account.AccountStatus.ACTIVE)
            .build());

        fromId = from.getId();
        toId   = to.getId();
    }

    @Test
    void transfer_succeeds_and_balances_update() {
        var req = new TransactionDto.TransferRequest();
        req.setFromAccountId(fromId);
        req.setToAccountId(toId);
        req.setAmount(new BigDecimal("250.00"));
        req.setDescription("Test transfer");

        var result = transactionService.transfer(req);

        assertThat(result.getStatus()).isEqualTo("COMPLETED");
        assertThat(result.getReference()).startsWith("TXN-");

        Account from = accountRepository.findById(fromId).orElseThrow();
        Account to   = accountRepository.findById(toId).orElseThrow();

        assertThat(from.getBalance()).isEqualByComparingTo("750.00");
        assertThat(to.getBalance()).isEqualByComparingTo("750.00");
    }

    @Test
    void transfer_fails_on_insufficient_funds() {
        var req = new TransactionDto.TransferRequest();
        req.setFromAccountId(fromId);
        req.setToAccountId(toId);
        req.setAmount(new BigDecimal("9999.00"));  // more than balance

        assertThatThrownBy(() -> transactionService.transfer(req))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("Insufficient funds");

        // Balances must be unchanged (atomicity)
        Account from = accountRepository.findById(fromId).orElseThrow();
        assertThat(from.getBalance()).isEqualByComparingTo("1000.00");
    }

    @Test
    void transfer_fails_on_same_account() {
        var req = new TransactionDto.TransferRequest();
        req.setFromAccountId(fromId);
        req.setToAccountId(fromId);
        req.setAmount(new BigDecimal("100.00"));

        assertThatThrownBy(() -> transactionService.transfer(req))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void transfer_fails_on_frozen_account() {
        accountRepository.findById(fromId).ifPresent(a -> {
            a.setStatus(Account.AccountStatus.FROZEN);
            accountRepository.save(a);
        });

        var req = new TransactionDto.TransferRequest();
        req.setFromAccountId(fromId);
        req.setToAccountId(toId);
        req.setAmount(new BigDecimal("100.00"));

        assertThatThrownBy(() -> transactionService.transfer(req))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("not active");
    }
}
