package io.dev.cs_flow.controller;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.service.QuizService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 퀴즈 정답 판정 API를 처리하는 컨트롤러.
 * <p>
 * 정답({@code correctOption})은 서버에서만 비교하며 응답에는 정답 일치 여부만 포함한다.
 * </p>
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class QuizController {

    private static final java.util.Set<String> VALID_OPTIONS = java.util.Set.of("A", "B", "C", "D");

    private final QuizService quizService;

    /**
     * 문항 ID와 선택한 보기를 받아 정답 여부를 응답한다.
     *
     * @param request 문항 ID와 선택한 보기를 담은 요청
     * @return 정답 여부를 담은 JSON 응답
     */
    @PostMapping("/api/quiz/check")
    public ResponseEntity<Map<String, Boolean>> checkAnswer(@RequestBody QuizAnswerRequest request){
        if (request.questionId() == null || request.selected() == null
                || !VALID_OPTIONS.contains(request.selected().toUpperCase())) {
            return ResponseEntity.badRequest().build();
        }

        try {
            boolean correct = quizService.checkAnswer(request.questionId(), request.selected());
            return ResponseEntity.ok(Map.of("correct", correct));
        } catch (NotFoundException e) {
            log.warn("[404] 퀴즈 정답 판정 실패: {}", e.getMessage());
            return ResponseEntity.notFound().build();
        }
    }

    public record QuizAnswerRequest(Long questionId, String selected) {}
}
