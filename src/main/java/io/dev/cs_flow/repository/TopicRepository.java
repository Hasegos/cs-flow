package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.Topic;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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
     * 과목 slug에 해당하는 공개된 토픽 목록을 페이지 단위로 조회한다.
     * <p>
     * LEFT JOIN FETCH와 Pageable을 함께 사용하면 HibernateException이 발생하므로
     * countQuery를 별도로 분리한다.
     * </p>
     *
     * @param subjectSlug 과목 영문 식별자 (URL 경로에 사용)
     * @param pageable    페이지 정보 (page, size, sort)
     * @return 공개된 토픽 Page 객체
     */
    @Query(
        value = """
                SELECT t FROM Topic t
                LEFT JOIN FETCH t.tags
                WHERE t.subject.slug = :subjectSlug
                AND t.isPublished = true
                """,
        countQuery = """
                SELECT COUNT(t) FROM Topic t
                WHERE t.subject.slug = :subjectSlug
                AND t.isPublished = true
                """
    )
    Page<Topic> findPublishedTopicsBySubjectSlugPageable(
            @Param("subjectSlug") String subjectSlug,
            Pageable pageable
    );

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

    /**
     * sitemap 생성용으로 공개된 모든 토픽을 과목과 함께 조회한다.
     *
     * @return 공개된 토픽 전체 목록
     */
    @Query("""
            SELECT t FROM Topic t
            JOIN FETCH t.subject
            WHERE t.isPublished = true
            """)
    List<Topic> findAllPublished();
}