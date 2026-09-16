package io.dev.cs_flow.common.interceptor;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.UUID;

/**
 * 익명 방문자 식별용 쿠키를 발급/전달하는 인터셉터.
 * <p>
 * 로그인 없이 추천(좋아요) 토글과 조회수 중복 방지에 공통으로 사용할
 * {@code visitor_id} 쿠키가 없으면 새로 발급하고, 컨트롤러에서 바로 쓸 수 있도록
 * 요청 속성({@value #REQUEST_ATTR})에 담아 전달한다.
 * </p>
 */
@Component
public class VisitorCookieInterceptor implements HandlerInterceptor {

    public static final String COOKIE_NAME = "cv";
    public static final String REQUEST_ATTR = "visitorId";

    private static final int MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String visitorId = readVisitorCookie(request);

        if (visitorId == null) {
            visitorId = UUID.randomUUID().toString();
            response.addCookie(buildVisitorCookie(visitorId));
        }

        request.setAttribute(REQUEST_ATTR, visitorId);
        return true;
    }

    private String readVisitorCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private Cookie buildVisitorCookie(String visitorId) {
        Cookie cookie = new Cookie(COOKIE_NAME, visitorId);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        cookie.setSecure(true);
        cookie.setMaxAge(MAX_AGE_SECONDS);
        cookie.setAttribute("SameSite", "Lax");
        return cookie;
    }
}
