package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.TopicView;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 토픽 방문(TopicView) 엔티티에 대한 데이터 접근 계층.
 */
public interface TopicViewRepository extends JpaRepository<TopicView, Long> {

    /**
     * 오늘 날짜 기준으로 해당 방문자의 조회 기록이 없을 때만 삽입한다.
     *
     * @param topicId   토픽 ID
     * @param visitorId 익명 방문자 식별자
     * @return 새로 삽입되었으면 1, 이미 오늘 조회한 기록이 있으면 0
     */
    @Modifying
    @Query(value = """
            INSERT INTO topic_view (topic_id, visitor_id, viewed_date)
            VALUES (:topicId, :visitorId, CURRENT_DATE)
            ON CONFLICT (topic_id, visitor_id, viewed_date) DO NOTHING
            """, nativeQuery = true)
    int recordViewIfNew(@Param("topicId") Long topicId, @Param("visitorId") String visitorId);
}