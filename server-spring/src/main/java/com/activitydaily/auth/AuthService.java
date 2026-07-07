package com.activitydaily.auth;

import com.activitydaily.common.ApiException;
import com.activitydaily.config.ActivityDailyProperties;
import com.activitydaily.security.JwtService;
import com.activitydaily.util.TextUtil;
import com.activitydaily.util.TimeUtil;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final ActivityDailyProperties properties;

    public AuthService(JdbcTemplate jdbc, PasswordEncoder passwordEncoder, JwtService jwtService, ActivityDailyProperties properties) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.properties = properties;
    }

    @Transactional
    public Map<String, Object> register(AuthController.RegisterRequest request) {
        String userId = TextUtil.newId();
        jdbc.update("INSERT INTO users (id, email, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                userId, request.email().toLowerCase(), request.username(), passwordEncoder.encode(request.password()), TimeUtil.nowTs(), TimeUtil.nowTs());
        return Map.of("user_id", userId);
    }

    @Transactional
    public Map<String, Object> login(AuthController.LoginRequest request) {
        var rows = jdbc.queryForList("SELECT * FROM users WHERE email=? AND status='active'", request.email().toLowerCase());
        if (rows.isEmpty() || !passwordEncoder.matches(request.password(), String.valueOf(rows.get(0).get("password_hash")))) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "邮箱或密码不正确");
        }
        String userId = String.valueOf(rows.get(0).get("id"));
        jdbc.update("UPDATE users SET last_login_at=?, updated_at=? WHERE id=?", TimeUtil.nowTs(), TimeUtil.nowTs(), userId);
        return Map.of(
                "access_token", jwtService.createToken(userId, "access"),
                "refresh_token", jwtService.createToken(userId, "refresh"),
                "expires_in", properties.getAccessTokenMinutes() * 60
        );
    }

    public Map<String, Object> refresh(String refreshToken) {
        try {
            Map<String, Object> payload = jwtService.decode(refreshToken, "refresh");
            String userId = String.valueOf(payload.get("sub"));
            return Map.of("access_token", jwtService.createToken(userId, "access"), "expires_in", properties.getAccessTokenMinutes() * 60);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", ex.getMessage());
        }
    }
}