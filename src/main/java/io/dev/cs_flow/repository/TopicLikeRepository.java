package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.TopicLike;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 토픽 추천(TopicLike) 엔티티에 대한 데이터 접근 계층.
 */
public interface TopicLikeRepository extends JpaRepository<TopicLike, Long> {

    /**
     * 방문자가 토픽에 남긴 추천을 찾는다.
     *
     * @param topicSlug 토픽 영문 식별자
     * @param visitorId 익명 방문자 식별자
     * @return 추천 기록, 없으면 {@code Optional.empty()}
     */
    Optional<TopicLike> findByTopicSlugAndVisitorId(String topicSlug, String visitorId);

    /**
     * 토픽의 추천 수를 센다.
     *
     * @param topicSlug 토픽 영문 식별자
     * @return 추천 수
     */
    long countByTopicSlug(String topicSlug);
}