package com.bank.config;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    @Bean public NewTopic txnCreated()       { return TopicBuilder.name("txn.created").partitions(3).replicas(1).build(); }
    @Bean public NewTopic txnCompleted()     { return TopicBuilder.name("txn.completed").partitions(3).replicas(1).build(); }
    @Bean public NewTopic txnFailed()        { return TopicBuilder.name("txn.failed").partitions(3).replicas(1).build(); }
    @Bean public NewTopic notificationSend() { return TopicBuilder.name("notification.send").partitions(1).replicas(1).build(); }
    @Bean public NewTopic auditLog()         { return TopicBuilder.name("audit.log").partitions(1).replicas(1).build(); }
}
