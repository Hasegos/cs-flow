package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.TopicLike;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 토픽 추천(TopicLike) 엔티티에 대한 데이터 접근 계층.
 */
public interface TopicLikeRepository extends JpaRepository<TopicLike, Long> {

    Optional<TopicLike> findByTopic_TopicIdAndVisitorId(Long topicId, String visitorId);

    long countByTopic_TopicId(Long topicId);
}