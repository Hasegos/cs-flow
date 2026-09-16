package io.dev.cs_flow.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 토픽 추천(좋아요) 엔티티.
 * <p>
 * 로그인 없이 익명 {@code visitor_id}(쿠키) 기준으로 토픽당 1회만 존재한다.
 * 취소(추천 해제)는 이 레코드를 삭제하는 방식으로 처리한다.
 * </p>
 */
@Entity
@Getter
@Table(name = "topic_like")
@NoArgsConstructor
public class TopicLike {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "topic_id", nullable = false)
    private Topic topic;

    @Column(name = "visitor_id", nullable = false, length = 36)
    private String visitorId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public TopicLike(Topic topic, String visitorId, LocalDateTime createdAt) {
        this.topic = topic;
        this.visitorId = visitorId;
        this.createdAt = createdAt;
    }
}