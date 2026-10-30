package io.dev.cs_flow.dto;

/**
 * 토픽 페이지의 "면접에서 이렇게 물어요"에 보이는 면접 질문 한 건.
 *
 * @param id       질문 ID ({과목}.{slug}.q{n})
 * @param question 질문
 * @param answer   답변
 */
public record InterviewQuestionView(String id, String question, String answer) {
}