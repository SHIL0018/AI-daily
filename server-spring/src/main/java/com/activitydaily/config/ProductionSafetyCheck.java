package com.activitydaily.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class ProductionSafetyCheck implements ApplicationRunner {
    private static final String DEFAULT_SECRET = "change-this-token-secret-before-production";

    private final ActivityDailyProperties properties;
    private final String datasourceUrl;

    public ProductionSafetyCheck(ActivityDailyProperties properties, @Value("${spring.datasource.url}") String datasourceUrl) {
        this.properties = properties;
        this.datasourceUrl = datasourceUrl;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (datasourceUrl != null && datasourceUrl.startsWith("jdbc:h2:")) return;
        requireStrongSecret("APP_TOKEN_SECRET", properties.getJwtSecret());
        requireStrongSecret("APP_API_KEY_SECRET", properties.getApiKeySecret());
    }

    private void requireStrongSecret(String name, String value) {
        if (value == null || value.isBlank() || DEFAULT_SECRET.equals(value) || value.length() < 32) {
            throw new IllegalStateException(name + " must be set to a non-default value with at least 32 characters when using a production database");
        }
    }
}
