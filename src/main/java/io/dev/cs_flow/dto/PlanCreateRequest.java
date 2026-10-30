package io.dev.cs_flow.dto;

import io.dev.cs_flow.model.enums.PlanRole;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

/**
 * 면접 계획 만들기 요청 본문.
 *
 * @param role         직무
 * @param targetDate   면접일
 * @param startDate    시작일, 비우면 오늘
 * @param restWeekdays 쉬는 요일, 비우면 쉬지 않는다
 * @param dailyMinutes 하루 학습 시간(분). 30, 45, 60
 */
public record PlanCreateRequest(PlanRole role, LocalDate targetDate, LocalDate startDate,
                                List<DayOfWeek> restWeekdays, Integer dailyMinutes) {
}