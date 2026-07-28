package com.activitydaily.report;

import com.activitydaily.config.ActivityDailyProperties;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class ReportRefreshCoordinator {
    private static final Logger log = LoggerFactory.getLogger(ReportRefreshCoordinator.class);
    private final TaskScheduler scheduler;
    private final ReportService reportService;
    private final ActivityDailyProperties properties;
    private final ConcurrentHashMap<ReportKey, PendingRefresh> pending = new ConcurrentHashMap<>();

    public ReportRefreshCoordinator(@Qualifier("reportTaskScheduler") TaskScheduler scheduler,
                                    ReportService reportService,
                                    ActivityDailyProperties properties) {
        this.scheduler = scheduler;
        this.reportService = reportService;
        this.properties = properties;
    }

    public void scheduleAfterCommit(String userId, String date) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    schedule(userId, date);
                }
            });
            return;
        }
        schedule(userId, date);
    }

    public void schedule(String userId, String date) {
        ReportKey key = new ReportKey(userId, date);
        pending.compute(key, (ignored, existing) -> {
            if (existing != null) existing.future().cancel(false);
            return createPending(key);
        });
    }

    public void ensureScheduled(String userId, String date) {
        ReportKey key = new ReportKey(userId, date);
        pending.computeIfAbsent(key, this::createPending);
    }

    private PendingRefresh createPending(ReportKey key) {
        String token = UUID.randomUUID().toString();
        Instant runAt = Instant.now().plusSeconds(properties.getReportRefreshDelaySeconds());
        ScheduledFuture<?> future = scheduler.schedule(() -> refresh(key, token), runAt);
        return new PendingRefresh(token, Objects.requireNonNull(future));
    }

    private void refresh(ReportKey key, String token) {
        PendingRefresh current = pending.get(key);
        if (current == null || !current.token().equals(token)) return;
        try {
            reportService.generate(key.userId(), key.date(), reportService.userTimezone(key.userId()));
            log.info("Daily report refreshed asynchronously userId={} date={}", key.userId(), key.date());
        } catch (Exception error) {
            log.error("Daily report refresh failed userId={} date={}", key.userId(), key.date(), error);
        } finally {
            pending.computeIfPresent(key, (ignored, latest) -> latest.token().equals(token) ? null : latest);
        }
    }

    record ReportKey(String userId, String date) {}
    record PendingRefresh(String token, ScheduledFuture<?> future) {}
}
