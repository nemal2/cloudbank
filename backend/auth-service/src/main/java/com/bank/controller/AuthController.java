package com.bank.controller;

import com.bank.model.User;
import com.bank.service.AuthService;
import com.bank.service.JwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthService authService;
    private final JwtService  jwtService;

    /**
     * POST /api/v1/auth/google
     * Accepts a Google ID token (from @react-oauth/google),
     * verifies it, upserts the user, and returns a signed JWT.
     */
    @PostMapping("/google")
    public ResponseEntity<Map<String, Object>> googleLogin(@RequestBody Map<String, String> body) {
        String googleCredential = body.get("credential");
        if (googleCredential == null || googleCredential.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing Google credential"));
        }

        try {
            User user = authService.loginWithGoogle(googleCredential);
            String jwt = jwtService.generateToken(user);

            log.info("User logged in via Google: {} ({})", user.getEmail(), user.getRole());

            return ResponseEntity.ok(Map.of(
                "token", jwt,
                "user", Map.of(
                    "id",       user.getId().toString(),
                    "email",    user.getEmail(),
                    "fullName", user.getFullName(),
                    "avatarUrl",user.getAvatarUrl() != null ? user.getAvatarUrl() : "",
                    "role",     user.getRole().name()
                )
            ));
        } catch (Exception e) {
            log.error("Google login failed: {}", e.getMessage());
            return ResponseEntity.status(401).body(Map.of("error", "Invalid Google credential"));
        }
    }

    /**
     * GET /api/v1/auth/me
     * Returns the currently authenticated user's profile.
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me(@AuthenticationPrincipal User user) {
        if (user == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(Map.of(
            "id",       user.getId().toString(),
            "email",    user.getEmail(),
            "fullName", user.getFullName(),
            "avatarUrl",user.getAvatarUrl() != null ? user.getAvatarUrl() : "",
            "role",     user.getRole().name()
        ));
    }

    /**
     * POST /api/v1/auth/logout
     * Invalidates the JWT by blacklisting in Redis.
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            authService.blacklistToken(token);
        }
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }
}
