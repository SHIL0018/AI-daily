package com.activitydaily.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

public final class TextUtil {
    public static final Set<String> CATEGORIES = Set.of("编程开发", "文档写作", "论文阅读", "数据分析", "模型训练", "会议沟通", "信息检索", "娱乐休息", "系统操作", "空闲", "隐私", "其他");
    public static final Set<String> PRIVACY_LEVELS = Set.of("normal", "private", "redacted");
    private static final Pattern[] SENSITIVE_PATTERNS = new Pattern[] {
            Pattern.compile("(?i)(api[_-]?key|token|secret|password)\\s*[:=]\\s*\\S+"),
            Pattern.compile("\\b\\d{15,18}\\b"),
            Pattern.compile("\\b\\d{13,19}\\b"),
            Pattern.compile("\\b1[3-9]\\d{9}\\b"),
            Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.-]+")
    };

    private TextUtil() {}

    public static String newId() {
        return UUID.randomUUID().toString();
    }

    public static String redact(String value) {
        if (value == null) return null;
        String result = value;
        for (Pattern pattern : SENSITIVE_PATTERNS) {
            result = pattern.matcher(result).replaceAll("[已脱敏]");
        }
        return result.length() > 600 ? result.substring(0, 600) : result;
    }

    public static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}