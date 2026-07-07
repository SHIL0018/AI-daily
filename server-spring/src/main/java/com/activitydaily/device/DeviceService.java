package com.activitydaily.device;

import com.activitydaily.common.ApiException;
import com.activitydaily.util.TextUtil;
import com.activitydaily.util.TimeUtil;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeviceService {
    private final JdbcTemplate jdbc;

    public DeviceService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Object> create(String userId, DeviceController.DeviceCreate request) {
        ensureActiveUser(userId);
        String deviceId = TextUtil.newId();
        jdbc.update("INSERT INTO devices (id, user_id, device_name, os_type, os_version, client_version, first_seen_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                deviceId, userId, request.deviceName(), request.osType(), request.osVersion(), request.clientVersion(), TimeUtil.nowTs(), TimeUtil.nowTs(), TimeUtil.nowTs(), TimeUtil.nowTs());
        return Map.of("device_id", deviceId);
    }

    public Map<String, Object> list(String userId) {
        ensureActiveUser(userId);
        return Map.of("devices", jdbc.queryForList("SELECT * FROM devices WHERE user_id=? ORDER BY created_at DESC", userId));
    }

    @Transactional
    public void update(String userId, String deviceId, String status) {
        ensureActiveUser(userId);
        if (!status.equals("active") && !status.equals("disabled")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMS", "invalid status");
        }
        int rows = jdbc.update("UPDATE devices SET status=?, updated_at=? WHERE id=? AND user_id=?", status, TimeUtil.nowTs(), deviceId, userId);
        if (rows == 0) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "device not found");
    }

    public void ensureActiveUser(String userId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id=? AND status='active'", Integer.class, userId);
        if (count == null || count == 0) throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "user not found");
    }
}