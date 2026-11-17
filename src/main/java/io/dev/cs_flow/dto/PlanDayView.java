package io.dev.cs_flow.dto;

import io.dev.cs_flow.service.PlanEngine;

import java.time.LocalDate;

/**
 * 달력에 그리는 하루.
 *
 * @param date    날짜
 * @param type    하루의 성격
 * @param subject 한 과목만 다루는 학습일이면 그 과목 slug, 아니면 null
 * @param total   그날 출제하는 질문 수
 * @param done    그날 답한 질문 수
 */
public record PlanDayView(LocalDate date, PlanEngine.DayType type, String subject, int total, int done) {
}