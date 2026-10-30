package io.dev.cs_flow.dto;

import java.util.List;

/**
 * 학습 계획이 출제하는 면접 질문 한 건의 내용.
 *
 * @param id        질문 ID ({과목}.{slug}.q{n})
 * @param subject   과목 slug
 * @param topicSlug 질문이 실린 토픽 slug
 * @param question  질문
 * @param answer    답변
 * @param keywords  채점 핵심 키워드, 비어 있으면 빈 리스트
 */
public record InterviewDetail(String id, String subject, String topicSlug, String question, String answer,
                              List<String> keywords) {
}