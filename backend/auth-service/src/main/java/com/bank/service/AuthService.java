package com.bank.service;

import com.bank.model.User;
import com.bank.repository.UserRepository;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
public class AuthService {

    private final UserRepository      userRepository;
    private final StringRedisTemplate redis;
    private final GoogleIdTokenVerifier verifier;
    private final JwtService          jwtService;

    public AuthService(UserRepository userRepository,
                       StringRedisTemplate redis,
                       JwtService jwtService,
                       @Value("${google.client-id}") String googleClientId) {
        this.userRepository = userRepository;
        this.redis          = redis;
        this.jwtService     = jwtService;
        this.verifier = new GoogleIdTokenVerifier.Builder(
                new NetHttpTransport(), GsonFactory.getDefaultInstance())
            .setAudience(Collections.singletonList(googleClientId))
            .build();
    }

    /**
     * Verify Google ID token, then upsert user in PostgreSQL.
     * Caches user session in Redis (24h TTL).
     */
    @Transactional
    public User loginWithGoogle(String idTokenString) throws Exception {
        GoogleIdToken idToken = verifier.verify(idTokenString);
        if (idToken == null) throw new IllegalArgumentException("Invalid Google ID token");

        GoogleIdToken.Payload payload = idToken.getPayload();
        String googleSub  = payload.getSubject();
        String email      = payload.getEmail();
        String name       = (String) payload.get("name");
        String avatarUrl  = (String) payload.get("picture");

        // Upsert: find by google_sub or email, then create/update
        User user = userRepository.findByGoogleSub(googleSub)
            .or(() -> userRepository.findByEmail(email))
            .map(u -> {
                u.setGoogleSub(googleSub);
                u.setAvatarUrl(avatarUrl);
                if (u.getFullName() == null || u.getFullName().isBlank()) u.setFullName(name);
                return u;
            })
            .orElseGet(() -> {
                User newUser = new User();
                newUser.setGoogleSub(googleSub);
                newUser.setEmail(email);
                newUser.setFullName(name);
                newUser.setAvatarUrl(avatarUrl);
                newUser.setRole(User.Role.USER);
                newUser.setActive(true);
                log.info("New user registered via Google: {}", email);
                return newUser;
            });

        user = userRepository.save(user);

        // Cache user ID in Redis for fast session lookup
        redis.opsForValue().set("session:" + user.getId(), user.getEmail(), 24, TimeUnit.HOURS);

        return user;
    }

    /**
     * Blacklist JWT in Redis so it cannot be reused after logout.
     */
    public void blacklistToken(String token) {
        try {
            long remaining = jwtService.getRemainingValidity(token);
            if (remaining > 0) {
                redis.opsForValue().set("blacklist:" + token, "1", remaining, TimeUnit.MILLISECONDS);
                log.debug("Token blacklisted for {}ms", remaining);
            }
        } catch (Exception e) {
            log.warn("Could not blacklist token: {}", e.getMessage());
        }
    }

    public boolean isTokenBlacklisted(String token) {
        return Boolean.TRUE.equals(redis.hasKey("blacklist:" + token));
    }
}
