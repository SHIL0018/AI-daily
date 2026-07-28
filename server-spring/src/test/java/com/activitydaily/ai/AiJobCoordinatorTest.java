package com.activitydaily.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.ApplicationArguments;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class AiJobCoordinatorTest {
    @AfterEach
    void cleanTransactionState() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void schedulesOnlyOnceAndWaitsForCommit() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        AiService aiService = mock(AiService.class);
        @SuppressWarnings("unchecked") ObjectProvider<AiService> provider = mock(ObjectProvider.class);
        when(provider.getObject()).thenReturn(aiService);
        List<Runnable> tasks = new ArrayList<>();
        Executor executor = tasks::add;
        AiJobCoordinator coordinator = new AiJobCoordinator(jdbc, executor, provider);

        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        coordinator.scheduleAfterCommit("job-1");
        coordinator.scheduleAfterCommit("job-1");
        assertThat(tasks).isEmpty();

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        assertThat(tasks).hasSize(1);
        tasks.get(0).run();
        verify(aiService).runJob("job-1");
    }

    @Test
    void recoversPendingAndRunningJobsAtStartup() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString())).thenReturn(1);
        when(jdbc.queryForList(anyString())).thenReturn(List.of(Map.of("id", "job-1"), Map.of("id", "job-2")));
        AiService aiService = mock(AiService.class);
        @SuppressWarnings("unchecked") ObjectProvider<AiService> provider = mock(ObjectProvider.class);
        when(provider.getObject()).thenReturn(aiService);
        List<Runnable> tasks = new ArrayList<>();
        AiJobCoordinator coordinator = new AiJobCoordinator(jdbc, tasks::add, provider);

        coordinator.run(mock(ApplicationArguments.class));

        assertThat(tasks).hasSize(2);
        tasks.forEach(Runnable::run);
        verify(aiService, times(1)).runJob("job-1");
        verify(aiService, times(1)).runJob("job-2");
    }
}
