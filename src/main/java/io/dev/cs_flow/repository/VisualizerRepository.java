package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.Visualizer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * 시각화(Visualizer) 엔티티에 대한 데이터 접근 계층.
 * <p>
 * 토픽과 1:1 관계를 가지며, 토픽 ID 기반으로 시각화 정보를 조회한다.
 * </p>
 */
public interface VisualizerRepository extends JpaRepository<Visualizer, Long> {

    /**
     * 토픽 ID에 해당하는 시각화 정보를 조회한다.
     *
     * @param topicId 조회할 토픽 ID
     * @return 시각화 정보 Optional, 없으면 {@code Optional.empty()} 반환
     */
    @Query("""
            SELECT v FROM Visualizer v
            WHERE v.topic.topicId = :topicId
            """)
    Optional<Visualizer> findByTopicId (@Param("topicId") Long topicId);
}