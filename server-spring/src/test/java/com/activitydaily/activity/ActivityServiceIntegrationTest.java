package com.activitydaily.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.activitydaily.report.ReportRefreshCoordinator;
import com.activitydaily.util.TimeUtil;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:activity-service;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password="
})
class ActivityServiceIntegrationTest {
    @Autowired ActivityService service;
    @Autowired JdbcTemplate jdbc;
    @MockBean ReportRefreshCoordinator refreshCoordinator;

    private String userId;
    private String deviceId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID().toString();
        deviceId = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO users (id, email, username, password_hash, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'Asia/Shanghai', 'active', ?, ?)",
                userId, userId + "@example.com", "tester", "hash", TimeUtil.nowTs(), TimeUtil.nowTs());
        jdbc.update("INSERT INTO devices (id, user_id, device_name, os_type, status, first_seen_at, created_at, updated_at) VALUES (?, ?, 'test', 'windows', 'active', ?, ?, ?)",
                deviceId, userId, TimeUtil.nowTs(), TimeUtil.nowTs(), TimeUtil.nowTs());
    }

    @Test
    void uploadsUniqueRecordsInOneBatchAndKeepsRetriesIdempotent() {
        ActivityController.ActivityBatch request = new ActivityController.ActivityBatch(deviceId, List.of(
                record("client-1", "2026-07-19T09:00:00+08:00"),
                record("client-2", "2026-07-19T09:01:00+08:00")
        ));

        ActivityService.BatchUploadResult first = service.upload(userId, request);
        ActivityService.BatchUploadResult second = service.upload(userId, request);

        assertThat(first.accepted()).isEqualTo(2);
        assertThat(first.duplicated()).isZero();
        assertThat(second.accepted()).isZero();
        assertThat(second.duplicated()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM activity_records WHERE user_id=?", Integer.class, userId)).isEqualTo(2);
        assertThat(first.v2Response()).containsEntry("accepted_count", 2).containsEntry("report_refresh_pending", true);
        verify(refreshCoordinator, times(1)).scheduleAfterCommit(userId, "2026-07-19");
    }

    @Test
    void paginatesAndFiltersRecordsOnTheServer() {
        service.upload(userId, new ActivityController.ActivityBatch(deviceId, List.of(
                record("client-a", "2026-07-19T09:00:00+08:00", "编辑服务端代码", "编程开发", "Code"),
                record("client-b", "2026-07-19T09:01:00+08:00", "查看项目文档", "文档写作", "Edge"),
                record("client-c", "2026-07-19T09:02:00+08:00", "浏览器检索资料", "信息检索", "Edge")
        )));

        Map<String, Object> firstPage = service.list(userId, "2026-07-19", 1, 1, null, null, null, "start_time", "desc");
        Map<String, Object> filtered = service.list(userId, "2026-07-19", 1, 50, "信息检索", "Edge", "浏览器", "start_time", "desc");

        assertThat((List<?>) firstPage.get("items")).hasSize(1);
        assertThat(firstPage).containsEntry("total_items", 3).containsEntry("total_pages", 3).containsEntry("total_duration_seconds", 90);
        assertThat((List<?>) filtered.get("items")).hasSize(1);
        assertThat(filtered).containsEntry("total_items", 1);
    }

    private ActivityController.ActivityRecordIn record(String clientId, String startTime) {
        return record(clientId, startTime, "正在编辑项目代码", "编程开发", "Code");
    }

    private ActivityController.ActivityRecordIn record(String clientId, String startTime, String summary, String category, String appName) {
        return new ActivityController.ActivityRecordIn(clientId, "session-1", startTime,
                startTime, 30, appName, "Activity Daily", "Code.exe",
                summary, category, 0.9, "normal", Map.of("source", "test"));
    }
}
