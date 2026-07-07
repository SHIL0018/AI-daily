package com.activitydaily.apikey;

import com.activitydaily.common.ApiException;
import com.activitydaily.device.DeviceService;
import com.activitydaily.util.TimeUtil;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ApiKeyService {
    private final JdbcTemplate jdbc;
    private final ApiKeyCrypto crypto;
    private final DeviceService deviceService;

    public ApiKeyService(JdbcTemplate jdbc, ApiKeyCrypto crypto, DeviceService deviceService) {
        this.jdbc = jdbc;
        this.crypto = crypto;
        this.deviceService = deviceService;
    }

    public Map<String, Object> getStatus(String userId) {
        deviceService.ensureActiveUser(userId);
        var rows = jdbc.queryForList("SELECT key_hint, updated_at FROM user_api_keys WHERE user_id=? AND provider='deepseek'", userId);
        if (rows.isEmpty()) return Map.of("provider", "deepseek", "configured", false, "key_hint", "", "updated_at", "");
        var row = rows.get(0);
        return Map.of("provider", "deepseek", "configured", true, "key_hint", row.getOrDefault("key_hint", ""), "updated_at", row.get("updated_at"));
    }

    @Transactional
    public Map<String, Object> save(String userId, String apiKey) {
        deviceService.ensureActiveUser(userId);
        String cleaned = apiKey == null ? "" : apiKey.trim();
        if (cleaned.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMS", "api key required");
        String hint = hint(cleaned);
        int updated = jdbc.update("UPDATE user_api_keys SET api_key_ciphertext=?, key_hint=?, updated_at=? WHERE user_id=? AND provider='deepseek'",
                crypto.encrypt(cleaned), hint, TimeUtil.nowTs(), userId);
        if (updated == 0) {
            jdbc.update("INSERT INTO user_api_keys (user_id, provider, api_key_ciphertext, key_hint, created_at, updated_at) VALUES (?, 'deepseek', ?, ?, ?, ?)",
                    userId, crypto.encrypt(cleaned), hint, TimeUtil.nowTs(), TimeUtil.nowTs());
        }
        return Map.of("provider", "deepseek", "configured", true, "key_hint", hint, "updated_at", TimeUtil.nowTs());
    }

    @Transactional
    public Map<String, Object> delete(String userId) {
        deviceService.ensureActiveUser(userId);
        jdbc.update("DELETE FROM user_api_keys WHERE user_id=? AND provider='deepseek'", userId);
        return Map.of("provider", "deepseek", "configured", false);
    }

    public String getPlainKey(String userId) {
        var rows = jdbc.queryForList("SELECT api_key_ciphertext FROM user_api_keys WHERE user_id=? AND provider='deepseek'", userId);
        return rows.isEmpty() ? "" : crypto.decrypt(String.valueOf(rows.get(0).get("api_key_ciphertext")));
    }

    private String hint(String key) {
        if (key.length() <= 10) return "*".repeat(key.length());
        return key.substring(0, 6) + "..." + key.substring(key.length() - 4);
    }
}