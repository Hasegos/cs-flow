package io.dev.cs_flow.controller;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.common.interceptor.VisitorCookieInterceptor;
import io.dev.cs_flow.dto.PlanAnswerRequest;
import io.dev.cs_flow.dto.PlanCreateRequest;
import io.dev.cs_flow.dto.PlanUpdateRequest;
import io.dev.cs_flow.dto.PlanView;
import io.dev.cs_flow.service.StudyPlanService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 면접 계획 API를 처리하는 컨트롤러.
 * <p>
 * 로그인 없이 계획 생성 때 받은 공개 토큰으로만 접근한다. 토큰이 틀리면 404, 입력이 잘못되면 400을 돌려주고
 * 응답은 캐시하지 않는다.
 * </p>
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class StudyPlanController {

    private final StudyPlanService studyPlanService;

    /**
     * 면접 계획을 만든다.
     *
     * @param request 직무, 면접일, 시작일, 쉬는 요일, 하루 학습 시간
     * @param httpRequest 방문자 ID를 읽기 위한 현재 요청
     * @return 계획 공개 토큰을 담은 JSON 응답
     */
    @PostMapping("/api/plans")
    public ResponseEntity<?> create(@RequestBody PlanCreateRequest request, HttpServletRequest httpRequest) {
        String visitorId = (String) httpRequest.getAttribute(VisitorCookieInterceptor.REQUEST_ATTR);
        if (visitorId == null) {
            return ResponseEntity.badRequest().build();
        }
        try {
            String token = studyPlanService.create(request, visitorId);
            return noStore().body(Map.of("token", token));
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    /**
     * 계획의 달력, 오늘 할 일, 약한 과목을 조회한다.
     *
     * @param token 계획 공개 토큰
     * @return 계획 조회 결과
     */
    @GetMapping("/api/plans/{token}")
    public ResponseEntity<?> get(@PathVariable String token) {
        try {
            return noStore().body(studyPlanService.get(token));
        } catch (NotFoundException e) {
            return notFound(e);
        }
    }

    /**
     * 오늘 출제된 질문에 대한 답변을 기록한다.
     *
     * @param token   계획 공개 토큰
     * @param request 질문 ID, 체크한 키워드 비트, 자기 평가
     * @return 기록되면 빈 본문
     */
    @PostMapping("/api/plans/{token}/answers")
    public ResponseEntity<?> answer(@PathVariable String token, @RequestBody PlanAnswerRequest request) {
        try {
            studyPlanService.recordAnswer(token, request);
            return noStore().build();
        } catch (NotFoundException e) {
            return notFound(e);
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    /**
     * 면접일과 학습 조건을 바꾸고 다시 계산한 계획을 돌려준다.
     *
     * @param token   계획 공개 토큰
     * @param request 바꿀 값
     * @return 바뀐 계획 조회 결과
     */
    @PatchMapping("/api/plans/{token}")
    public ResponseEntity<?> update(@PathVariable String token, @RequestBody PlanUpdateRequest request) {
        try {
            PlanView view = studyPlanService.update(token, request);
            return noStore().body(view);
        } catch (NotFoundException e) {
            return notFound(e);
        } catch (IllegalArgumentException e) {
            return badRequest(e);
        }
    }

    /**
     * 200 응답을 캐시하지 않도록 {@code Cache-Control: no-store}를 붙인 빌더를 만든다.
     *
     * @return 응답 빌더
     */
    private ResponseEntity.BodyBuilder noStore() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore());
    }

    /**
     * 404 응답을 만들고 경고 로그를 남긴다.
     *
     * @param e 계획을 찾지 못한 예외
     * @return 본문 없는 404 응답
     */
    private ResponseEntity<?> notFound(NotFoundException e) {
        log.warn("[404] 면접 계획: {}", e.getMessage());
        return ResponseEntity.notFound().build();
    }

    /**
     * 400 응답을 만들고 경고 로그를 남긴다.
     *
     * @param e 입력 오류 예외
     * @return 오류 메시지를 담은 400 응답
     */
    private ResponseEntity<?> badRequest(IllegalArgumentException e) {
        log.warn("[400] 면접 계획: {}", e.getMessage());
        return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
    }
}