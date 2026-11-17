package io.dev.cs_flow.dto;

import io.dev.cs_flow.model.enums.SelfRating;

/**
 * 오늘 출제된 질문에 대한 답변 기록 요청 본문.
 *
 * @param questionId  질문 ID
 * @param keywordMask 체크한 키워드를 질문의 {@code keywords} 순서대로 담은 비트, 키워드가 있는 질문에서 쓴다
 * @param selfRating  자기 평가, 키워드가 없는 질문에서는 필수
 */
public record PlanAnswerRequest(String questionId, Integer keywordMask, SelfRating selfRating) {
}