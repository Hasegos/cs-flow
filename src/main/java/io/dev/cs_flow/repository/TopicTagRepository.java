package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.TopicTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * 토픽 태그(TopicTag) 엔티티에 대한 데이터 접근 계층.
 * <p>
 * 특정 토픽에 연결된 태그 목록 조회 기능을 제공한다.
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
}