package io.dev.cs_flow.dto;

import java.util.List;

/**
 * 오늘 풀 질문 한 건.
 *
 * @param id        질문 ID
 * @param subject   과목 slug
 * @param topicSlug 질문이 실린 토픽 slug
 * @param question  질문
 * @param answer    모범 답변
 * @param keywords  채점 핵심 키워드
 * @param done      오늘 이미 답했는지 여부
 */
public record PlanTaskView(String id, String subject, String topicSlug, String question, String answer,
                           List<String> keywords, boolean done) {

    /**
     * 질문 내용에 답변 여부를 붙인다.
     *
     * @param detail 질문 내용
     * @param done   오늘 답했는지 여부
     * @return 오늘 풀 질문
     */
    public static PlanTaskView of(InterviewDetail detail, boolean done) {
        return new PlanTaskView(detail.id(), detail.subject(), detail.topicSlug(), detail.question(),
                detail.answer(), detail.keywords(), done);
    }
}