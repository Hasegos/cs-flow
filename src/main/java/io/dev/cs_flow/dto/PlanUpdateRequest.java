package io.dev.cs_flow.dto;

import io.dev.cs_flow.model.PlanRole;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

/**
 * 면접 계획 조건 변경 요청 본문. 비운 값은 그대로 둔다.
 *
 * @param role         직무
 * @param targetDate   면접일
 * @param restWeekdays 쉬는 요일, 빈 리스트면 쉬지 않는다
 * @param dailyMinutes 하루 학습 시간(분). 30, 45, 60
 */
public record PlanUpdateRequest(PlanRole role, LocalDate targetDate, List<DayOfWeek> restWeekdays,
                                Integer dailyMinutes) {
}