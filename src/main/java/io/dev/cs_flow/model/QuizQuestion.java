package io.dev.cs_flow.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 토픽별 퀴즈 문항 엔티티.
 * <p>
 * 하나의 토픽은 여러 문항을 가질 수 있으며, {@code displayOrder} 순서로 출제된다.
 * 정답({@code correctOption})은 뷰에 노출되지 않고 정답 판정 시에만 서버에서 사용된다.
 * </p>
 */
@Entity
@Getter
@Table(name = "quiz_question")
@NoArgsConstructor
public class QuizQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "topic_id", nullable = false)
    private Topic topic;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "prompt", nullable = false, columnDefinition = "text")
    private String prompt;

    @Column(name = "option_a", nullable = false, columnDefinition = "text")
    private String optionA;

    @Column(name = "option_b", nullable = false, columnDefinition = "text")
    private String optionB;

    @Column(name = "option_c", nullable = false, columnDefinition = "text")
    private String optionC;

    @Column(name = "option_d", nullable = false, columnDefinition = "text")
    private String optionD;

    @Column(name = "correct_option", nullable = false, length = 1)
    private String correctOption;

    @Column(name = "hint", columnDefinition = "text")
    private String hint;

    @Column(name = "explanation", nullable = false, columnDefinition = "text")
    private String explanation;
}
