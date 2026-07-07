package com.activitydaily.activity;

import com.activitydaily.common.ApiResponse;
import com.activitydaily.security.CurrentUser;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/activity-records")
public class ActivityController {
    private final ActivityService service;
    private final CurrentUser currentUser;

    public ActivityController(ActivityService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @PostMapping("/batch")
    public ApiResponse<Map<String, Object>> upload(@Valid @RequestBody ActivityBatch request, Authentication auth) {
        return ApiResponse.ok(service.upload(currentUser.requireUserId(auth), request));
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> list(@RequestParam(required = false) String date,
                                                 @RequestParam(defaultValue = "1") int page,
                                                 @RequestParam(name = "page_size", defaultValue = "100") int pageSize,
                                                 @RequestParam(required = false) String category,
                                                 Authentication auth) {
        return ApiResponse.ok(service.list(currentUser.requireUserId(auth), date, page, pageSize, category));
    }

    @PatchMapping("/{recordId}")
    public ApiResponse<Map<String, Object>> patch(@PathVariable String recordId, @RequestBody ActivityPatch request, Authentication auth) {
        return ApiResponse.ok(service.patch(currentUser.requireUserId(auth), recordId, request));
    }

    @DeleteMapping("/{recordId}")
    public ApiResponse<Map<String, Object>> delete(@PathVariable String recordId, Authentication auth) {
        service.delete(currentUser.requireUserId(auth), recordId);
        return ApiResponse.ok(Map.of());
    }

    public record ActivityBatch(@NotBlank @JsonProperty("device_id") String deviceId, @Size(max = 100) List<@Valid ActivityRecordIn> records) {}
    public record ActivityRecordIn(
            @NotBlank @JsonProperty("client_record_id") String clientRecordId,
            @NotBlank @JsonProperty("session_id") String sessionId,
            @NotBlank @JsonProperty("start_time") String startTime,
            @NotBlank @JsonProperty("end_time") String endTime,
            @Positive @JsonProperty("duration_seconds") int durationSeconds,
            @JsonProperty("app_name") String appName,
            @JsonProperty("window_title") String windowTitle,
            @JsonProperty("process_name") String processName,
            @NotBlank String summary,
            @NotBlank String category,
            Double confidence,
            @JsonProperty("privacy_level") String privacyLevel,
            Map<String, Object> metadata
    ) {}
    public record ActivityPatch(String summary, String category, @JsonProperty("start_time") String startTime, @JsonProperty("end_time") String endTime, @JsonProperty("app_name") String appName) {}
}