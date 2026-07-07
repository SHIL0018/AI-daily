package com.activitydaily;

import com.activitydaily.config.ActivityDailyProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableAsync;

@EnableAsync
@SpringBootApplication
@EnableConfigurationProperties(ActivityDailyProperties.class)
public class ActivityDailyApplication {
    public static void main(String[] args) {
        SpringApplication.run(ActivityDailyApplication.class, args);
    }
}