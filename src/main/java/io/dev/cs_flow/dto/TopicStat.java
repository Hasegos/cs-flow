package io.dev.cs_flow.dto;

import java.time.LocalDateTime;

/**
 * 토픽의 조회수 · 추천수와 마지막 증가 시각 (DB {@code topic} 테이블, slug로 콘텐츠와 연결).
 *
 * @param slug                 토픽 영문 식별자
 * @param viewCount            조회수
 * @param viewCountUpdatedAt   조회수가 마지막으로 오른 시각, 없으면 null
 * @param likeCount            추천수
 * @param likeCountUpdatedAt   추천수가 마지막으로 바뀐 시각, 없으면 null
 */
public record TopicStat(
        String slug,
        long viewCount,
        LocalDateTime viewCountUpdatedAt,
        long likeCount,
        LocalDateTime likeCountUpdatedAt
) {
}