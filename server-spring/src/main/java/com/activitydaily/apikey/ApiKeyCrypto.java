package com.activitydaily.apikey;

import com.activitydaily.config.ActivityDailyProperties;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class ApiKeyCrypto {
    private final ActivityDailyProperties properties;
    private final SecureRandom secureRandom = new SecureRandom();

    public ApiKeyCrypto(ActivityDailyProperties properties) {
        this.properties = properties;
    }

    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[12];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, iv));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array());
        } catch (Exception ex) {
            throw new IllegalStateException("api key encrypt failed", ex);
        }
    }

    public String decrypt(String ciphertext) {
        try {
            byte[] raw = Base64.getDecoder().decode(ciphertext);
            byte[] iv = new byte[12];
            byte[] encrypted = new byte[raw.length - 12];
            System.arraycopy(raw, 0, iv, 0, 12);
            System.arraycopy(raw, 12, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception ex) {
            return "";
        }
    }

    private byte[] key() throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return digest.digest(properties.getApiKeySecret().getBytes(StandardCharsets.UTF_8));
    }
}