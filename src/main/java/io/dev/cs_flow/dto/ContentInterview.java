package io.dev.cs_flow.dto;

import java.util.List;

/**
 * 콘텐츠 JSON의 면접 질문 한 건. 토픽 파일의 {@code interview}에 들어간다. 질문과 답변만 채워져 있고 나머지는 자리만 있다.
 *
 * @param id        질문 ID ({과목}.{slug}.q{n})
 * @param question  질문
 * @param answer    답변
 * @param keywords  채점 핵심 키워드
 * @param followUps 꼬리 질문
 * @param level     난이도 (1 정의, 2 원리 · 비교, 3 심화 · 실무)
 * @param core      빈출 필수 질문 여부
 */
public record ContentInterview(
        String id,
        String question,
        String answer,
        List<String> keywords,
        List<String> followUps,
        Integer level,
        Boolean core
) {
}