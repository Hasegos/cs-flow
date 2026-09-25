package io.dev.cs_flow.repository;

import io.dev.cs_flow.dto.TagCount;
import io.dev.cs_flow.model.TopicTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * 토픽 태그(TopicTag) 엔티티에 대한 데이터 접근 계층.
 * <p>
 * 특정 토픽에 연결된 태그 목록 조회, 과목별 태그 집계 기능을 제공한다.
 * </p>
 */
public interface TopicTagRepository extends JpaRepository<TopicTag, Long> {

    /**
     * 특정 토픽 ID에 해당하는 태그 목록을 조회한다.
     *
     * @param topicId 조회할 토픽 ID
     * @return 해당 토픽의 태그 목록, 없으면 빈 리스트 반환
     */
    @Query("""
            SELECT tt FROM TopicTag tt
            WHERE tt.topic.topicId = :topicId
            """)
    List<TopicTag> findTagsByTopicId(@Param("topicId") Long topicId);

    /**
     * 과목에 속한 공개 토픽의 태그별 토픽 수를 집계한다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @return 태그와 토픽 수 목록 (토픽 수 내림차순, 태그 오름차순)
     */
    @Query("""
            SELECT new io.dev.cs_flow.dto.TagCount(tt.tag, COUNT(tt))
            FROM TopicTag tt
            JOIN tt.topic t
            JOIN t.subject s
            WHERE s.slug = :subjectSlug
            AND t.isPublished = true
            GROUP BY tt.tag
            ORDER BY COUNT(tt) DESC, tt.tag ASC
            """)
    List<TagCount> countPublishedTagsBySubjectSlug(@Param("subjectSlug") String subjectSlug);
}