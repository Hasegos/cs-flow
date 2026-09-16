package io.dev.cs_flow.controller;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.common.interceptor.VisitorCookieInterceptor;
import io.dev.cs_flow.service.TopicLikeService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 토픽 추천(좋아요) 토글 API를 처리하는 컨트롤러.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class TopicLikeController {

    private final TopicLikeService topicLikeService;

    /**
     * 토픽 추천을 토글한다(추천/추천 취소).
     * 방문자 식별은 {@link VisitorCookieInterceptor}가 설정한 쿠키 기반 요청 속성을 사용한다.
     *
     * @param topicSlug 토픽 영문 식별자
     * @param request   방문자 ID를 읽기 위한 현재 요청
     * @return 토글 후 추천 여부와 추천 수를 담은 JSON 응답
     */
    @PostMapping("/api/topic/{topicSlug}/like")
    public ResponseEntity<Map<String, Object>> toggleLike(@PathVariable String topicSlug,
                                                            HttpServletRequest request){
        if (!topicSlug.matches("^[a-z0-9\\-]+$")) {
            log.warn("비정상 topicSlug 감지 - topicSlug: {}", topicSlug);
            return ResponseEntity.badRequest().build();
        }

        String visitorId = (String) request.getAttribute(VisitorCookieInterceptor.REQUEST_ATTR);
        if (visitorId == null) {
            return ResponseEntity.badRequest().build();
        }

        try {
            TopicLikeService.LikeResult result = topicLikeService.toggleLike(topicSlug, visitorId);
            return ResponseEntity.ok(Map.of("liked", result.liked(), "count", result.count()));
        } catch (NotFoundException e) {
            log.warn("[404] 추천 토글 실패: {}", e.getMessage());
            return ResponseEntity.notFound().build();
        }
    }
}