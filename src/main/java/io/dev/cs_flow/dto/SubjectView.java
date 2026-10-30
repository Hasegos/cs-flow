package io.dev.cs_flow.dto;

/**
 * 화면에 보여 줄 과목 정보. 콘텐츠 JSON에서 만든다.
 *
 * @param slug        과목 영문 식별자
 * @param name        과목 이름
 * @param colorAccent 강조 색상
 */
public record SubjectView(String slug, String name, String colorAccent) {
}