package io.dev.cs_flow.model;

/**
 * 답변을 기록한 학습 단계. 학습일, 약점 보충일(복습), 실전 모의.
 */
public enum PlanPhase {
    LEARN,
    REVIEW,
    MOCK
}