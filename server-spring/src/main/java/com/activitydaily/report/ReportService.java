package com.activitydaily.report;

import com.activitydaily.device.DeviceService;
import com.activitydaily.util.JsonUtil;
import com.activitydaily.util.TextUtil;
import com.activitydaily.util.TimeUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportService {
    private static final String SUMMARY_SEPARATOR = "；";
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final DeviceService deviceService;

    public ReportService(JdbcTemplate jdbc, ObjectMapper mapper, DeviceService deviceService) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.deviceService = deviceService;
    }

    @Transactional
    public void markStale(String userId, String dateText) {
        jdbc.update("UPDATE daily_reports SET is_stale=TRUE, ai_analysis_status=CASE WHEN ai_analysis_status='none' THEN 'none' ELSE 'stale' END, updated_at=? WHERE user_id=? AND report_date=?",
                TimeUtil.nowTs(), userId, dateText);
    }

    public Map<String, Object> getOrGenerate(String userId, String dateText, boolean includeAi) {
        deviceService.ensureActiveUser(userId);
        Map<String, Object> report = get(userId, dateText, includeAi);
        if (report == null || Boolean.TRUE.equals(report.get("is_stale"))) {
            report = generate(userId, dateText, userTimezone(userId));
            if (includeAi) report = get(userId, dateText, true);
        }
        return report == null ? Map.of() : report;
    }

    @Transactional
    public Map<String, Object> generate(String userId, String dateText, String timezone) {
        List<Map<String, Object>> records = recordsForDate(userId, dateText);
        List<Map<String, Object>> timeline = mergeTimeline(records);
        Map<String, Integer> categorySeconds = new HashMap<>();
        Map<String, Integer> appSeconds = new HashMap<>();
        int total = 0, active = 0, idle = 0, privacy = 0;
        for (Map<String, Object> row : records) {
            int seconds = ((Number) row.get("duration_seconds")).intValue();
            total += seconds;
            String category = String.valueOf(row.get("category"));
            String privacyLevel = String.valueOf(row.get("privacy_level"));
            if ("空闲".equals(category)) idle += seconds;
            else if ("private".equals(privacyLevel) || "隐私".equals(category)) privacy += seconds;
            else active += seconds;
            categorySeconds.merge(category, seconds, Integer::sum);
            Object app = row.get("app_name");
            if (app != null && !String.valueOf(app).isBlank()) appSeconds.merge(String.valueOf(app), seconds, Integer::sum);
        }
        List<Map<String, Object>> categoryStats = stats(categorySeconds, "category", total);
        List<Map<String, Object>> appStats = stats(appSeconds, "app_name", total);
        String title = timeline.isEmpty() ? dateText + " 暂无活动记录" : dateText + " 主要进行了" + categoryStats.stream().limit(2).map(x -> String.valueOf(x.get("category"))).reduce((a, b) -> a + "、" + b).orElse("活动记录");
        String overview = timeline.isEmpty() ? "今天还没有可生成日报的活动记录。" : "共记录 " + timeline.size() + " 个活动片段，主要时间投入在" + categoryStats.stream().limit(2).map(x -> String.valueOf(x.get("category"))).reduce((a, b) -> a + "、" + b).orElse("活动记录") + "。";
        List<String> highlights = timeline.stream().sorted((a, b) -> Integer.compare(((Number)b.get("duration_seconds")).intValue(), ((Number)a.get("duration_seconds")).intValue())).limit(5).map(x -> String.valueOf(x.get("summary"))).toList();

        var existing = jdbc.queryForList("SELECT id, user_note FROM daily_reports WHERE user_id=? AND report_date=?", userId, dateText);
        String reportId = existing.isEmpty() ? TextUtil.newId() : String.valueOf(existing.get(0).get("id"));
        String userNote = existing.isEmpty() || existing.get(0).get("user_note") == null ? "" : String.valueOf(existing.get(0).get("user_note"));
        if (existing.isEmpty()) {
            jdbc.update("""
                    INSERT INTO daily_reports (id, user_id, report_date, timezone, title, overview, highlights, timeline, category_stats, app_stats, suggestions, user_note, total_tracked_seconds, active_seconds, idle_seconds, private_seconds, status, is_stale, generated_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', FALSE, ?, ?, ?)
                    """, reportId, userId, dateText, timezone, title, overview, JsonUtil.write(mapper, highlights), JsonUtil.write(mapper, timeline), JsonUtil.write(mapper, categoryStats), JsonUtil.write(mapper, appStats), "保持较长连续活动片段，减少不必要的上下文切换。", userNote, total, active, idle, privacy, TimeUtil.nowTs(), TimeUtil.nowTs(), TimeUtil.nowTs());
        } else {
            jdbc.update("""
                    UPDATE daily_reports SET timezone=?, title=?, overview=?, highlights=?, timeline=?, category_stats=?, app_stats=?, total_tracked_seconds=?, active_seconds=?, idle_seconds=?, private_seconds=?, status='generated', is_stale=FALSE, generated_at=?, updated_at=? WHERE id=?
                    """, timezone, title, overview, JsonUtil.write(mapper, highlights), JsonUtil.write(mapper, timeline), JsonUtil.write(mapper, categoryStats), JsonUtil.write(mapper, appStats), total, active, idle, privacy, TimeUtil.nowTs(), TimeUtil.nowTs(), reportId);
        }
        return get(userId, dateText, true);
    }

    public Map<String, Object> get(String userId, String dateText, boolean includeAi) {
        var rows = jdbc.queryForList("SELECT * FROM daily_reports WHERE user_id=? AND report_date=?", userId, dateText);
        if (rows.isEmpty()) return null;
        Map<String, Object> row = rows.get(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("date", row.get("report_date"));
        result.put("timezone", row.get("timezone"));
        result.put("title", row.get("title"));
        result.put("overview", row.get("overview"));
        result.put("total_tracked_seconds", row.get("total_tracked_seconds"));
        result.put("active_seconds", row.get("active_seconds"));
        result.put("idle_seconds", row.get("idle_seconds"));
        result.put("private_seconds", row.get("private_seconds"));
        result.put("is_stale", row.get("is_stale"));
        result.put("highlights", JsonUtil.readList(mapper, string(row.get("highlights"))));
        result.put("timeline", JsonUtil.readList(mapper, string(row.get("timeline"))));
        result.put("category_stats", JsonUtil.readList(mapper, string(row.get("category_stats"))));
        result.put("app_stats", JsonUtil.readList(mapper, string(row.get("app_stats"))));
        result.put("user_note", row.get("user_note") == null ? "" : row.get("user_note"));
        if (includeAi) {
            Map<String, Object> ai = new LinkedHashMap<>();
            ai.put("status", row.get("ai_analysis_status"));
            ai.put("job_id", row.get("ai_analysis_job_id"));
            ai.put("model_provider", row.get("ai_model_name") == null ? null : "deepseek");
            ai.put("model_name", row.get("ai_model_name"));
            ai.put("title", row.get("ai_title"));
            ai.put("one_sentence_summary", row.get("ai_summary"));
            ai.put("highlights", JsonUtil.readList(mapper, string(row.get("ai_highlights"))));
            ai.put("timeline_commentary", JsonUtil.readList(mapper, string(row.get("ai_timeline_commentary"))));
            ai.put("focus_analysis", JsonUtil.readMap(mapper, string(row.get("ai_focus_analysis"))));
            ai.put("suggestions", JsonUtil.readList(mapper, string(row.get("ai_suggestions"))));
            ai.put("risk_flags", JsonUtil.readList(mapper, string(row.get("ai_risk_flags"))));
            ai.put("generated_at", row.get("ai_generated_at"));
            result.put("ai_analysis", ai);
        }
        return result;
    }

    @Transactional
    public void updateNote(String userId, String dateText, String note) {
        getOrGenerate(userId, dateText, false);
        jdbc.update("UPDATE daily_reports SET user_note=?, is_stale=TRUE, updated_at=? WHERE user_id=? AND report_date=?", TextUtil.redact(note), TimeUtil.nowTs(), userId, dateText);
    }

    public String exportJson(String userId, String dateText) {
        return JsonUtil.write(mapper, getOrGenerate(userId, dateText, true));
    }

    public String exportCsv(String userId, String dateText) {
        Map<String, Object> report = getOrGenerate(userId, dateText, true);
        StringBuilder out = new StringBuilder("start_time,end_time,duration_seconds,category,app_name,summary\n");
        for (Object item : (List<?>) report.get("timeline")) {
            Map<?, ?> row = (Map<?, ?>) item;
            out.append(csv(row.get("start_time"))).append(',').append(csv(row.get("end_time"))).append(',').append(row.get("duration_seconds")).append(',').append(csv(row.get("category"))).append(',').append(csv(row.get("app_name"))).append(',').append(csv(row.get("summary"))).append('\n');
        }
        return out.toString();
    }

    public String exportMarkdown(String userId, String dateText) {
        Map<String, Object> report = getOrGenerate(userId, dateText, true);
        StringBuilder lines = new StringBuilder("# ").append(report.get("title")).append("\n\n").append(report.get("overview")).append("\n\n## 统计\n");
        lines.append("- 总记录：").append(report.get("total_tracked_seconds")).append(" 秒\n");
        lines.append("- 有效活动：").append(report.get("active_seconds")).append(" 秒\n");
        lines.append("- 空闲：").append(report.get("idle_seconds")).append(" 秒\n");
        lines.append("- 隐私：").append(report.get("private_seconds")).append(" 秒\n\n## 时间线\n");
        for (Object item : (List<?>) report.get("timeline")) {
            Map<?, ?> row = (Map<?, ?>) item;
            lines.append("- ").append(row.get("start_time")).append('-').append(row.get("end_time")).append(" [").append(row.get("category")).append("] ").append(row.get("summary")).append('\n');
        }
        return lines.toString();
    }

    public Map<String, Object> buildAiPayload(String userId, String dateText) {
        Map<String, Object> report = getOrGenerate(userId, dateText, false);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("date", dateText);
        payload.put("timezone", report.get("timezone"));
        payload.put("overview_stats", Map.of("total_tracked_seconds", report.get("total_tracked_seconds"), "active_seconds", report.get("active_seconds"), "idle_seconds", report.get("idle_seconds"), "private_seconds", report.get("private_seconds")));
        payload.put("category_stats", report.get("category_stats"));
        payload.put("app_stats", report.get("app_stats"));
        payload.put("timeline", report.get("timeline"));
        payload.put("user_note", TextUtil.redact(String.valueOf(report.getOrDefault("user_note", ""))));
        return payload;
    }

    public String userTimezone(String userId) {
        return jdbc.queryForObject("SELECT timezone FROM users WHERE id=?", String.class, userId);
    }

    private List<Map<String, Object>> recordsForDate(String userId, String dateText) {
        return jdbc.queryForList("""
                SELECT * FROM activity_records
                WHERE user_id=? AND is_deleted=FALSE AND start_time >= ? AND start_time < ?
                ORDER BY start_time ASC
                """, userId, TimeUtil.startOfDateIso(dateText), TimeUtil.startOfNextDateIso(dateText));
    }

    private List<Map<String, Object>> mergeTimeline(List<Map<String, Object>> records) {
        List<Map<String, Object>> timeline = new ArrayList<>();
        for (Map<String, Object> row : records) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("start_time", TimeUtil.timeHHmm(String.valueOf(row.get("start_time"))));
            item.put("end_time", TimeUtil.timeHHmm(String.valueOf(row.get("end_time"))));
            item.put("start_iso", row.get("start_time"));
            item.put("end_iso", row.get("end_time"));
            item.put("duration_seconds", row.get("duration_seconds"));
            item.put("summary", row.get("summary"));
            item.put("category", row.get("category"));
            item.put("app_name", row.get("app_name"));
            item.put("privacy_level", row.get("privacy_level"));
            item.put("source_record_ids", new ArrayList<>(List.of(row.get("id"))));
            if (timeline.isEmpty()) {
                timeline.add(item);
            } else {
                Map<String, Object> prev = timeline.get(timeline.size() - 1);
                boolean canMerge = Objects.equals(prev.get("category"), item.get("category")) && Objects.equals(prev.get("app_name"), item.get("app_name")) && Objects.equals(prev.get("privacy_level"), item.get("privacy_level"));
                if (canMerge) {
                    prev.put("end_time", item.get("end_time"));
                    prev.put("end_iso", item.get("end_iso"));
                    prev.put("duration_seconds", ((Number) prev.get("duration_seconds")).intValue() + ((Number) item.get("duration_seconds")).intValue());
                    ((List<Object>) prev.get("source_record_ids")).add(row.get("id"));
                    prev.put("summary", appendUniqueSummary(String.valueOf(prev.get("summary")), String.valueOf(item.get("summary"))));
                } else {
                    timeline.add(item);
                }
            }
        }
        timeline.forEach(item -> { item.remove("start_iso"); item.remove("end_iso"); });
        return timeline;
    }

    private String appendUniqueSummary(String existing, String incoming) {
        if (incoming == null || incoming.isBlank()) return existing;
        List<String> parts = new ArrayList<>(Arrays.stream(existing.split("[;；]")).map(String::trim).filter(s -> !s.isBlank()).toList());
        String normalizedIncoming = normalize(incoming);
        for (String part : parts) {
            String normalizedPart = normalize(part);
            if (normalizedPart.contains(normalizedIncoming) || normalizedIncoming.contains(normalizedPart)) return existing;
        }
        if (parts.size() < 2) parts.add(incoming);
        return String.join(SUMMARY_SEPARATOR, parts);
    }

    private String normalize(String value) {
        return value == null ? "" : value.replaceAll("[\\s,，。.!！?？:：;；、()（）\\[\\]【】\"'“”‘’《》<>]", "").toLowerCase();
    }

    private List<Map<String, Object>> stats(Map<String, Integer> seconds, String key, int total) {
        return seconds.entrySet().stream().sorted((a, b) -> Integer.compare(b.getValue(), a.getValue())).map(entry -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put(key, entry.getKey());
            row.put("duration_seconds", entry.getValue());
            row.put("percentage", total == 0 ? 0 : Math.round(entry.getValue() * 1000.0 / total) / 10.0);
            return row;
        }).toList();
    }

    private String string(Object value) { return value == null ? null : String.valueOf(value); }
    private String csv(Object value) { return "\"" + String.valueOf(value == null ? "" : value).replace("\"", "\"\"") + "\""; }
}