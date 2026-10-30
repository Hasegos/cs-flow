package io.dev.cs_flow.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 면접 · 시험 대비 학습 계획 엔티티.
 * <p>
 * 로그인 없이 {@code public_token}으로만 접근한다. 하루 일정 자체는 저장하지 않고
 * 시작일 · 목표일 · 직무 · 쉬는 요일 · 하루 시간 · seed와 답변 기록으로 그때마다 계산한다.
 * </p>
 */
@Entity
@Getter
@Table(name = "study_plan")
@NoArgsConstructor
public class StudyPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "public_token", nullable = false, length = 64, unique = true)
    private String publicToken;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private PlanType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private PlanRole role;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "target_date", nullable = false)
    private LocalDate targetDate;

    @Column(name = "rest_weekdays", nullable = false, length = 80)
    private String restWeekdays;

    @Column(name = "daily_minutes", nullable = false)
    private int dailyMinutes;

    @Column(name = "seed", nullable = false)
    private long seed;

    @Column(name = "visitor_id", nullable = false, length = 36)
    private String visitorId;

    @Column(name = "subscription_id")
    private Long subscriptionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PlanStatus status;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public StudyPlan(String publicToken, PlanType type, PlanRole role, LocalDate startDate, LocalDate targetDate,
                     String restWeekdays, int dailyMinutes, long seed, String visitorId, LocalDateTime now) {
        this.publicToken = publicToken;
        this.type = type;
        this.role = role;
        this.startDate = startDate;
        this.targetDate = targetDate;
        this.restWeekdays = restWeekdays;
        this.dailyMinutes = dailyMinutes;
        this.seed = seed;
        this.visitorId = visitorId;
        this.status = PlanStatus.ACTIVE;
        this.createdAt = now;
        this.updatedAt = now;
    }

    /**
     * 면접일과 학습 조건을 바꾼다. 시작일과 seed는 그대로 둔다.
     *
     * @param role         직무
     * @param targetDate   면접일
     * @param restWeekdays 쉬는 요일
     * @param dailyMinutes 하루 학습 시간(분)
     * @param now          변경 시각
     */
    public void changeConditions(PlanRole role, LocalDate targetDate, String restWeekdays, int dailyMinutes,
                                 LocalDateTime now) {
        this.role = role;
        this.targetDate = targetDate;
        this.restWeekdays = restWeekdays;
        this.dailyMinutes = dailyMinutes;
        this.updatedAt = now;
    }
}