package com.bank.service;

import com.bank.dto.TransactionDto;
import com.bank.model.Account;
import com.bank.model.OutboxEvent;
import com.bank.model.Transaction;
import com.bank.repository.AccountRepository;
import com.bank.repository.OutboxRepository;
import com.bank.repository.TransactionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class TransactionService {

    private final TransactionRepository transactionRepository;
    private final AccountRepository accountRepository;
    private final OutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;

    /**
     * Execute a local fund transfer between two accounts.
     * Uses pessimistic locking to prevent race conditions.
     * Writes both the transaction record and an outbox event atomically.
     */
    @Transactional
    public TransactionDto.TransferResponse transfer(TransactionDto.TransferRequest request) {
        log.info("Initiating transfer: {} -> {} amount={}", 
            request.getFromAccountId(), request.getToAccountId(), request.getAmount());

        // Validate accounts exist and are active
        Account fromAccount = accountRepository.findByIdWithLock(request.getFromAccountId())
            .orElseThrow(() -> new IllegalArgumentException("Source account not found"));

        Account toAccount = accountRepository.findByIdWithLock(request.getToAccountId())
            .orElseThrow(() -> new IllegalArgumentException("Destination account not found"));

        if (fromAccount.getStatus() != Account.AccountStatus.ACTIVE) {
            throw new IllegalStateException("Source account is not active");
        }
        if (toAccount.getStatus() != Account.AccountStatus.ACTIVE) {
            throw new IllegalStateException("Destination account is not active");
        }

        // Check sufficient balance
        if (fromAccount.getBalance().compareTo(request.getAmount()) < 0) {
            throw new IllegalStateException("Insufficient funds. Available: " + fromAccount.getBalance());
        }

        // Debit source account
        fromAccount.setBalance(fromAccount.getBalance().subtract(request.getAmount()));
        accountRepository.save(fromAccount);

        // Credit destination account
        toAccount.setBalance(toAccount.getBalance().add(request.getAmount()));
        accountRepository.save(toAccount);

        // Persist transaction record
        String reference = "TXN-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        Transaction txn = Transaction.builder()
            .fromAccountId(fromAccount.getId())
            .toAccountId(toAccount.getId())
            .amount(request.getAmount())
            .currency(fromAccount.getCurrency())
            .type(Transaction.TransactionType.TRANSFER)
            .status(Transaction.TransactionStatus.COMPLETED)
            .description(request.getDescription())
            .reference(reference)
            .completedAt(OffsetDateTime.now())
            .build();

        transactionRepository.save(txn);

        // Write to Outbox (same transaction) — relay will publish to Kafka
        writeOutboxEvent(txn, "txn.completed", Map.of(
            "transactionId", txn.getId().toString(),
            "fromAccountId", fromAccount.getId().toString(),
            "toAccountId", toAccount.getId().toString(),
            "amount", request.getAmount().toString(),
            "currency", txn.getCurrency(),
            "reference", reference,
            "fromEmail", fromAccount.getUserId().toString(), // notification service resolves email
            "toEmail", toAccount.getUserId().toString()
        ));

        log.info("Transfer completed. Reference: {}", reference);
        return TransactionDto.TransferResponse.builder()
            .transactionId(txn.getId())
            .status("COMPLETED")
            .reference(reference)
            .amount(request.getAmount())
            .currency(txn.getCurrency())
            .createdAt(txn.getCreatedAt())
            .message("Transfer successful")
            .build();
    }

    @Transactional
    public TransactionDto.TransferResponse deposit(UUID accountId, BigDecimal amount, String description) {
        Account account = accountRepository.findByIdWithLock(accountId)
            .orElseThrow(() -> new IllegalArgumentException("Account not found"));

        account.setBalance(account.getBalance().add(amount));
        accountRepository.save(account);

        String reference = "DEP-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        Transaction txn = Transaction.builder()
            .toAccountId(accountId)
            .amount(amount)
            .currency(account.getCurrency())
            .type(Transaction.TransactionType.DEPOSIT)
            .status(Transaction.TransactionStatus.COMPLETED)
            .description(description)
            .reference(reference)
            .completedAt(OffsetDateTime.now())
            .build();

        transactionRepository.save(txn);
        writeOutboxEvent(txn, "txn.completed", Map.of(
            "transactionId", txn.getId().toString(),
            "toAccountId", accountId.toString(),
            "amount", amount.toString(),
            "type", "DEPOSIT"
        ));

        return TransactionDto.TransferResponse.builder()
            .transactionId(txn.getId())
            .status("COMPLETED")
            .reference(reference)
            .amount(amount)
            .currency(account.getCurrency())
            .createdAt(txn.getCreatedAt())
            .message("Deposit successful")
            .build();
    }

    @Transactional(readOnly = true)
    public Page<TransactionDto.TransactionDetail> getTransactionHistory(UUID accountId, Pageable pageable) {
        return transactionRepository.findByAccountId(accountId, pageable)
            .map(t -> TransactionDto.TransactionDetail.builder()
                .id(t.getId())
                .fromAccountId(t.getFromAccountId())
                .toAccountId(t.getToAccountId())
                .amount(t.getAmount())
                .currency(t.getCurrency())
                .type(t.getType().name())
                .status(t.getStatus().name())
                .description(t.getDescription())
                .reference(t.getReference())
                .createdAt(t.getCreatedAt())
                .completedAt(t.getCompletedAt())
                .build());
    }

    private void writeOutboxEvent(Transaction txn, String eventType, Map<String, String> payloadData) {
        try {
            String payload = objectMapper.writeValueAsString(payloadData);
            OutboxEvent event = OutboxEvent.builder()
                .aggregateId(txn.getId().toString())
                .aggregateType("Transaction")
                .eventType(eventType)
                .payload(payload)
                .published(false)
                .build();
            outboxRepository.save(event);
        } catch (Exception e) {
            log.error("Failed to write outbox event for transaction {}", txn.getId(), e);
            throw new RuntimeException("Outbox write failed", e);
        }
    }
}
