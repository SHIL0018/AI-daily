package com.activitydaily.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;

public final class JsonUtil {
    private JsonUtil() {}

    public static String write(ObjectMapper mapper, Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalArgumentException("json encode failed", ex);
        }
    }

    public static Map<String, Object> readMap(ObjectMapper mapper, String value) {
        try {
            if (value == null || value.isBlank()) return Map.of();
            return mapper.readValue(value, new TypeReference<>() {});
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    public static List<Object> readList(ObjectMapper mapper, String value) {
        try {
            if (value == null || value.isBlank()) return List.of();
            return mapper.readValue(value, new TypeReference<>() {});
        } catch (Exception ignored) {
            return List.of();
        }
    }
}