package com.activitydaily.auth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.activitydaily.common.ApiException;
import com.activitydaily.config.ActivityDailyProperties;
import com.activitydaily.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthServiceTest {
    @Test
    void doesNotWriteUsersWhenRegistrationIsDisabled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ActivityDailyProperties properties = new ActivityDailyProperties();
        properties.setRegistrationEnabled(false);
        AuthService service = new AuthService(jdbc, mock(PasswordEncoder.class), mock(JwtService.class), properties);

        assertThatThrownBy(() -> service.register(new AuthController.RegisterRequest("user@example.com", "user", "password123")))
                .isInstanceOf(ApiException.class)
                .extracting(error -> ((ApiException) error).getCode())
                .isEqualTo("REGISTRATION_DISABLED");
        verifyNoInteractions(jdbc);
    }
}
