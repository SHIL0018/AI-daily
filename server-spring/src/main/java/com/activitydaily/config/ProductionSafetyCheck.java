package com.activitydaily.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

@Component
public class ProductionSafetyCheck implements ApplicationRunner {
    private static final String DEFAULT_SECRET = "change-this-token-secret-before-production";

    private final ActivityDailyProperties properties;
    private final Environment environment;

    public ProductionSafetyCheck(ActivityDailyProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!environment.acceptsProfiles(Profiles.of("prod"))) return;
        requireStrongSecret("APP_TOKEN_SECRET", properties.getJwtSecret());
        requireStrongSecret("APP_API_KEY_SECRET", properties.getApiKeySecret());
        if (properties.getJwtSecret().equals(properties.getApiKeySecret())) {
            throw new IllegalStateException("APP_TOKEN_SECRET and APP_API_KEY_SECRET must be different in production");
        }
        if (properties.getAllowedOrigins() == null || properties.getAllowedOrigins().isEmpty()
                || properties.getAllowedOrigins().stream().anyMatch(value -> value == null || value.isBlank() || "*".equals(value.trim()))) {
            throw new IllegalStateException("APP_ALLOWED_ORIGINS must contain explicit origins in production");
        }
    }

    private void requireStrongSecret(String name, String value) {
        if (value == null || value.isBlank() || DEFAULT_SECRET.equals(value) || value.length() < 32) {
            throw new IllegalStateException(name + " must be set to a non-default value with at least 32 characters in production");
        }
    }
}
