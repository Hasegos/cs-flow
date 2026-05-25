package io.dev.cs_flow.common.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Set;

/**
 * Host 헤더를 검증하는 인터셉터.
 * <p>
 * 허용되지 않은 Host 헤더로 들어오는 요청을 차단하여
 * DNS Rebinding 공격을 방어한다.
 * </p>
 */
@Slf4j
@Component
public class HostValidationInterceptor implements HandlerInterceptor {

    private static final Set<String> ALLOWED_HOSTS = Set.of(
            "csflow.kr",
            "www.csflow.kr",
            "localhost:8082"
    );

    @Override
    public boolean preHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler) throws Exception {

        String host = request.getHeader("host");

        if (host == null || !ALLOWED_HOSTS.contains(host)) {
            log.warn("허용되지 않은 Host 헤더 감지 - Host: {}", host);
            response.sendError(HttpServletResponse.SC_BAD_REQUEST);
            return false;
        }

        return true;
    }
}