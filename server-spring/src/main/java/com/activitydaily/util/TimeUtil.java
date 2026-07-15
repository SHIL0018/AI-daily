package com.activitydaily.util;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;

public final class TimeUtil {
    public static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");

    private TimeUtil() {}

    public static Timestamp nowTs() {
        return Timestamp.from(Instant.now());
    }

    public static String dateFromIso(String value) {
        try {
            return ZonedDateTime.parse(normalizeIso(value)).withZoneSameInstant(SHANGHAI).toLocalDate().toString();
        } catch (Exception ignored) {
            return value != null && value.length() >= 10 ? value.substring(0, 10) : LocalDate.now(SHANGHAI).toString();
        }
    }

    public static String timeHHmm(String value) {
        try {
            return ZonedDateTime.parse(normalizeIso(value)).withZoneSameInstant(SHANGHAI).toLocalTime().toString().substring(0, 5);
        } catch (Exception ignored) {
            return value != null && value.length() >= 16 ? value.substring(11, 16) : "00:00";
        }
    }

    public static String startOfDateIso(String dateText) {
        return LocalDate.parse(dateText).atStartOfDay(SHANGHAI).toOffsetDateTime().toString();
    }

    public static String startOfNextDateIso(String dateText) {
        return LocalDate.parse(dateText).plusDays(1).atStartOfDay(SHANGHAI).toOffsetDateTime().toString();
    }

    private static String normalizeIso(String value) {
        return value.endsWith("Z") ? value.replace("Z", "+00:00") : value;
    }
}