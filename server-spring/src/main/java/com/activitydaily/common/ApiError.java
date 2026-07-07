package com.activitydaily.common;

public record ApiError(ErrorDetail detail) {
    public static ApiError of(String code, String message) {
        return new ApiError(new ErrorDetail(code, message));
    }

    public record ErrorDetail(String code, String message) {}
}