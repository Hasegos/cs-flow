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
    private static final int MAX_UA_LENGTH = 200;

    /**
     * HTTP 요청 전처리 단계에서 사용자 접근 정보를 로그에 기록한다.
     * <p>
     * Cloudflare 프록시 환경에서 실제 사용자 IP를 추출하기 위해
     * {@code CF-Connecting-IP} → {@code RemoteAddr} 순서로 확인한다.
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
                ip = request.getRemoteAddr();
            }

            String ua = request.getHeader("User-Agent");
            if(ua != null){
                ua = ua.replaceAll("[\r\n\t]", "_");
                ua = ua.substring(0, Math.min(ua.length(), MAX_UA_LENGTH));
            }
            else{
                ua = "unknown";
            }

            log.info("IP={} METHOD={} URI={} UA={}",
                    ip,
                    request.getMethod(),
                    maskPlanToken(request.getRequestURI()),
                    ua);

        } catch (Exception e) {
            log.warn("접근 로그 기록 실패: {}", e.getMessage());
        }

        return true;
    }

    /**
     * 면접 계획 API 경로의 공개 토큰을 로그에 남기지 않도록 가린다. 토큰을 아는 사람은 계획을 조회 · 수정할 수 있다.
     *
     * @param uri 요청 경로
     * @return 토큰 자리를 {@code {token}}으로 바꾼 경로
     */
    private String maskPlanToken(String uri) {
        return uri.replaceFirst("^/api/plans/[^/]+", "/api/plans/{token}");
    }
}
