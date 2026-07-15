package com.activitydaily.ai;

import com.activitydaily.apikey.ApiKeyService;
import com.activitydaily.common.ApiException;
import com.activitydaily.config.ActivityDailyProperties;
import com.activitydaily.report.ReportService;
import com.activitydaily.util.JsonUtil;
import com.activitydaily.util.TextUtil;
import com.activitydaily.util.TimeUtil;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AiService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final ActivityDailyProperties properties;
    private final ApiKeyService apiKeyService;
    private final ReportService reportService;
    private final Executor aiTaskExecutor;

    public AiService(JdbcTemplate jdbc, ObjectMapper mapper, ActivityDailyProperties properties, ApiKeyService apiKeyService, ReportService reportService, @Qualifier("aiTaskExecutor") Executor aiTaskExecutor) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.properties = properties;
        this.apiKeyService = apiKeyService;
        this.reportService = reportService;
        this.aiTaskExecutor = aiTaskExecutor;
    }

    @Transactional
    public Map<String, Object> create(String userId, String dateText, AiController.AiAnalysisRequest request) {
        String analysisType = request.analysisType() == null || request.analysisType().isBlank() ? "daily" : request.analysisType();
        String mode = request.mode() == null || request.mode().isBlank() ? "standard" : request.mode();
        if (!"daily".equals(analysisType)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMS", "only daily is supported in MVP");
        String model = request.model() != null && !request.model().isBlank() ? request.model() : ("deep".equals(mode) ? properties.getDeepseekDeepModel() : properties.getDeepseekDefaultModel());
        Set<String> allowedModels = new HashSet<>(List.of("deepseek-v4-flash", "deepseek-v4-pro"));
        allowedModels.add(properties.getDeepseekDefaultModel());
        allowedModels.add(properties.getDeepseekDeepModel());
        if (!allowedModels.contains(model)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PARAMS", "model not allowed");
        }
        if (apiKeyService.getPlainKey(userId).isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "API_KEY_REQUIRED", "请先在 API 管理中配置 DeepSeek API Key");
        }
        Map<String, Object> payload = reportService.buildAiPayload(userId, dateText);
        String inputHash = TextUtil.sha256(JsonUtil.write(mapper, payload));
        if (!request.forceRegenerate()) {
            var cached = jdbc.queryForList("SELECT id, status FROM ai_analysis_jobs WHERE user_id=? AND analysis_type='daily' AND input_hash=? AND status IN ('succeeded','fallback') ORDER BY finished_at DESC", userId, inputHash);
            if (!cached.isEmpty()) return Map.of("job_id", cached.get(0).get("id"), "status", cached.get(0).get("status"), "cached", true);
        }
        reportService.getOrGenerate(userId, dateText, false);
        var reportRows = jdbc.queryForList("SELECT id FROM daily_reports WHERE user_id=? AND report_date=?", userId, dateText);
        String reportId = reportRows.isEmpty() ? null : String.valueOf(reportRows.get(0).get("id"));
        String jobId = TextUtil.newId();
        jdbc.update("""
                INSERT INTO ai_analysis_jobs (id, user_id, report_id, analysis_type, report_date, status, mode, model_name, input_hash, prompt_version, sanitized_payload, created_at, updated_at)
                VALUES (?, ?, ?, 'daily', ?, 'pending', ?, ?, ?, 'daily-v2', ?, ?, ?)
                """, jobId, userId, reportId, dateText, mode, model, inputHash, JsonUtil.write(mapper, payload), TimeUtil.nowTs(), TimeUtil.nowTs());
        jdbc.update("UPDATE daily_reports SET ai_analysis_status='pending', ai_analysis_job_id=?, updated_at=? WHERE user_id=? AND report_date=?", jobId, TimeUtil.nowTs(), userId, dateText);
        CompletableFuture.runAsync(() -> runJob(jobId), aiTaskExecutor);
        return Map.of("job_id", jobId, "status", "pending", "cached", false);
    }

    public Map<String, Object> getJob(String userId, String jobId) {
        var rows = jdbc.queryForList("SELECT * FROM ai_analysis_jobs WHERE id=? AND user_id=?", jobId, userId);
        if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "job not found");
        Map<String, Object> row = rows.get(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("job_id", row.get("id"));
        result.put("status", row.get("status"));
        result.put("model_provider", row.get("model_provider"));
        result.put("model_name", row.get("model_name"));
        result.put("analysis_result", JsonUtil.readMap(mapper, string(row.get("analysis_result"))));
        result.put("error_code", row.get("error_code"));
        result.put("error_message", row.get("error_message"));
        result.put("created_at", row.get("created_at"));
        result.put("finished_at", row.get("finished_at"));
        return result;
    }

    public void runJob(String jobId) {
        try {
            runJobInternal(jobId);
        } catch (Exception ex) {
            markJobFailed(jobId, ex);
        }
    }

    private void runJobInternal(String jobId) {
        var jobs = jdbc.queryForList("SELECT * FROM ai_analysis_jobs WHERE id=?", jobId);
        if (jobs.isEmpty()) return;
        Map<String, Object> job = jobs.get(0);
        jdbc.update("UPDATE ai_analysis_jobs SET status='running', started_at=?, updated_at=? WHERE id=?", TimeUtil.nowTs(), TimeUtil.nowTs(), jobId);
        Map<String, Object> payload = JsonUtil.readMap(mapper, string(job.get("sanitized_payload")));
        Map<String, Object> result;
        Map<String, Integer> usage = Map.of("input_tokens", 0, "output_tokens", 0, "total_tokens", 0);
        String status = "succeeded";
        String errorCode = null;
        String errorMessage = null;
        try {
            CallResult callResult = callDeepSeek(payload, string(job.get("model_name")), apiKeyService.getPlainKey(string(job.get("user_id"))));
            result = callResult.result();
            usage = callResult.usage();
        } catch (Exception ex) {
            status = "fallback";
            errorCode = "DEEPSEEK_UNAVAILABLE";
            errorMessage = ex.getMessage();
            result = fallback(payload);
        }
        String finishedDate = string(job.get("report_date"));
        jdbc.update("""
                UPDATE ai_analysis_jobs SET status=?, analysis_result=?, input_tokens=?, output_tokens=?, total_tokens=?, error_code=?, error_message=?, finished_at=?, updated_at=? WHERE id=?
                """, status, JsonUtil.write(mapper, result), usage.get("input_tokens"), usage.get("output_tokens"), usage.get("total_tokens"), errorCode, errorMessage, TimeUtil.nowTs(), TimeUtil.nowTs(), jobId);
        jdbc.update("""
                UPDATE daily_reports SET ai_analysis_status=?, ai_analysis_job_id=?, ai_title=?, ai_summary=?, ai_highlights=?, ai_timeline_commentary=?, ai_focus_analysis=?, ai_suggestions=?, ai_risk_flags=?, ai_model_name=?, ai_generated_at=?, updated_at=? WHERE user_id=? AND report_date=?
                """, status, jobId, result.get("title"), result.get("one_sentence_summary"), JsonUtil.write(mapper, result.get("highlights")), JsonUtil.write(mapper, result.get("timeline_commentary")), JsonUtil.write(mapper, result.get("focus_analysis")), JsonUtil.write(mapper, result.get("suggestions")), JsonUtil.write(mapper, result.get("risk_flags")), job.get("model_name"), TimeUtil.nowTs(), TimeUtil.nowTs(), job.get("user_id"), finishedDate);
        if (usage.get("total_tokens") > 0) {
            jdbc.update("INSERT INTO ai_analysis_token_usage (id, user_id, job_id, usage_date, model_name, input_tokens, output_tokens, total_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", TextUtil.newId(), job.get("user_id"), jobId, finishedDate, job.get("model_name"), usage.get("input_tokens"), usage.get("output_tokens"), usage.get("total_tokens"), TimeUtil.nowTs());
        }
    }

    private void markJobFailed(String jobId, Exception ex) {
        jdbc.update("""
                UPDATE ai_analysis_jobs
                SET status='failed', error_code='JOB_FAILED', error_message=?, finished_at=?, updated_at=?
                WHERE id=? AND status IN ('pending','running')
                """, ex.getMessage(), TimeUtil.nowTs(), TimeUtil.nowTs(), jobId);
    }

    private CallResult callDeepSeek(Map<String, Object> payload, String modelName, String apiKey) throws Exception {
        String systemPrompt = """
                你是一个个人时间复盘助手。下面的输入是用户一天的电脑活动记录，这些记录已经在本地完成屏幕摘要和隐私脱敏。

                你的任务：
                1. 基于事实记录生成客观、克制、可复盘的日报分析。
                2. 不要编造未发生的事情，不要把短暂活动写成重要成果。
                3. 不要进行心理诊断、绩效评价、人格评价或道德评价。
                4. 不要输出密码、验证码、密钥、身份证号、银行卡号、手机号、邮箱等敏感信息。
                5. 如果输入中存在隐私时间，只能描述为“隐私时间”，不得猜测具体内容。
                6. 优先总结投入时间较长、连续性较强、信息密度较高的活动。
                7. 合并相似或重复的时间线描述，不要复读多条近似摘要。
                8. suggestions 必须具体、可执行、温和，避免空泛鸡汤。
                9. 输出严格 JSON，不要输出 Markdown、解释文字或代码块。
                """;
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("title", "用一句中文标题概括当天主要投入，不夸大");
        schema.put("one_sentence_summary", "用一到两句话概括当天活动结构和主要投入");
        schema.put("highlights", List.of("2-5 条事实性重点，只写值得复盘的活动"));
        schema.put("timeline_commentary", List.of(Map.of(
                "time_range", "HH:mm-HH:mm",
                "commentary", "对该时间段做合并后的客观描述，避免重复和流水账"
        )));
        schema.put("focus_analysis", Map.of(
                "focused_blocks", List.of("连续投入较长的时间段，例如 09:20-10:45 编程开发"),
                "context_switching_notes", "基于应用和分类切换情况，客观说明上下文切换，不批评用户"
        ));
        schema.put("suggestions", List.of("1-4 条具体建议，例如把相近任务合并到连续时段处理"));
        schema.put("risk_flags", List.of("仅在记录显示明显风险时填写，例如长时间空闲、隐私时间占比异常；否则返回空数组"));
        String userPrompt = """
                请根据下面的结构化活动记录生成日报分析。

                输出要求：
                - 必须完全符合给定 JSON 结构。
                - 字段名必须保持不变。
                - 所有内容使用中文。
                - timeline_commentary 最多输出 8 条，按时间顺序合并相邻相似活动。
                - highlights 不要和 timeline_commentary 大段重复。
                - 如果当天记录很少，请如实说明，不要补充不存在的活动。

                JSON 结构：
                %s

                活动记录：
                %s
                """.formatted(JsonUtil.write(mapper, schema), JsonUtil.write(mapper, payload));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", modelName);
        body.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
        ));
        body.put("stream", false);
        body.put("temperature", 0.2);
        body.put("response_format", Map.of("type", "json_object"));
        Exception last = null;
        for (int i = 0; i <= properties.getDeepseekMaxRetries(); i++) {
            try {
                HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(properties.getDeepseekTimeoutSeconds())).build();
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(properties.getDeepseekBaseUrl().replaceAll("/$", "") + "/chat/completions"))
                        .timeout(Duration.ofSeconds(properties.getDeepseekTimeoutSeconds()))
                        .header("Authorization", "Bearer " + apiKey)
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(JsonUtil.write(mapper, body)))
                        .build();
                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() >= 400) throw new IllegalStateException(response.body());
                Map<String, Object> data = mapper.readValue(response.body(), new TypeReference<>() {});
                List<?> choices = (List<?>) data.get("choices");
                Map<?, ?> first = (Map<?, ?>) choices.get(0);
                Map<?, ?> message = (Map<?, ?>) first.get("message");
                Map<String, Object> result = normalizeAiResult(extractJsonObject(String.valueOf(message.get("content"))));
                Map<?, ?> rawUsage = (Map<?, ?>) data.getOrDefault("usage", Map.of());
                Map<String, Integer> usage = Map.of(
                        "input_tokens", intValue(rawUsage.get("prompt_tokens")),
                        "output_tokens", intValue(rawUsage.get("completion_tokens")),
                        "total_tokens", intValue(rawUsage.get("total_tokens"))
                );
                return new CallResult(result, usage);
            } catch (Exception ex) {
                last = ex;
            }
        }
        throw last == null ? new IllegalStateException("DeepSeek unavailable") : last;
    }

    private Map<String, Object> fallback(Map<String, Object> payload) {
        List<?> categories = (List<?>) payload.getOrDefault("category_stats", List.of());
        String category = categories.isEmpty() ? "活动记录" : String.valueOf(((Map<?, ?>) categories.get(0)).get("category"));
        List<?> timeline = (List<?>) payload.getOrDefault("timeline", List.of());
        List<Object> highlights = new ArrayList<>(timeline.stream().limit(5).map(x -> ((Map<?, ?>) x).get("summary")).filter(Objects::nonNull).toList());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("title", payload.get("date") + " 主要投入在" + category);
        result.put("one_sentence_summary", "今天的主要活动集中在" + category + "，以下结果由规则日报降级生成。");
        result.put("highlights", highlights);
        result.put("timeline_commentary", timeline.stream().limit(8).map(x -> {
            Map<?, ?> item = (Map<?, ?>) x;
            return Map.of("time_range", item.get("start_time") + "-" + item.get("end_time"), "commentary", item.get("summary"));
        }).toList());
        result.put("focus_analysis", Map.of("focused_blocks", List.of(), "context_switching_notes", "未成功调用 DeepSeek，暂以规则统计展示。"));
        result.put("suggestions", List.of("保持可复用的连续工作时段；需要更细分析时可配置 DeepSeek API Key 后重新分析。"));
        result.put("risk_flags", List.of());
        return result;
    }

    private Map<String, Object> normalizeAiResult(Map<String, Object> value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("title", value.getOrDefault("title", "AI 日报分析"));
        result.put("one_sentence_summary", value.getOrDefault("one_sentence_summary", value.getOrDefault("overview", "")));
        result.put("highlights", value.getOrDefault("highlights", List.of()));
        result.put("timeline_commentary", value.getOrDefault("timeline_commentary", List.of()));
        result.put("focus_analysis", value.getOrDefault("focus_analysis", Map.of()));
        result.put("suggestions", value.getOrDefault("suggestions", List.of()));
        result.put("risk_flags", value.getOrDefault("risk_flags", List.of()));
        return result;
    }

    private Map<String, Object> extractJsonObject(String text) throws Exception {
        String cleaned = text.trim();
        if (cleaned.startsWith("```")) cleaned = cleaned.replaceFirst("^```(?:json)?", "").replaceFirst("```$", "").trim();
        try {
            return mapper.readValue(cleaned, new TypeReference<>() {});
        } catch (Exception ignored) {
            int start = cleaned.indexOf('{');
            int end = cleaned.lastIndexOf('}');
            if (start >= 0 && end > start) return mapper.readValue(cleaned.substring(start, end + 1), new TypeReference<>() {});
            throw ignored;
        }
    }

    private String string(Object value) { return value == null ? "" : String.valueOf(value); }
    private int intValue(Object value) { return value instanceof Number number ? number.intValue() : 0; }
    private record CallResult(Map<String, Object> result, Map<String, Integer> usage) {}
}