package com.activitydaily.security;

import com.activitydaily.config.ActivityDailyProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
    private final ActivityDailyProperties properties;
    private final ObjectMapper mapper;
    private final Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
    private final Base64.Decoder decoder = Base64.getUrlDecoder();

    public JwtService(ActivityDailyProperties properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
    }

    public String createToken(String userId, String type) {
        long seconds = "refresh".equals(type) ? properties.getRefreshTokenDays() * 86400L : properties.getAccessTokenMinutes() * 60L;
        Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sub", userId);
        payload.put("type", type);
        payload.put("exp", Instant.now().getEpochSecond() + seconds);
        payload.put("iat", Instant.now().getEpochSecond());
        String body = encodeJson(header) + "." + encodeJson(payload);
        return body + "." + sign(body);
    }

    public Map<String, Object> decode(String token, String expectedType) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) throw new IllegalArgumentException("invalid token");
            String body = parts[0] + "." + parts[1];
            if (!constantEquals(sign(body), parts[2])) throw new IllegalArgumentException("invalid token");
            Map<String, Object> payload = mapper.readValue(decoder.decode(parts[1]), new TypeReference<>() {});
            if (!expectedType.equals(payload.get("type"))) throw new IllegalArgumentException("invalid token type");
            Number exp = (Number) payload.get("exp");
            if (exp.longValue() < Instant.now().getEpochSecond()) throw new IllegalArgumentException("expired token");
            return payload;
        } catch (Exception ex) {
            throw new IllegalArgumentException(ex.getMessage() == null ? "invalid token" : ex.getMessage(), ex);
        }
    }

    private String encodeJson(Object value) {
        try {
            return encoder.encodeToString(mapper.writeValueAsBytes(value));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private String sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(properties.getJwtSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return encoder.encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private boolean constantEquals(String left, String right) {
        if (left.length() != right.length()) return false;
        int result = 0;
        for (int i = 0; i < left.length(); i++) result |= left.charAt(i) ^ right.charAt(i);
        return result == 0;
    }
}