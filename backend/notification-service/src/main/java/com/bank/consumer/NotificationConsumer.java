package com.bank.consumer;

import com.bank.service.EmailService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationConsumer {

    private final EmailService emailService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "txn.completed", groupId = "notification-service-group")
    public void onTransactionCompleted(String payload) {
        try {
            Map<String, String> data = objectMapper.readValue(payload, Map.class);
            log.info("Received txn.completed event for txn: {}", data.get("transactionId"));

            String type = data.getOrDefault("type", "TRANSFER");

            if ("TRANSFER".equals(type)) {
                // Notify sender
                emailService.sendTransferSentEmail(
                    data.get("fromEmail"),
                    data.get("reference"),
                    data.get("amount"),
                    data.get("currency")
                );
                // Notify recipient
                emailService.sendTransferReceivedEmail(
                    data.get("toEmail"),
                    data.get("reference"),
                    data.get("amount"),
                    data.get("currency")
                );
            } else if ("DEPOSIT".equals(type)) {
                emailService.sendDepositEmail(
                    data.get("toEmail"),
                    data.get("amount"),
                    data.get("currency")
                );
            }

        } catch (Exception e) {
            log.error("Failed to process txn.completed event: {}", payload, e);
        }
    }

    @KafkaListener(topics = "txn.failed", groupId = "notification-service-group")
    public void onTransactionFailed(String payload) {
        try {
            Map<String, String> data = objectMapper.readValue(payload, Map.class);
            log.warn("Received txn.failed event for txn: {}", data.get("transactionId"));
            emailService.sendTransactionFailedEmail(
                data.get("fromEmail"),
                data.get("reference"),
                data.getOrDefault("reason", "Transaction could not be processed")
            );
        } catch (Exception e) {
            log.error("Failed to process txn.failed event: {}", payload, e);
        }
    }

    @KafkaListener(topics = "notification.send", groupId = "notification-service-group")
    public void onNotificationSend(String payload) {
        try {
            Map<String, String> data = objectMapper.readValue(payload, Map.class);
            emailService.sendGenericEmail(
                data.get("to"),
                data.get("subject"),
                data.get("body")
            );
        } catch (Exception e) {
            log.error("Failed to process notification.send event: {}", payload, e);
        }
    }
}
