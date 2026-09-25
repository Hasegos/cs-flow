package io.dev.cs_flow.dto;

/**
 * 추천 토글 결과.
 *
 * @param liked 토글 후 추천 여부
 * @param count 토글 후 추천 수
 */
public record LikeResult(boolean liked, long count) {
}