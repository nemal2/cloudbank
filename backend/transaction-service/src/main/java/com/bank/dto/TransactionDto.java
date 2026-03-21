package com.bank.dto;

import jakarta.validation.constraints.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public class TransactionDto {

    @Getter @Setter
    public static class TransferRequest {
        @NotNull(message = "Source account is required")
        private UUID fromAccountId;

        @NotNull(message = "Destination account is required")
        private UUID toAccountId;

        @NotNull @DecimalMin(value = "0.01", message = "Amount must be greater than zero")
        private BigDecimal amount;

        @Size(max = 255)
        private String description;
    }

    @Getter @Setter @Builder
    public static class TransferResponse {
        private UUID transactionId;
        private String status;
        private String reference;
        private BigDecimal amount;
        private String currency;
        private OffsetDateTime createdAt;
        private String message;
    }

    @Getter @Setter @Builder
    public static class TransactionDetail {
        private UUID id;
        private UUID fromAccountId;
        private UUID toAccountId;
        private BigDecimal amount;
        private String currency;
        private String type;
        private String status;
        private String description;
        private String reference;
        private OffsetDateTime createdAt;
        private OffsetDateTime completedAt;
    }
}
