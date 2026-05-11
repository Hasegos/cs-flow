package io.dev.cs_flow.common.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 사용자 접근 로그를 기록하는 인터셉터.
 * Cloudflare CF-Connecting-IP 헤더로 실제 사용자 IP를 추적한다.
 */
@Component
public class AccessLogInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger("ACCESS");

    /**
     * HTTP 요청 전처리 단계에서 사용자 접근 정보를 로그에 기록한다.
     * <p>
     * Cloudflare 프록시 환경에서 실제 사용자 IP를 추출하기 위해
     * {@code CF-Connecting-IP} → {@code X-Forwarded-For} → {@code RemoteAddr} 순서로 확인한다.
     * 로그 기록 실패 시에도 요청 처리는 계속 진행된다.
     * </p>
     *
     * @param request  HTTP 요청 객체
     * @param response HTTP 응답 객체
     * @param handler  실행될 핸들러
     * @return 항상 {@code true} — 로그 기록 실패 여부와 무관하게 요청을 통과시킨다
     */
    @Override
    public boolean preHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler) {
        try {
            String ip = request.getHeader("CF-Connecting-IP");
            if (ip == null || ip.isBlank()) {
                ip = request.getHeader("X-Forwarded-For");
            }
            if (ip == null || ip.isBlank()) {
                ip = request.getRemoteAddr();
            }

            log.info("IP={} METHOD={} URI={} UA={}",
                    ip,
                    request.getMethod(),
                    request.getRequestURI(),
                    request.getHeader("User-Agent"));

        } catch (Exception e) {
            log.warn("접근 로그 기록 실패: {}", e.getMessage());
        }

        return true;
    }
}
