package io.dev.cs_flow.dto;

/**
 * 태그와 해당 태그가 붙은 공개 토픽 수 (과목 페이지 태그 칩).
 *
 * @param tag   태그
 * @param count 토픽 수
 */
public record TagCount(String tag, long count) {
}