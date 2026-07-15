package com.activitydaily.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "activity-daily")
public class ActivityDailyProperties {
    private String jwtSecret;
    private String apiKeySecret;
    private long accessTokenMinutes;
    private long refreshTokenDays;
    private String deepseekBaseUrl;
    private String deepseekDefaultModel;
    private String deepseekDeepModel;
    private int deepseekTimeoutSeconds;
    private int deepseekMaxRetries;
    private List<String> allowedOrigins = List.of("*");

    public String getJwtSecret() { return jwtSecret; }
    public void setJwtSecret(String jwtSecret) { this.jwtSecret = jwtSecret; }
    public String getApiKeySecret() { return apiKeySecret; }
    public void setApiKeySecret(String apiKeySecret) { this.apiKeySecret = apiKeySecret; }
    public long getAccessTokenMinutes() { return accessTokenMinutes; }
    public void setAccessTokenMinutes(long accessTokenMinutes) { this.accessTokenMinutes = accessTokenMinutes; }
    public long getRefreshTokenDays() { return refreshTokenDays; }
    public void setRefreshTokenDays(long refreshTokenDays) { this.refreshTokenDays = refreshTokenDays; }
    public String getDeepseekBaseUrl() { return deepseekBaseUrl; }
    public void setDeepseekBaseUrl(String deepseekBaseUrl) { this.deepseekBaseUrl = deepseekBaseUrl; }
    public String getDeepseekDefaultModel() { return deepseekDefaultModel; }
    public void setDeepseekDefaultModel(String deepseekDefaultModel) { this.deepseekDefaultModel = deepseekDefaultModel; }
    public String getDeepseekDeepModel() { return deepseekDeepModel; }
    public void setDeepseekDeepModel(String deepseekDeepModel) { this.deepseekDeepModel = deepseekDeepModel; }
    public int getDeepseekTimeoutSeconds() { return deepseekTimeoutSeconds; }
    public void setDeepseekTimeoutSeconds(int deepseekTimeoutSeconds) { this.deepseekTimeoutSeconds = deepseekTimeoutSeconds; }
    public int getDeepseekMaxRetries() { return deepseekMaxRetries; }
    public void setDeepseekMaxRetries(int deepseekMaxRetries) { this.deepseekMaxRetries = deepseekMaxRetries; }
    public List<String> getAllowedOrigins() { return allowedOrigins; }
    public void setAllowedOrigins(List<String> allowedOrigins) { this.allowedOrigins = allowedOrigins == null || allowedOrigins.isEmpty() ? List.of("*") : allowedOrigins; }
}