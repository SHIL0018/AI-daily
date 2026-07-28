package com.activitydaily.activity;

import com.activitydaily.common.ApiResponse;
import com.activitydaily.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v2/activities")
public class ActivityV2Controller {
    private final ActivityService service;
    private final CurrentUser currentUser;

    public ActivityV2Controller(ActivityService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @PostMapping("/batch")
    public ApiResponse<Map<String, Object>> upload(@Valid @RequestBody ActivityController.ActivityBatch request,
                                                   Authentication auth) {
        return ApiResponse.ok(service.upload(currentUser.requireUserId(auth), request).v2Response());
    }

    @org.springframework.web.bind.annotation.GetMapping
    public ApiResponse<Map<String, Object>> list(@RequestParam(required = false) String date,
                                                 @RequestParam(defaultValue = "1") int page,
                                                 @RequestParam(name = "page_size", defaultValue = "50") int pageSize,
                                                 @RequestParam(required = false) String category,
                                                 @RequestParam(name = "app_name", required = false) String appName,
                                                 @RequestParam(name = "q", required = false) String keyword,
                                                 @RequestParam(defaultValue = "start_time") String sort,
                                                 @RequestParam(defaultValue = "desc") String direction,
                                                 Authentication auth) {
        return ApiResponse.ok(service.list(currentUser.requireUserId(auth), date, page, pageSize, category, appName, keyword, sort, direction));
    }
}
