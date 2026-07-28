package com.activitydaily.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.activitydaily.apikey.ApiKeyService;
import com.activitydaily.config.ActivityDailyProperties;
import com.activitydaily.report.ReportService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

class AiServiceTest {
    @Test
    void fallbackJobsAreNotCacheHitsAndNewJobsUseTheCoordinator() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("SELECT id FROM daily_reports")) return List.of(Map.of("id", "report-1"));
            return List.of();
        });
        ObjectMapper mapper = new ObjectMapper();
        ActivityDailyProperties properties = new ActivityDailyProperties();
        properties.setDeepseekDefaultModel("deepseek-v4-flash");
        properties.setDeepseekDeepModel("deepseek-v4-pro");
        ApiKeyService apiKeyService = mock(ApiKeyService.class);
        when(apiKeyService.getPlainKey("user-1")).thenReturn("sk-test-key");
        ReportService reportService = mock(ReportService.class);
        when(reportService.buildAiPayload("user-1", "2026-07-28")).thenReturn(Map.of("date", "2026-07-28", "timeline", List.of()));
        AiJobCoordinator coordinator = mock(AiJobCoordinator.class);
        AiService service = new AiService(jdbc, mapper, properties, apiKeyService, reportService, mock(HttpClient.class), coordinator);

        Map<String, Object> result = service.create("user-1", "2026-07-28",
                new AiController.AiAnalysisRequest("daily", "standard", false, null));

        assertThat(result).containsEntry("status", "pending").containsEntry("cached", false);
        verify(coordinator).scheduleAfterCommit(String.valueOf(result.get("job_id")));
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, org.mockito.Mockito.atLeastOnce()).queryForList(sql.capture(), any(Object[].class));
        assertThat(sql.getAllValues()).anyMatch(value -> value.contains("status='succeeded'"));
        assertThat(sql.getAllValues()).noneMatch(value -> value.contains("status IN ('succeeded','fallback')"));
    }
}
