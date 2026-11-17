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

    /**
     * 요청의 Host 헤더가 허용 목록에 없으면 400으로 응답하고 요청을 막는다.
     *
     * @param request  현재 HTTP 요청
     * @param response 현재 HTTP 응답
     * @param handler  실행될 핸들러
     * @return 허용된 Host면 true, 아니면 false
     * @throws Exception 오류 응답을 보내지 못했을 때
     */
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