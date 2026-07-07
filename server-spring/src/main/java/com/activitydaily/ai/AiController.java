package com.activitydaily.ai;

import com.activitydaily.common.ApiResponse;
import com.activitydaily.security.CurrentUser;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class AiController {
    private final AiService aiService;
    private final CurrentUser currentUser;

    public AiController(AiService aiService, CurrentUser currentUser) {
        this.aiService = aiService;
        this.currentUser = currentUser;
    }

    @PostMapping("/daily-reports/{dateText}/ai-analysis")
    public ApiResponse<Map<String, Object>> create(@PathVariable String dateText, @RequestBody AiAnalysisRequest request, Authentication auth) {
        return ApiResponse.ok(aiService.create(currentUser.requireUserId(auth), dateText, request));
    }

    @GetMapping("/ai-analysis-jobs/{jobId}")
    public ApiResponse<Map<String, Object>> get(@PathVariable String jobId, Authentication auth) {
        return ApiResponse.ok(aiService.getJob(currentUser.requireUserId(auth), jobId));
    }

    public record AiAnalysisRequest(
            @JsonProperty("analysis_type") String analysisType,
            String mode,
            @JsonProperty("force_regenerate") boolean forceRegenerate,
            String model
    ) {}
}