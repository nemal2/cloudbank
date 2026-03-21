package com.bank.controller;

import com.bank.service.AccountService;
import com.bank.service.S3Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/accounts")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "*")
public class AccountController {

    private final AccountService accountService;
    private final S3Service      s3Service;

    private UUID getCurrentUserId() {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth == null || !auth.isAuthenticated() || 
        auth.getPrincipal().toString().equals("anonymousUser")) {
        throw new RuntimeException("Not authenticated");
    }
    return UUID.fromString(auth.getPrincipal().toString());
}

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> listAccounts() {
        return ResponseEntity.ok(accountService.getAccountsForUser(getCurrentUserId()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getAccount(@PathVariable UUID id) {
        return ResponseEntity.ok(accountService.getAccountById(id));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createAccount(@RequestBody Map<String, String> body) {
        String type     = body.getOrDefault("accountType", "SAVINGS");
        String currency = body.getOrDefault("currency", "USD");
        return ResponseEntity.ok(accountService.createAccount(getCurrentUserId(), type, currency));
    }

    @PostMapping("/avatar")
    public ResponseEntity<Map<String, String>> uploadAvatar(
            @RequestParam("file") MultipartFile file) {
        try {
            String key = "avatars/" + getCurrentUserId() + "/" + UUID.randomUUID() + "-" + file.getOriginalFilename();
            String url = s3Service.upload(key, file.getInputStream(), file.getContentType());
            accountService.updateAvatarUrl(getCurrentUserId(), url);
            return ResponseEntity.ok(Map.of("url", url, "message", "Profile photo updated"));
        } catch (Exception e) {
            log.error("Avatar upload failed: {}", e.getMessage());
            return ResponseEntity.status(500).body(Map.of("error", "Upload failed: " + e.getMessage()));
        }
    }

    @PutMapping("/admin/accounts/{id}/freeze")
    public ResponseEntity<Map<String, String>> freeze(@PathVariable UUID id) {
        accountService.setAccountStatus(id, "FROZEN");
        return ResponseEntity.ok(Map.of("message", "Account frozen"));
    }

    @PutMapping("/admin/accounts/{id}/unfreeze")
    public ResponseEntity<Map<String, String>> unfreeze(@PathVariable UUID id) {
        accountService.setAccountStatus(id, "ACTIVE");
        return ResponseEntity.ok(Map.of("message", "Account unfrozen"));
    }
}