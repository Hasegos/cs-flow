package io.dev.cs_flow.dto;

import io.dev.cs_flow.model.PlanRole;
import io.dev.cs_flow.model.PlanStatus;
import io.dev.cs_flow.service.PlanEngine;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

/**
 * 면접 계획 조회 결과. 달력, 오늘 할 일, 약한 과목을 한 번에 담는다.
 *
 * @param token        계획 공개 토큰
 * @param role         직무
 * @param startDate    시작일
 * @param targetDate   면접일
 * @param restWeekdays 쉬는 요일
 * @param dailyMinutes 하루 학습 시간(분)
 * @param status       진행 상태
 * @param today        서버 기준 오늘 날짜
 * @param daysLeft     면접까지 남은 날수, 지났으면 0
 * @param todayType    오늘의 성격, 계획 기간 밖이면 null
 * @param todayTasks   오늘 풀 질문
 * @param days         시작일부터 면접 전날까지의 달력
 * @param weakSubjects 약한 과목, 적중률이 낮은 순
 * @param droppedCount 밀린 질문이 넘쳐 뺀 개수
 */
public record PlanView(String token, PlanRole role, LocalDate startDate, LocalDate targetDate,
                       List<DayOfWeek> restWeekdays, int dailyMinutes, PlanStatus status, LocalDate today,
                       long daysLeft, PlanEngine.DayType todayType, List<PlanTaskView> todayTasks,
                       List<PlanDayView> days, List<String> weakSubjects, int droppedCount) {
}