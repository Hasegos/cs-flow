package io.dev.cs_flow.dto;

/**
 * 토픽 페이지 모델에 담기는 면접 질문 한 건.
 *
 * @param id       질문 ID ({과목}.{slug}.q{n})
 * @param question 질문
 * @param answer   답변
 */
public record InterviewQuestionView(String id, String question, String answer) {
}