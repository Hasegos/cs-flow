package io.dev.cs_flow.dto;

import java.util.Map;

/**
 * 콘텐츠 JSON의 개수 명세 (`content/manifest.json`). 추출 때 센 개수이고, 로더가 읽은 파일 개수와 맞춰 본다.
 *
 * @param subjects  과목 수
 * @param topics    토픽 수
 * @param quizzes   퀴즈 문항 수
 * @param errors    에러 사전 항목 수
 * @param bySubject 과목 slug별 개수
 */
public record ContentManifest(
        Integer subjects,
        Integer topics,
        Integer quizzes,
        Integer errors,
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