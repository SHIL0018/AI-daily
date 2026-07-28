package com.activitydaily.report;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.activitydaily.config.ActivityDailyProperties;
import java.time.Instant;
import java.util.concurrent.ScheduledFuture;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.scheduling.TaskScheduler;

class ReportRefreshCoordinatorTest {
    @Test
    void replacesAnExistingRefreshForTheSameUserAndDate() {
        TaskScheduler scheduler = mock(TaskScheduler.class);
        ReportService reportService = mock(ReportService.class);
        ActivityDailyProperties properties = new ActivityDailyProperties();
        properties.setReportRefreshDelaySeconds(10);
        ScheduledFuture<?> firstFuture = mock(ScheduledFuture.class);
        ScheduledFuture<?> secondFuture = mock(ScheduledFuture.class);
        doReturn(firstFuture, secondFuture).when(scheduler).schedule(any(Runnable.class), any(Instant.class));
        when(reportService.userTimezone("user-1")).thenReturn("Asia/Shanghai");
        ReportRefreshCoordinator coordinator = new ReportRefreshCoordinator(scheduler, reportService, properties);

        coordinator.schedule("user-1", "2026-07-19");
        coordinator.schedule("user-1", "2026-07-19");

        verify(firstFuture).cancel(false);
        ArgumentCaptor<Runnable> tasks = ArgumentCaptor.forClass(Runnable.class);
        verify(scheduler, org.mockito.Mockito.times(2)).schedule(tasks.capture(), any(Instant.class));
        tasks.getAllValues().get(1).run();
        verify(reportService).generate(eq("user-1"), eq("2026-07-19"), eq("Asia/Shanghai"));
    }

    @Test
    void doesNotPostponeAnAlreadyScheduledRefreshDuringPolling() {
        TaskScheduler scheduler = mock(TaskScheduler.class);
        ReportService reportService = mock(ReportService.class);
        ActivityDailyProperties properties = new ActivityDailyProperties();
        ScheduledFuture<?> future = mock(ScheduledFuture.class);
        doReturn(future).when(scheduler).schedule(any(Runnable.class), any(Instant.class));
        ReportRefreshCoordinator coordinator = new ReportRefreshCoordinator(scheduler, reportService, properties);

        coordinator.ensureScheduled("user-1", "2026-07-19");
        coordinator.ensureScheduled("user-1", "2026-07-19");

        verify(scheduler).schedule(any(Runnable.class), any(Instant.class));
    }
}
