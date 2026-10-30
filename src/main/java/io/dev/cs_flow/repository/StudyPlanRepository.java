package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.StudyPlan;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * 학습 계획({@link StudyPlan})에 대한 데이터 접근 계층.
 */
public interface StudyPlanRepository extends JpaRepository<StudyPlan, Long> {

    /**
     * 공개 토큰으로 계획을 찾는다.
     *
     * @param publicToken 계획 공개 토큰
     * @return 계획, 토큰이 틀리면 {@code Optional.empty()}
     */
    Optional<StudyPlan> findByPublicToken(String publicToken);
}