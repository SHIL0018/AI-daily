package com.activitydaily.activity;

import com.activitydaily.common.ApiException;
import com.activitydaily.device.DeviceService;
import com.activitydaily.report.ReportRefreshCoordinator;
import com.activitydaily.report.ReportService;
import com.activitydaily.util.JsonUtil;
import com.activitydaily.util.TextUtil;
import com.activitydaily.util.TimeUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.util.*;
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
    private final ReportRefreshCoordinator reportRefreshCoordinator;

    public ActivityService(JdbcTemplate jdbc, ObjectMapper mapper, DeviceService deviceService,
                           ReportService reportService, ReportRefreshCoordinator reportRefreshCoordinator) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.deviceService = deviceService;
        this.reportService = reportService;
        this.reportRefreshCoordinator = reportRefreshCoordinator;
    }

    @Transactional
    public BatchUploadResult upload(String userId, ActivityController.ActivityBatch request) {
        deviceService.ensureActiveUser(userId);
        var devices = jdbc.queryForList("SELECT status FROM devices WHERE id=? AND user_id=?", request.deviceId(), userId);
        if (devices.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "device not found");
        if (!"active".equals(String.valueOf(devices.get(0).get("status")))) throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "device disabled");

        int duplicated = 0, failed = 0;
        List<Map<String, Object>> results = new ArrayList<>();
        LinkedHashMap<String, ActivityController.ActivityRecordIn> validRecords = new LinkedHashMap<>();
        for (ActivityController.ActivityRecordIn record : Optional.ofNullable(request.records()).orElse(List.of())) {
            try {
                validateRecord(record);
                if (validRecords.putIfAbsent(record.clientRecordId(), record) != null) {
                    duplicated++;
                    results.add(result(record.clientRecordId(), null, "duplicated", "duplicate id in request"));
                }
            } catch (Exception ex) {
                failed++;
                results.add(result(record == null ? null : record.clientRecordId(), null, "failed", String.valueOf(ex.getMessage())));
            }
        }

        Map<String, String> existing = findExistingRecordIds(userId, request.deviceId(), validRecords.keySet());
        List<PreparedRecord> inserts = new ArrayList<>();
        Set<String> touchedDates = new TreeSet<>();
        Timestamp now = TimeUtil.nowTs();
        for (ActivityController.ActivityRecordIn record : validRecords.values()) {
            String existingId = existing.get(record.clientRecordId());
            if (existingId != null) {
                duplicated++;
                results.add(result(record.clientRecordId(), existingId, "duplicated", null));
                continue;
            }
            String recordId = TextUtil.newId();
            inserts.add(prepareRecord(recordId, userId, request.deviceId(), record, now));
            touchedDates.add(TimeUtil.dateFromIso(record.startTime()));
            results.add(result(record.clientRecordId(), recordId, "accepted", null));
        }

        insertBatch(inserts);
        jdbc.update("UPDATE devices SET last_seen_at=?, updated_at=? WHERE id=?", now, now, request.deviceId());
        reportService.markStale(userId, touchedDates);
        touchedDates.forEach(date -> reportRefreshCoordinator.scheduleAfterCommit(userId, date));
        return new BatchUploadResult(inserts.size(), duplicated, failed, results, List.copyOf(touchedDates));
    }

    public Map<String, Object> list(String userId, String date, int page, int pageSize, String category,
                                    String appName, String keyword, String sort, String direction) {
        deviceService.ensureActiveUser(userId);
        int safePage = Math.max(page, 1);
        int safePageSize = Math.min(Math.max(pageSize, 1), 200);
        int offset = (safePage - 1) * safePageSize;

        List<Object> params = new ArrayList<>();
        StringBuilder where = new StringBuilder(" WHERE user_id=? AND is_deleted=FALSE");
        params.add(userId);
        if (date != null && !date.isBlank()) {
            where.append(" AND start_time >= ? AND start_time < ?");
            params.add(TimeUtil.startOfDateIso(date));
            params.add(TimeUtil.startOfNextDateIso(date));
        }
        if (category != null && !category.isBlank()) {
            where.append(" AND category=?");
            params.add(category);
        }
        if (appName != null && !appName.isBlank()) {
            where.append(" AND app_name=?");
            params.add(appName.trim());
        }
        if (keyword != null && !keyword.isBlank()) {
            where.append(" AND (LOWER(summary) LIKE ? OR LOWER(COALESCE(app_name, '')) LIKE ?)");
            String pattern = "%" + keyword.trim().toLowerCase(Locale.ROOT) + "%";
            params.add(pattern);
            params.add(pattern);
        }

        Integer total = jdbc.queryForObject("SELECT COUNT(*) FROM activity_records" + where, Integer.class, params.toArray());
        Integer totalDuration = jdbc.queryForObject("SELECT COALESCE(SUM(duration_seconds), 0) FROM activity_records" + where, Integer.class, params.toArray());
        List<Object> pageParams = new ArrayList<>(params);
        pageParams.add(safePageSize);
        pageParams.add(offset);
        String sortColumn = Map.of("start_time", "start_time", "duration_seconds", "duration_seconds", "category", "category")
                .getOrDefault(sort, "start_time");
        String sortDirection = "asc".equalsIgnoreCase(direction) ? "ASC" : "DESC";
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, start_time, end_time, duration_seconds, summary, category, app_name, privacy_level, confidence
                FROM activity_records
                """ + where + " ORDER BY " + sortColumn + " " + sortDirection + ", id ASC LIMIT ? OFFSET ?", pageParams.toArray());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("date", date);
        data.put("timezone", userTimezone(userId));
        data.put("records", rows);
        data.put("pagination", Map.of("page", safePage, "page_size", safePageSize, "total", total == null ? 0 : total));
        data.put("items", rows);
        data.put("page", safePage);
        data.put("page_size", safePageSize);
        data.put("total_items", total == null ? 0 : total);
        data.put("total_pages", Math.max(1, (int) Math.ceil((total == null ? 0 : total) / (double) safePageSize)));
        data.put("total_duration_seconds", totalDuration == null ? 0 : totalDuration);
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
        reportRefreshCoordinator.scheduleAfterCommit(userId, TimeUtil.dateFromIso(newStart));
        return Map.of("id", recordId);
    }

    @Transactional
    public void delete(String userId, String recordId) {
        deviceService.ensureActiveUser(userId);
        var rows = jdbc.queryForList("SELECT start_time FROM activity_records WHERE id=? AND user_id=? AND is_deleted=FALSE", recordId, userId);
        if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "record not found");
        jdbc.update("UPDATE activity_records SET is_deleted=TRUE, deleted_at=?, updated_at=? WHERE id=?", TimeUtil.nowTs(), TimeUtil.nowTs(), recordId);
        String date = TimeUtil.dateFromIso(String.valueOf(rows.get(0).get("start_time")));
        reportService.markStale(userId, date);
        reportRefreshCoordinator.scheduleAfterCommit(userId, date);
    }

    private void validateRecord(ActivityController.ActivityRecordIn record) {
        if (record == null) throw new IllegalArgumentException("record is required");
        if (blank(record.clientRecordId())) throw new IllegalArgumentException("client_record_id is required");
        if (blank(record.sessionId())) throw new IllegalArgumentException("session_id is required");
        if (blank(record.startTime()) || blank(record.endTime())) throw new IllegalArgumentException("start_time and end_time are required");
        if (record.durationSeconds() <= 0) throw new IllegalArgumentException("duration_seconds must be positive");
        if (blank(record.summary())) throw new IllegalArgumentException("summary is required");
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

    private Map<String, String> findExistingRecordIds(String userId, String deviceId, Collection<String> clientRecordIds) {
        if (clientRecordIds.isEmpty()) return Map.of();
        String placeholders = String.join(",", Collections.nCopies(clientRecordIds.size(), "?"));
        List<Object> params = new ArrayList<>();
        params.add(userId);
        params.add(deviceId);
        params.addAll(clientRecordIds);
        Map<String, String> existing = new HashMap<>();
        jdbc.queryForList("SELECT client_record_id, id FROM activity_records WHERE user_id=? AND device_id=? AND client_record_id IN (" + placeholders + ")", params.toArray())
                .forEach(row -> existing.put(String.valueOf(row.get("client_record_id")), String.valueOf(row.get("id"))));
        return existing;
    }

    private PreparedRecord prepareRecord(String recordId, String userId, String deviceId,
                                         ActivityController.ActivityRecordIn record, Timestamp now) {
        return new PreparedRecord(recordId, userId, deviceId, record.clientRecordId(), record.sessionId(), record.startTime(), record.endTime(), record.durationSeconds(),
                TextUtil.redact(record.appName()), TextUtil.redact(record.windowTitle()), TextUtil.redact(record.processName()), TextUtil.redact(record.summary()),
                record.category(), record.confidence(), privacy(record.privacyLevel()),
                JsonUtil.write(mapper, Optional.ofNullable(record.metadata()).orElse(Map.of())), now);
    }

    private void insertBatch(List<PreparedRecord> records) {
        if (records.isEmpty()) return;
        jdbc.batchUpdate("""
                INSERT INTO activity_records
                (id, user_id, device_id, client_record_id, session_id, start_time, end_time, duration_seconds, app_name, window_title, process_name, summary, category, confidence, privacy_level, metadata, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, records, records.size(), (statement, record) -> {
            statement.setString(1, record.id());
            statement.setString(2, record.userId());
            statement.setString(3, record.deviceId());
            statement.setString(4, record.clientRecordId());
            statement.setString(5, record.sessionId());
            statement.setString(6, record.startTime());
            statement.setString(7, record.endTime());
            statement.setInt(8, record.durationSeconds());
            statement.setString(9, record.appName());
            statement.setString(10, record.windowTitle());
            statement.setString(11, record.processName());
            statement.setString(12, record.summary());
            statement.setString(13, record.category());
            statement.setObject(14, record.confidence());
            statement.setString(15, record.privacyLevel());
            statement.setString(16, record.metadata());
            statement.setTimestamp(17, record.now());
            statement.setTimestamp(18, record.now());
        });
    }

    private Map<String, Object> result(String clientRecordId, String serverRecordId, String status, String error) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("client_record_id", clientRecordId);
        if (serverRecordId != null) result.put("server_record_id", serverRecordId);
        result.put("status", status);
        if (error != null) result.put("error", error);
        return result;
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private record PreparedRecord(String id, String userId, String deviceId, String clientRecordId,
                                  String sessionId, String startTime, String endTime, int durationSeconds,
                                  String appName, String windowTitle, String processName, String summary,
                                  String category, Double confidence, String privacyLevel, String metadata,
                                  Timestamp now) {}

    public record BatchUploadResult(int accepted, int duplicated, int failed,
                                    List<Map<String, Object>> results, List<String> affectedDates) {
        public Map<String, Object> legacyResponse() {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("accepted", accepted);
            data.put("duplicated", duplicated);
            data.put("failed", failed);
            data.put("results", results);
            return data;
        }

        public Map<String, Object> v2Response() {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("accepted_count", accepted);
            data.put("duplicate_count", duplicated);
            data.put("rejected", results.stream().filter(item -> "failed".equals(item.get("status"))).toList());
            data.put("results", results);
            data.put("affected_dates", affectedDates);
            data.put("report_refresh_pending", !affectedDates.isEmpty());
            return data;
        }
    }
}
