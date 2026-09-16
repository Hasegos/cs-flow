package io.dev.cs_flow.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * 토픽 방문(조회) 기록 엔티티.
 * <p>
 * 익명 {@code visitor_id}(쿠키) 기준으로 토픽당 하루 1건만 존재하도록 제약되어,
 * 새로고침/스크립트로 인한 조회수 중복 집계를 방지한다.
 * 실제 삽입은 {@code ON CONFLICT DO NOTHING} 네이티브 쿼리로 처리하므로
 * 이 엔티티는 Java 코드에서 직접 생성하지 않는다.
 * </p>
 */
@Entity
@Getter
@Table(name = "topic_view")
@NoArgsConstructor
public class TopicView {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "topic_id", nullable = false)
    private Topic topic;

    @Column(name = "visitor_id", nullable = false, length = 36)
    private String visitorId;

    @Column(name = "viewed_date", nullable = false)
    private LocalDate viewedDate;
}