package io.dev.cs_flow.dto;

/**
 * 내 학습 페이지에 내려주는 공개 토픽 한 줄.
 *
 * @param slug        토픽 영문 식별자
 * @param title       토픽 제목
 * @param subjectSlug 과목 영문 식별자
 */
public record TopicIndexItem(String slug, String title, String subjectSlug) {
}