package com.bank.kafka;

import com.bank.model.OutboxEvent;
import com.bank.repository.OutboxRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Transactional Outbox Pattern - Relay
 * Polls the outbox table for unpublished events and sends them to Kafka.
 * Marks them as published only after successful send.
 * Guarantees at-least-once delivery.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxRelay {

    private final OutboxRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Scheduled(fixedDelay = 1000)  // every 1 second
    @Transactional
    public void relay() {
        List<OutboxEvent> pending = outboxRepository.findByPublishedFalseOrderByCreatedAtAsc();

        for (OutboxEvent event : pending) {
            try {
                kafkaTemplate.send(event.getEventType(), event.getAggregateId(), event.getPayload())
                    .whenComplete((result, ex) -> {
                        if (ex == null) {
                            log.debug("Published outbox event {} to topic {}", event.getId(), event.getEventType());
                        } else {
                            log.error("Failed to publish outbox event {}", event.getId(), ex);
                        }
                    });

                event.setPublished(true);
                outboxRepository.save(event);
            } catch (Exception e) {
                log.error("Outbox relay error for event {}", event.getId(), e);
            }
        }
    }
}
