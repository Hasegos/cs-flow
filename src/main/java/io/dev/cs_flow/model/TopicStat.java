package io.dev.cs_flow.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 토픽별 조회수 · 추천수 엔티티.
 * <p>
 * 콘텐츠 JSON의 토픽 {@code slug}를 기본키로 쓴다. 숫자는 {@code TopicStatRepository}의
 * upsert · UPDATE 쿼리로만 바꾸므로 이 엔티티는 Java 코드에서 직접 생성하거나 수정하지 않는다.
 * 갱신 시각은 같은 수일 때 먼저 도달한 토픽을 위로 올리는 2차 정렬 기준이다.
 * </p>
 */
@Entity
@Getter
@Table(name = "topic_stat")
@NoArgsConstructor
public class TopicStat {

    @Id
    @Column(name = "slug", length = 100)
    private String slug;

    @Column(name = "view_count", nullable = false)
    private long viewCount;

    @Column(name = "view_count_updated_at")
    private LocalDateTime viewCountUpdatedAt;

    @Column(name = "like_count", nullable = false)
    private long likeCount;

    @Column(name = "like_count_updated_at")
    private LocalDateTime likeCountUpdatedAt;
}