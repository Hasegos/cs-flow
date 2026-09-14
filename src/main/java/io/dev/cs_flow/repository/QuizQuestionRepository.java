package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.QuizQuestion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * 퀴즈 문항(QuizQuestion) 엔티티에 대한 데이터 접근 계층.
 */
public interface QuizQuestionRepository extends JpaRepository<QuizQuestion, Long> {

    /**
     * 토픽 ID에 해당하는 퀴즈 문항을 출제 순서대로 조회한다.
     *
     * @param topicId 기준 토픽 ID
     * @return 출제 순서로 정렬된 문항 목록, 없으면 빈 리스트 반환
     */
    @Query("""
            SELECT q FROM QuizQuestion q
            WHERE q.topic.topicId = :topicId
            ORDER BY q.displayOrder ASC
            """)
    List<QuizQuestion> findByTopicIdOrderByDisplayOrder(@Param("topicId") Long topicId);
}
