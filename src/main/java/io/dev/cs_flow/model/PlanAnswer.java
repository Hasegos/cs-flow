package io.dev.cs_flow.model;

import io.dev.cs_flow.model.enums.PlanPhase;
import io.dev.cs_flow.model.enums.SelfRating;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 학습 계획에서 면접 질문 하나에 한 번 답한 기록.
 * <p>
 * 오답 노트와 약점은 이 기록에서 계산하며 따로 저장하지 않는다. 같은 질문을 복습하면 행이 하나 더 쌓인다.
 * {@code keyword_mask}는 질문의 {@code keywords} 순서대로 체크한 키워드를 비트로 담는다.
 * </p>
 */
@Entity
@Getter
@Table(name = "plan_answer")
@NoArgsConstructor
public class PlanAnswer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "plan_id", nullable = false)
    private Long planId;

    @Column(name = "question_id", nullable = false, length = 120)
    private String questionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "phase", nullable = false, length = 20)
    private PlanPhase phase;

    @Column(name = "answered_on", nullable = false)
    private LocalDate answeredOn;

    @Column(name = "keyword_mask", nullable = false)
    private int keywordMask;

    @Column(name = "hit_count", nullable = false)
    private int hitCount;

    @Column(name = "total_count", nullable = false)
    private int totalCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "self_rating", length = 20)
    private SelfRating selfRating;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * 답변 기록을 만든다.
     *
     * @param planId      계획 ID
     * @param questionId  질문 ID
     * @param phase       기록 단계
     * @param answeredOn   답한 날짜
     * @param keywordMask 체크한 키워드 비트
     * @param hitCount     체크한 키워드 수
     * @param totalCount   질문의 키워드 수
     * @param selfRating  자기 평가, 없으면 null
     * @param now          기록 시각
     */
    public PlanAnswer(Long planId, String questionId, PlanPhase phase, LocalDate answeredOn, int keywordMask,
                      int hitCount, int totalCount, SelfRating selfRating, LocalDateTime now) {
        this.planId = planId;
        this.questionId = questionId;
        this.phase = phase;
        this.answeredOn = answeredOn;
        this.keywordMask = keywordMask;
        this.hitCount = hitCount;
        this.totalCount = totalCount;
        this.selfRating = selfRating;
        this.createdAt = now;
    }
}