package com.activitydaily.activity;

import com.activitydaily.common.ApiException;
import com.activitydaily.device.DeviceService;
import com.activitydaily.report.ReportService;
import com.activitydaily.util.JsonUtil;
import com.activitydaily.util.TextUtil;
import com.activitydaily.util.TimeUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ActivityService {
    private static final Set<String> FORBIDDEN_RAW_FIELDS = Set.of("raw_screenshot", "image_base64", "ocr_text", "keyboard_input", "mouse_trace", "audio", "camera");
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final DeviceService deviceService;
    private final ReportService reportService;

    public ActivityService(JdbcTemplate jdbc, ObjectMapper mapper, DeviceService deviceService, @Lazy ReportService reportService) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.deviceService = deviceService;
        this.reportService = reportService;
    }

    @Transactional
    public Map<String, Object> upload(String userId, ActivityController.ActivityBatch request) {
        deviceService.ensureActiveUser(userId);
        var devices = jdbc.queryForList("SELECT * FROM devices WHERE id=? AND user_id=?", request.deviceId(), userId);
        if (devices.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "device not found");
        if (!"active".equals(String.valueOf(devices.get(0).get("status")))) throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "device disabled");

        int accepted = 0, duplicated = 0, failed = 0;
        List<Map<String, Object>> results = new ArrayList<>();
        Set<String> touchedDates = new HashSet<>();
        for (ActivityController.ActivityRecordIn record : Optional.ofNullable(request.records()).orElse(List.of())) {
            try {
                validateRecord(record);
                var existing = jdbc.queryForList("SELECT id FROM activity_records WHERE user_id=? AND device_id=? AND client_record_id=?", userId, request.deviceId(), record.clientRecordId());
                if (!existing.isEmpty()) {
                    duplicated++;
                    results.add(Map.of("client_record_id", record.clientRecordId(), "server_record_id", existing.get(0).get("id"), "status", "duplicated"));
                    continue;
                }
                String recordId = TextUtil.newId();
                jdbc.update("""
                        INSERT INTO activity_records
                        (id, user_id, device_id, client_record_id, session_id, start_time, end_time, duration_seconds, app_name, window_title, process_name, summary, category, confidence, privacy_level, metadata, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        recordId, userId, request.deviceId(), record.clientRecordId(), record.sessionId(), record.startTime(), record.endTime(), record.durationSeconds(),
                        TextUtil.redact(record.appName()), TextUtil.redact(record.windowTitle()), TextUtil.redact(record.processName()), TextUtil.redact(record.summary()),
                        record.category(), record.confidence(), privacy(record.privacyLevel()), JsonUtil.write(mapper, Optional.ofNullable(record.metadata()).orElse(Map.of())), TimeUtil.nowTs(), TimeUtil.nowTs());
                accepted++;
                touchedDates.add(TimeUtil.dateFromIso(record.startTime()));
                results.add(Map.of("client_record_id", record.clientRecordId(), "server_record_id", recordId, "status", "accepted"));
            } catch (DuplicateKeyException ex) {
                duplicated++;
                results.add(Map.of("client_record_id", record.clientRecordId(), "status", "duplicated"));
            } catch (Exception ex) {
                failed++;
                results.add(Map.of("client_record_id", record.clientRecordId(), "status", "failed", "error", ex.getMessage()));
            }
        }
        jdbc.update("UPDATE devices SET last_seen_at=?, updated_at=? WHERE id=?", TimeUtil.nowTs(), TimeUtil.nowTs(), request.deviceId());
        for (String date : touchedDates) {
            reportService.markStale(userId, date);
            reportService.generate(userId, date, userTimezone(userId));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("accepted", accepted);
        data.put("duplicated", duplicated);
        data.put("failed", failed);
        data.put("results", results);
        return data;
    }

    public Map<String, Object> list(String userId, String date, int page, int pageSize, String category) {
        deviceService.ensureActiveUser(userId);
        int safePage = Math.max(page, 1);
        int safePageSize = Math.min(Math.max(pageSize, 1), 200);
        List<Object> params = new ArrayList<>();
        StringBuilder sql = new StringBuilder("SELECT id, start_time, end_time, duration_seconds, summary, category, app_name, privacy_level, confidence FROM activity_records WHERE user_id=? AND is_deleted=FALSE");
        params.add(userId);
        if (category != null && !category.isBlank()) {
            sql.append(" AND category=?");
            params.add(category);
        }
        sql.append(" ORDER BY start_time ASC");
        List<Map<String, Object>> all = jdbc.queryForList(sql.toString(), params.toArray());
        if (date != null && !date.isBlank()) {
            all = all.stream().filter(row -> date.equals(TimeUtil.dateFromIso(String.valueOf(row.get("start_time"))))).toList();
        }
        int total = all.size();
        int from = Math.min((safePage - 1) * safePageSize, total);
        int to = Math.min(from + safePageSize, total);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("date", date);
        data.put("timezone", userTimezone(userId));
        data.put("records", all.subList(from, to));
        data.put("pagination", Map.of("page", safePage, "page_size", safePageSize, "total", total));
        return data;
    }

    @Transactional
    public Map<String, Object> patch(String userId, String recordId, ActivityController.ActivityPatch request) {
        deviceService.ensureActiveUser(userId);
        var rows = jdbc.queryForList("SELECT * FROM activity_records WHERE id=? AND user_id=? AND is_deleted=FALSE", recordId, userId);
        if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "record not found");
        Map<String, Object> old = rows.get(0);
        String newSummary = request.summary() != null ? TextUtil.redact(request.summary()) : String.valueOf(old.get("summary"));
        String newCategory = request.category() != null ? request.category() : String.valueOf(old.get("category"));
        if (!TextUtil.CATEGORIES.contains(newCategory)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMS", "invalid category");
        String newStart = request.startTime() != null ? request.startTime() : String.valueOf(old.get("start_time"));
        String newEnd = request.endTime() != null ? request.endTime() : String.valueOf(old.get("end_time"));
        jdbc.update("""
                INSERT INTO activity_record_edits (id, activity_record_id, user_id, old_summary, new_summary, old_category, new_category, old_start_time, new_start_time, old_end_time, new_end_time, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, TextUtil.newId(), recordId, userId, old.get("summary"), newSummary, old.get("category"), newCategory, old.get("start_time"), newStart, old.get("end_time"), newEnd, TimeUtil.nowTs());
        jdbc.update("UPDATE activity_records SET summary=?, category=?, start_time=?, end_time=?, app_name=?, updated_at=? WHERE id=? AND user_id=?",
                newSummary, newCategory, newStart, newEnd, request.appName() != null ? TextUtil.redact(request.appName()) : old.get("app_name"), TimeUtil.nowTs(), recordId, userId);
        reportService.markStale(userId, TimeUtil.dateFromIso(newStart));
        return Map.of("id", recordId);
    }

    @Transactional
    public void delete(String userId, String recordId) {
        deviceService.ensureActiveUser(userId);
        var rows = jdbc.queryForList("SELECT start_time FROM activity_records WHERE id=? AND user_id=? AND is_deleted=FALSE", recordId, userId);
        if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "record not found");
        jdbc.update("UPDATE activity_records SET is_deleted=TRUE, deleted_at=?, updated_at=? WHERE id=?", TimeUtil.nowTs(), TimeUtil.nowTs(), recordId);
        reportService.markStale(userId, TimeUtil.dateFromIso(String.valueOf(rows.get(0).get("start_time"))));
    }

    private void validateRecord(ActivityController.ActivityRecordIn record) {
        if (!TextUtil.CATEGORIES.contains(record.category())) throw new IllegalArgumentException("invalid category");
        if (!TextUtil.PRIVACY_LEVELS.contains(privacy(record.privacyLevel()))) throw new IllegalArgumentException("invalid privacy_level");
        if (record.metadata() != null && record.metadata().keySet().stream().anyMatch(FORBIDDEN_RAW_FIELDS::contains)) {
            throw new IllegalArgumentException("禁止上传隐私原始字段");
        }
    }

    private String privacy(String value) {
        return value == null || value.isBlank() ? "normal" : value;
    }

    private String userTimezone(String userId) {
        return jdbc.queryForObject("SELECT timezone FROM users WHERE id=?", String.class, userId);
    }
}