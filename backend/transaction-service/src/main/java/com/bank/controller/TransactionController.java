package com.bank.controller;

import com.bank.dto.TransactionDto;
import com.bank.service.TransactionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/transactions")
@RequiredArgsConstructor
@Slf4j
public class TransactionController {

    private final TransactionService transactionService;

    /**
     * POST /api/v1/transactions/transfer
     * Transfer funds between two accounts (ACID, pessimistic lock)
     */
    @PostMapping("/transfer")
    public ResponseEntity<TransactionDto.TransferResponse> transfer(
            @Valid @RequestBody TransactionDto.TransferRequest request) {
        log.info("Transfer request received: {} -> {}", request.getFromAccountId(), request.getToAccountId());
        TransactionDto.TransferResponse response = transactionService.transfer(request);
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/v1/transactions/deposit
     * Deposit funds into an account
     */
    @PostMapping("/deposit")
    public ResponseEntity<TransactionDto.TransferResponse> deposit(
            @RequestBody Map<String, String> body) {
        UUID accountId = UUID.fromString(body.get("accountId"));
        BigDecimal amount = new BigDecimal(body.get("amount"));
        String description = body.getOrDefault("description", "Deposit");
        return ResponseEntity.ok(transactionService.deposit(accountId, amount, description));
    }

    /**
     * GET /api/v1/transactions/history/{accountId}
     * Paginated transaction history for an account
     */
    @GetMapping("/history/{accountId}")
    public ResponseEntity<Page<TransactionDto.TransactionDetail>> history(
            @PathVariable UUID accountId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<TransactionDto.TransactionDetail> history = transactionService.getTransactionHistory(
            accountId, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        return ResponseEntity.ok(history);
    }

    // Global exception handler
    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    public ResponseEntity<Map<String, String>> handleBusinessException(RuntimeException ex) {
        log.warn("Business rule violation: {}", ex.getMessage());
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }
}
