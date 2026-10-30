package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.enums.PlanStatus;
import io.dev.cs_flow.model.StudyPlan;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
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

    /**
     * 방문자가 진행 중인 계획 수를 센다. 면접일이 지난 계획은 세지 않는다.
     *
     * @param visitorId  익명 방문자 식별자
     * @param status     진행 상태
     * @param targetDate 이 날짜 이후에 면접이 있는 계획만 센다
     * @return 계획 수
     */
    long countByVisitorIdAndStatusAndTargetDateGreaterThanEqual(String visitorId, PlanStatus status,
                                                                LocalDate targetDate);
}