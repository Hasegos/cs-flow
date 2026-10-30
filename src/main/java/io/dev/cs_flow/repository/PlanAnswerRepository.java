package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.PlanAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 계획의 답변 기록({@link PlanAnswer})에 대한 데이터 접근 계층.
 */
public interface PlanAnswerRepository extends JpaRepository<PlanAnswer, Long> {

    /**
     * 계획의 답변 기록을 쌓인 순서대로 조회한다.
     *
     * @param planId 계획 ID
     * @return 답변 기록 목록, 없으면 빈 리스트 반환
     */
    List<PlanAnswer> findByPlanIdOrderByIdAsc(Long planId);
}