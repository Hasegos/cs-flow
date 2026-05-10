package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.Topic;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * 토픽(Topic) 엔티티에 대한 데이터 접근 계층.
 * <p>
 * 과목 slug / 토픽 slug 기반 조회 및 태그 기반 연관 토픽 조회 기능을 제공한다.
 * 모든 조회 메서드는 {@code isPublished = true}인 토픽만 반환한다.
 * </p>
 */
public interface TopicRepository extends JpaRepository<Topic,Long> {

    /**
     * 과목 slug에 해당하는 공개된 토픽 목록을 조회한다.
     *
     * @param subjectSlug 과목 영문 식별자 (URL 경로에 사용)
     * @return 공개된 토픽 목록, 없으면 빈 리스트 반환
     */
    @Query("""
            SELECT t FROM Topic t
            LEFT JOIN FETCH t.tags
            WHERE t.subject.slug = :subjectSlug
            AND t.isPublished = true
            """)
    List<Topic> findPublishedTopicsBySubjectSlug(@Param("subjectSlug") String subjectSlug);

    /**
     * 과목 slug와 토픽 slug로 공개된 토픽 단건을 조회한다.
     *
     * @param subjectSlug 과목 영문 식별자 (URL 경로에 사용)
     * @param topicSlug   토픽 영문 식별자 (URL 경로에 사용)
     * @return 공개된 토픽 Optional, 없으면 {@code Optional.empty()} 반환
     */
    @Query("""
            SELECT t FROM Topic t
            LEFT JOIN FETCH t.tags
            WHERE t.subject.slug = :subjectSlug
            AND t.slug = :topicSlug
            AND t.isPublished = true
            """)
    Optional<Topic> findPublishedTopic(@Param("subjectSlug") String subjectSlug,
                                       @Param("topicSlug") String topicSlug);

    /**
     * 특정 토픽과 동일한 태그를 가진 연관 토픽 목록을 조회한다.
     * <p>
     * 현재 토픽 본인은 결과에서 제외되며, 공개된 토픽만 반환한다.
     * </p>
     *
     * @param topicId 기준 토픽 ID
     * @return 태그가 겹치는 공개된 토픽 목록, 없으면 빈 리스트 반환
     */
    @Query("""
            SELECT DISTINCT t FROM Topic t
            LEFT JOIN FETCH t.tags
            LEFT JOIN FETCH t.subject
            JOIN t.tags tag
            WHERE tag.tag IN (
                SELECT tt.tag FROM TopicTag tt WHERE tt.topic.topicId = :topicId
            )
            AND t.topicId != :topicId
            AND t.isPublished = true
            """)
    List<Topic> findRelatedTopic(@Param("topicId") Long topicId);
}