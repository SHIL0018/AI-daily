package com.activitydaily.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.mock.env.MockEnvironment;

class ProductionSafetyCheckTest {
    @Test
    void ignoresDevelopmentProfile() {
        ActivityDailyProperties properties = new ActivityDailyProperties();
        ProductionSafetyCheck check = new ProductionSafetyCheck(properties, new MockEnvironment());
        assertThatCode(() -> check.run(new DefaultApplicationArguments())).doesNotThrowAnyException();
    }

    @Test
    void rejectsWeakOrSharedProductionSecrets() {
        MockEnvironment environment = new MockEnvironment().withProperty("spring.profiles.active", "prod");
        environment.setActiveProfiles("prod");
        ActivityDailyProperties weak = properties("short", "another-short", List.of("https://daily.example.com"));
        assertThatThrownBy(() -> new ProductionSafetyCheck(weak, environment).run(new DefaultApplicationArguments()))
                .isInstanceOf(IllegalStateException.class);

        String shared = "a-strong-secret-that-is-long-enough-123456";
        ActivityDailyProperties same = properties(shared, shared, List.of("https://daily.example.com"));
        assertThatThrownBy(() -> new ProductionSafetyCheck(same, environment).run(new DefaultApplicationArguments()))
                .hasMessageContaining("must be different");
    }

    @Test
    void rejectsWildcardCorsAndAcceptsExplicitProductionConfiguration() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        ActivityDailyProperties wildcard = properties(
                "jwt-secret-that-is-long-enough-123456789",
                "api-secret-that-is-long-enough-987654321",
                List.of("*"));
        assertThatThrownBy(() -> new ProductionSafetyCheck(wildcard, environment).run(new DefaultApplicationArguments()))
                .hasMessageContaining("APP_ALLOWED_ORIGINS");

        ActivityDailyProperties valid = properties(
                "jwt-secret-that-is-long-enough-123456789",
                "api-secret-that-is-long-enough-987654321",
                List.of("https://daily.example.com"));
        assertThatCode(() -> new ProductionSafetyCheck(valid, environment).run(new DefaultApplicationArguments()))
                .doesNotThrowAnyException();
    }

    private ActivityDailyProperties properties(String jwt, String api, List<String> origins) {
        ActivityDailyProperties properties = new ActivityDailyProperties();
        properties.setJwtSecret(jwt);
        properties.setApiKeySecret(api);
        properties.setAllowedOrigins(origins);
        return properties;
    }
}
