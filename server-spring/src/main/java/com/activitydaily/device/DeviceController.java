package com.activitydaily.device;

import com.activitydaily.common.ApiResponse;
import com.activitydaily.security.CurrentUser;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/devices")
public class DeviceController {
    private final DeviceService deviceService;
    private final CurrentUser currentUser;

    public DeviceController(DeviceService deviceService, CurrentUser currentUser) {
        this.deviceService = deviceService;
        this.currentUser = currentUser;
    }

    @PostMapping
    public ApiResponse<Map<String, Object>> create(@Valid @RequestBody DeviceCreate request, Authentication auth) {
        return ApiResponse.ok(deviceService.create(currentUser.requireUserId(auth), request));
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> list(Authentication auth) {
        return ApiResponse.ok(deviceService.list(currentUser.requireUserId(auth)));
    }

    @PatchMapping("/{deviceId}")
    public ApiResponse<Map<String, Object>> update(@PathVariable String deviceId, @Valid @RequestBody DeviceUpdate request, Authentication auth) {
        deviceService.update(currentUser.requireUserId(auth), deviceId, request.status());
        return ApiResponse.ok(Map.of());
    }

    public record DeviceCreate(
            @NotBlank @JsonProperty("device_name") String deviceName,
            @NotBlank @JsonProperty("os_type") String osType,
            @JsonProperty("os_version") String osVersion,
            @JsonProperty("client_version") String clientVersion
    ) {}
    public record DeviceUpdate(@NotBlank String status) {}
}