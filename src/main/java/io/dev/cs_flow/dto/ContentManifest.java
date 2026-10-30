package io.dev.cs_flow.dto;

import java.util.Map;

/**
 * 콘텐츠 JSON의 개수 명세 (`content/manifest.json`). 내보내기 스크립트가 DB 개수로 쓰고, 로더가 읽은 파일 개수와 맞춰 본다.
 *
 * @param subjects 과목 수
 * @param topics   토픽 수
 * @param quizzes  퀴즈 문항 수
 * @param bySubject 과목 slug별 개수
 */
public record ContentManifest(
        Integer subjects,
        Integer topics,
        Integer quizzes,
        Map<String, Count> bySubject
) {

    /**
     * 과목 하나의 개수.
     *
     * @param topics  토픽 수
     * @param quizzes 퀴즈 문항 수
     */
    public record Count(Integer topics, Integer quizzes) {
    }
}