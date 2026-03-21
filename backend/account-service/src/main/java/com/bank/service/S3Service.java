package com.bank.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;

/**
 * S3Service — uploads objects to AWS S3 or MinIO (local development).
 * Switch between them via environment variables:
 *   AWS_ENDPOINT=http://minio:9000  → uses MinIO
 *   AWS_ENDPOINT=(unset)            → uses real AWS S3
 */
@Service
@Slf4j
public class S3Service {

    private final S3Client  s3Client;
    private final S3Presigner presigner;
    private final String    bucket;
    private final String    endpoint;

    public S3Service(
            @Value("${aws.s3.bucket:bank-profiles}") String bucket,
            @Value("${aws.endpoint:}") String endpoint,
            @Value("${aws.access-key:}") String accessKey,
            @Value("${aws.secret-key:}") String secretKey,
            @Value("${aws.region:us-east-1}") String region) {

        this.bucket   = bucket;
        this.endpoint = endpoint;

        boolean useMinIO = endpoint != null && !endpoint.isBlank();

        var credProvider = StaticCredentialsProvider.create(
            AwsBasicCredentials.create(
                accessKey.isBlank() ? "minioadmin" : accessKey,
                secretKey.isBlank() ? "minioadmin" : secretKey));

        var builder = S3Client.builder()
            .region(Region.of(region))
            .credentialsProvider(credProvider);

        var presignerBuilder = S3Presigner.builder()
            .region(Region.of(region))
            .credentialsProvider(credProvider);

        if (useMinIO) {
            URI uri = URI.create(endpoint);
            builder.endpointOverride(uri)
                .serviceConfiguration(S3Configuration.builder()
                    .pathStyleAccessEnabled(true)   // required for MinIO
                    .build());
            presignerBuilder.endpointOverride(uri);
            log.info("S3Service configured with MinIO endpoint: {}", endpoint);
        } else {
            log.info("S3Service configured with AWS S3, region: {}", region);
        }

        this.s3Client  = builder.build();
        this.presigner = presignerBuilder.build();

        ensureBucketExists();
    }

    /**
     * Upload a file and return a pre-signed URL (valid 1 hour).
     */
    public String upload(String key, InputStream data, String contentType) {
        try {
            s3Client.putObject(
                PutObjectRequest.builder()
                    .bucket(bucket)
                    .key(key)
                    .contentType(contentType)
                    .build(),
                RequestBody.fromInputStream(data, data.available())
            );

            // Generate pre-signed URL
            var presignReq = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofHours(1))
                .getObjectRequest(r -> r.bucket(bucket).key(key))
                .build();

            String url = presigner.presignGetObject(presignReq).url().toString();
            log.info("Uploaded to S3: bucket={}, key={}", bucket, key);
            return url;

        } catch (Exception e) {
            log.error("S3 upload failed: key={}, error={}", key, e.getMessage());
            throw new RuntimeException("S3 upload failed", e);
        }
    }

    public void delete(String key) {
        s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
    }

    private void ensureBucketExists() {
        try {
            s3Client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
        } catch (NoSuchBucketException e) {
            s3Client.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
            log.info("Created S3 bucket: {}", bucket);
        } catch (Exception e) {
            log.warn("Could not verify S3 bucket: {}", e.getMessage());
        }
    }
}
