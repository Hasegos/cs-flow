package io.dev.cs_flow.dto;

/**
 * 퀴즈 정답 판정 요청 본문.
 *
 * @param questionId 문항 ID
 * @param selected   선택한 보기 (A~D)
 */
public record QuizAnswerRequest(Long questionId, String selected) {
}