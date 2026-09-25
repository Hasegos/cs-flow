package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.Topic;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
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
     * 조건에 맞는 공개된 토픽 ID 목록을 페이지 단위로 조회한다.
     * <p>
     * collection fetch join과 Pageable 충돌을 피하기 위해 ID만 먼저 페이징 조회한다.
     * 이후 {@link #findTopicsWithTagsByIds(List)}로 tags를 함께 로딩한다.
     * 조건 파라미터는 null 대신 빈 문자열/전체 패턴을 받는다(PostgreSQL null 파라미터 타입 추론 문제 회피).
     * </p>
     *
     * @param subjectSlug 과목 영문 식별자, 빈 문자열이면 전체 과목
     * @param tag         정확히 일치해야 하는 태그, 빈 문자열이면 태그 조건 없음
     * @param pattern     공백을 뺀 제목 또는 태그에 대한 소문자 LIKE 패턴('!'로 이스케이프), 조건 없으면 "%"
     * @param pageable    페이지 정보
     * @return 공개된 토픽 ID Page 객체
     */
    @Query(
            value = """
            SELECT t.topicId FROM Topic t
            WHERE t.isPublished = true
            AND (:subjectSlug = '' OR t.subject.slug = :subjectSlug)
            AND (:tag = '' OR EXISTS (SELECT 1 FROM TopicTag tg WHERE tg.topic = t AND tg.tag = :tag))
            AND (REPLACE(LOWER(t.title), ' ', '') LIKE :pattern ESCAPE '!'
                 OR EXISTS (SELECT 1 FROM TopicTag tq WHERE tq.topic = t AND REPLACE(LOWER(tq.tag), ' ', '') LIKE :pattern ESCAPE '!'))
            """,
            countQuery = """
            SELECT COUNT(t) FROM Topic t
            WHERE t.isPublished = true
            AND (:subjectSlug = '' OR t.subject.slug = :subjectSlug)
            AND (:tag = '' OR EXISTS (SELECT 1 FROM TopicTag tg WHERE tg.topic = t AND tg.tag = :tag))
            AND (REPLACE(LOWER(t.title), ' ', '') LIKE :pattern ESCAPE '!'
                 OR EXISTS (SELECT 1 FROM TopicTag tq WHERE tq.topic = t AND REPLACE(LOWER(tq.tag), ' ', '') LIKE :pattern ESCAPE '!'))
            """
    )
    Page<Long> searchPublishedTopicIds(
            @Param("subjectSlug") String subjectSlug,
            @Param("tag") String tag,
            @Param("pattern") String pattern,
            Pageable pageable
    );

    /**
     * 토픽 ID 목록으로 tags와 subject를 포함한 토픽 목록을 조회한다.
     *
     * @param topicIds 조회할 토픽 ID 목록
     * @return tags와 subject가 로딩된 토픽 목록
     */
    @Query("""
            SELECT t FROM Topic t
            LEFT JOIN FETCH t.tags
            LEFT JOIN FETCH t.subject
            WHERE t.topicId IN :topicIds
            ORDER BY t.topicId ASC
            """)
    List<Topic> findTopicsWithTagsByIds(@Param("topicIds") List<Long> topicIds);

    /**
     * 과목 slug와 토픽 slug로 공개된 토픽 단건을 조회한다.
     *
     * @param subjectSlug 과목 영문 식별자 (URL 경로에 사용)
     * @param topicSlug   토픽 영문 식별자 (URL 경로에 사용)
     * @return 공개된 토픽 Optional, 없으면 {@code Optional.empty()} 반환
     */
    @Query("""
            SELECT t FROM Topic t
            LEFT JOIN FETCH t.subject
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

    /**
     * slug로 공개된 토픽 단건을 조회한다. (과목 무관, slug는 전역 유일)
     *
     * @param slug 토픽 영문 식별자
     * @return 공개된 토픽 Optional, 없으면 {@code Optional.empty()} 반환
     */
    Optional<Topic> findBySlugAndIsPublishedTrue(String slug);

    /**
     * 토픽의 조회수를 1 증가시키고, 그 시각을 함께 기록한다.
     * <p>
     * {@code viewCountUpdatedAt}은 조회수 정렬에서 동점일 때 "먼저 그 조회수에 도달한" 토픽이
     * 위로 오도록 하는 2차 정렬 기준으로 쓰인다.
     * </p>
     *
     * @param topicId 대상 토픽 ID
     */
    @Modifying
    @Query("UPDATE Topic t SET t.viewCount = t.viewCount + 1, t.viewCountUpdatedAt = CURRENT_TIMESTAMP WHERE t.topicId = :topicId")
    void incrementViewCount(@Param("topicId") Long topicId);

    /**
     * 토픽의 추천 수를 1 증가시키고, 그 시각을 함께 기록한다.
     * <p>
     * {@code likeCountUpdatedAt}은 추천수 정렬에서 동점일 때 "먼저 그 추천수에 도달한" 토픽이
     * 위로 오도록 하는 2차 정렬 기준으로 쓰인다.
     * </p>
     *
     * @param topicId 대상 토픽 ID
     */
    @Modifying
    @Query("UPDATE Topic t SET t.likeCount = t.likeCount + 1, t.likeCountUpdatedAt = CURRENT_TIMESTAMP WHERE t.topicId = :topicId")
    void incrementLikeCount(@Param("topicId") Long topicId);

    /**
     * 토픽의 추천 수를 1 감소시킨다(0 미만으로는 내려가지 않음).
     *
     * @param topicId 대상 토픽 ID
     */
    @Modifying
    @Query("UPDATE Topic t SET t.likeCount = t.likeCount - 1, t.likeCountUpdatedAt = CURRENT_TIMESTAMP WHERE t.topicId = :topicId AND t.likeCount > 0")
    void decrementLikeCount(@Param("topicId") Long topicId);
}