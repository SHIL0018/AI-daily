package com.activitydaily.ai;

import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class AiJobCoordinator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AiJobCoordinator.class);
    private final JdbcTemplate jdbc;
    private final Executor executor;
    private final ObjectProvider<AiService> aiService;
    private final Set<String> scheduledJobs = ConcurrentHashMap.newKeySet();

    public AiJobCoordinator(JdbcTemplate jdbc,
                            @Qualifier("aiTaskExecutor") Executor executor,
                            ObjectProvider<AiService> aiService) {
        this.jdbc = jdbc;
        this.executor = executor;
        this.aiService = aiService;
    }

    public void scheduleAfterCommit(String jobId) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    schedule(jobId);
                }
            });
            return;
        }
        schedule(jobId);
    }

    public void schedule(String jobId) {
        if (!scheduledJobs.add(jobId)) return;
        CompletableFuture.runAsync(() -> aiService.getObject().runJob(jobId), executor)
                .whenComplete((ignored, error) -> {
                    scheduledJobs.remove(jobId);
                    if (error != null) log.error("AI job execution failed jobId={}", jobId, error);
                });
    }

    @Override
    public void run(ApplicationArguments args) {
        int recovered = jdbc.update("UPDATE ai_analysis_jobs SET status='pending', error_code=NULL, error_message=NULL, started_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE status='running'");
        jdbc.update("""
                UPDATE daily_reports SET ai_analysis_status='pending', updated_at=CURRENT_TIMESTAMP
                WHERE ai_analysis_job_id IN (SELECT id FROM ai_analysis_jobs WHERE status='pending')
                """);
        var pending = jdbc.queryForList("SELECT id FROM ai_analysis_jobs WHERE status='pending' ORDER BY created_at ASC");
        pending.forEach(row -> schedule(String.valueOf(row.get("id"))));
        if (recovered > 0 || !pending.isEmpty()) {
            log.info("Recovered AI jobs running={} pending={}", recovered, pending.size());
        }
    }
}
