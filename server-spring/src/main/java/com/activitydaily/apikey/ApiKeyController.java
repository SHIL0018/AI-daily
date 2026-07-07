package com.activitydaily.apikey;

import com.activitydaily.common.ApiResponse;
import com.activitydaily.security.CurrentUser;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/api-keys/deepseek")
public class ApiKeyController {
    private final ApiKeyService service;
    private final CurrentUser currentUser;

    public ApiKeyController(ApiKeyService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> get(Authentication auth) {
        return ApiResponse.ok(service.getStatus(currentUser.requireUserId(auth)));
    }

    @PutMapping
    public ApiResponse<Map<String, Object>> save(@Valid @RequestBody ApiKeyRequest request, Authentication auth) {
        return ApiResponse.ok(service.save(currentUser.requireUserId(auth), request.apiKey()));
    }

    @DeleteMapping
    public ApiResponse<Map<String, Object>> delete(Authentication auth) {
        return ApiResponse.ok(service.delete(currentUser.requireUserId(auth)));
    }

    public record ApiKeyRequest(@NotBlank @JsonProperty("api_key") String apiKey) {}
}