package com.activitydaily.report;

import com.activitydaily.common.ApiResponse;
import com.activitydaily.security.CurrentUser;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/daily-reports")
public class ReportController {
    private final ReportService reportService;
    private final CurrentUser currentUser;

    public ReportController(ReportService reportService, CurrentUser currentUser) {
        this.reportService = reportService;
        this.currentUser = currentUser;
    }

    @GetMapping("/{dateText}")
    public ApiResponse<Map<String, Object>> get(@PathVariable String dateText, @RequestParam(name = "include_ai_analysis", defaultValue = "false") boolean includeAi, Authentication auth) {
        return ApiResponse.ok(reportService.getOrGenerate(currentUser.requireUserId(auth), dateText, includeAi));
    }

    @PostMapping("/{dateText}/regenerate")
    public ApiResponse<Map<String, Object>> regenerate(@PathVariable String dateText, Authentication auth) {
        reportService.generate(currentUser.requireUserId(auth), dateText, reportService.userTimezone(currentUser.requireUserId(auth)));
        return ApiResponse.ok(Map.of("status", "generated"));
    }

    @PatchMapping("/{dateText}")
    public ApiResponse<Map<String, Object>> patch(@PathVariable String dateText, @RequestBody ReportPatch request, Authentication auth) {
        reportService.updateNote(currentUser.requireUserId(auth), dateText, request.userNote());
        return ApiResponse.ok(Map.of());
    }

    @GetMapping("/{dateText}/export")
    public ResponseEntity<String> export(@PathVariable String dateText, @RequestParam(defaultValue = "markdown") String format, Authentication auth) {
        String userId = currentUser.requireUserId(auth);
        if ("json".equals(format)) {
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(reportService.exportJson(userId, dateText));
        }
        if ("csv".equals(format)) {
            return ResponseEntity.ok().contentType(MediaType.valueOf("text/csv;charset=UTF-8")).body(reportService.exportCsv(userId, dateText));
        }
        return ResponseEntity.ok().contentType(MediaType.valueOf("text/markdown;charset=UTF-8")).body(reportService.exportMarkdown(userId, dateText));
    }

    public record ReportPatch(@JsonProperty("user_note") String userNote) {}
}