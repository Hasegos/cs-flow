package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.dto.InterviewDetail;
import io.dev.cs_flow.dto.PlanAnswerRequest;
import io.dev.cs_flow.dto.PlanCreateRequest;
import io.dev.cs_flow.dto.PlanDayView;
import io.dev.cs_flow.dto.PlanTaskView;
import io.dev.cs_flow.dto.PlanUpdateRequest;
import io.dev.cs_flow.dto.PlanView;
import io.dev.cs_flow.model.PlanAnswer;
import io.dev.cs_flow.model.enums.PlanPhase;
import io.dev.cs_flow.model.enums.PlanRole;
import io.dev.cs_flow.model.enums.PlanStatus;
import io.dev.cs_flow.model.enums.PlanType;
import io.dev.cs_flow.model.StudyPlan;
import io.dev.cs_flow.repository.PlanAnswerRepository;
import io.dev.cs_flow.repository.StudyPlanRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 면접 계획을 만들고 조회하고 답변을 기록하는 서비스.
 * <p>
 * 로그인 없이 {@code public_token}을 아는 사람만 그 계획에 접근한다. 모든 조회와 기록은 토큰으로 찾은 계획 하나로 한정되고,
 * 토큰이 틀리면 계획의 존재 여부를 알 수 없도록 똑같이 {@link NotFoundException}을 던진다.
 * 일정은 저장하지 않고 {@link PlanEngine}으로 요청마다 계산한다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StudyPlanService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final int MAX_ACTIVE_PER_VISITOR = 10;
    private static final int MAX_START_AHEAD_DAYS = 30;
    private static final int MAX_PERIOD_DAYS = 180;
    private static final int MAX_KEYWORDS = 30;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final StudyPlanRepository studyPlanRepository;
    private final PlanAnswerRepository planAnswerRepository;
    private final ContentStore contentStore;

    /**
     * 면접 계획을 만들고 공개 토큰을 돌려준다. 시작일을 비우면 오늘부터 시작한다.
     *
     * @param request   직무, 면접일, 시작일, 쉬는 요일, 하루 학습 시간
     * @param visitorId 익명 방문자 식별자
     * @return 계획 공개 토큰
     * @throws IllegalArgumentException 입력이 잘못됐거나 진행 중인 계획이 너무 많을 때
     */
    @Transactional
    public String create(PlanCreateRequest request, String visitorId) {
        if (request == null || request.role() == null || request.targetDate() == null
                || request.dailyMinutes() == null) {
            throw new IllegalArgumentException("직무, 면접일, 하루 학습 시간을 입력해 주세요.");
        }
        LocalDate today = today();
        LocalDate start = request.startDate() == null ? today : request.startDate();
        if (start.isBefore(today) || start.isAfter(today.plusDays(MAX_START_AHEAD_DAYS))) {
            throw new IllegalArgumentException("시작일은 오늘부터 " + MAX_START_AHEAD_DAYS + "일 안이어야 합니다.");
        }
        validatePeriod(start, request.targetDate(), request.dailyMinutes());
        String rest = joinRest(request.restWeekdays());
        if (studyPlanRepository.countByVisitorIdAndStatusAndTargetDateGreaterThanEqual(visitorId, PlanStatus.ACTIVE, today)
                >= MAX_ACTIVE_PER_VISITOR) {
            throw new IllegalArgumentException("진행 중인 계획은 " + MAX_ACTIVE_PER_VISITOR + "개까지 만들 수 있습니다.");
        }

        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        studyPlanRepository.save(new StudyPlan(token, PlanType.INTERVIEW, request.role(), start,
                request.targetDate(), rest, request.dailyMinutes(), RANDOM.nextLong(), visitorId,
                LocalDateTime.now()));
        log.info("면접 계획 생성 - role: {}, 기간: {} ~ {}", request.role(), start, request.targetDate());
        return token;
    }

    /**
     * 토큰으로 계획을 조회해 달력, 오늘 할 일, 약한 과목을 돌려준다.
     *
     * @param token 계획 공개 토큰
     * @return 계획 조회 결과
     * @throws NotFoundException 토큰에 해당하는 계획이 없을 때
     */
    @Transactional(readOnly = true)
    public PlanView get(String token) {
        StudyPlan plan = find(token);
        return view(plan, planAnswerRepository.findByPlanIdOrderByIdAsc(plan.getId()));
    }

    /**
     * 오늘 출제된 질문 하나에 대한 답변을 기록한다. 기록 단계는 오늘의 성격(학습 · 약점 보충 · 모의)으로 정한다.
     * 키워드가 있는 질문은 체크한 키워드 비트로 적중 수를 계산하고, 없는 질문은 자기 평가가 필요하다.
     *
     * @param token   계획 공개 토큰
     * @param request 질문 ID, 체크한 키워드 비트, 자기 평가
     * @throws NotFoundException        토큰에 해당하는 계획이 없을 때
     * @throws IllegalArgumentException 오늘 출제되지 않은 질문이거나 입력이 잘못됐을 때
     */
    @Transactional
    public void recordAnswer(String token, PlanAnswerRequest request) {
        StudyPlan plan = find(token);
        if (request == null || request.questionId() == null) {
            throw new IllegalArgumentException("질문 ID가 필요합니다.");
        }
        InterviewDetail detail = contentStore.interviewDetail(request.questionId())
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 질문입니다."));
        LocalDate today = today();
        List<PlanAnswer> answers = planAnswerRepository.findByPlanIdOrderByIdAsc(plan.getId());
        PlanEngine.Day day = schedule(plan, today, answers).days().stream()
                .filter(d -> d.date().equals(today))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("오늘은 학습 일정이 없습니다."));
        if (!day.questionIds().contains(detail.id())) {
            throw new IllegalArgumentException("오늘 출제된 질문이 아닙니다.");
        }

        int total = detail.keywords().size();
        int mask = 0;
        int hit = 0;
        if (total > 0) {
            mask = request.keywordMask() == null ? -1 : request.keywordMask();
            if (total > MAX_KEYWORDS || mask < 0 || (mask >>> total) != 0) {
                throw new IllegalArgumentException("키워드 선택값이 올바르지 않습니다.");
            }
            hit = Integer.bitCount(mask);
        } else if (request.selfRating() == null) {
            throw new IllegalArgumentException("자기 평가를 선택해 주세요.");
        }
        PlanPhase phase = switch (day.type()) {
            case LEARN -> PlanPhase.LEARN;
            case REVIEW -> PlanPhase.REVIEW;
            case MOCK -> PlanPhase.MOCK;
            case REST -> throw new IllegalArgumentException("쉬는 날입니다.");
        };
        planAnswerRepository.save(new PlanAnswer(plan.getId(), detail.id(), phase, today, mask, hit, total,
                request.selfRating(), LocalDateTime.now()));
    }

    /**
     * 면접일과 학습 조건을 바꾼다. 답변 기록은 그대로 두고 바뀐 조건으로 일정을 다시 계산해 돌려준다.
     *
     * @param token   계획 공개 토큰
     * @param request 바꿀 값, 비운 값은 그대로 둔다
     * @return 바뀐 계획 조회 결과
     * @throws NotFoundException        토큰에 해당하는 계획이 없을 때
     * @throws IllegalArgumentException 바꾼 값이 올바르지 않을 때
     */
    @Transactional
    public PlanView update(String token, PlanUpdateRequest request) {
        StudyPlan plan = find(token);
        if (request == null) {
            throw new IllegalArgumentException("바꿀 값이 필요합니다.");
        }
        PlanRole role = request.role() == null ? plan.getRole() : request.role();
        LocalDate target = request.targetDate() == null ? plan.getTargetDate() : request.targetDate();
        int minutes = request.dailyMinutes() == null ? plan.getDailyMinutes() : request.dailyMinutes();
        String rest = request.restWeekdays() == null ? plan.getRestWeekdays() : joinRest(request.restWeekdays());
        validatePeriod(plan.getStartDate(), target, minutes);
        if (!target.isAfter(today())) {
            throw new IllegalArgumentException("면접일은 오늘 이후여야 합니다.");
        }
        plan.changeConditions(role, target, rest, minutes, LocalDateTime.now());
        return view(plan, planAnswerRepository.findByPlanIdOrderByIdAsc(plan.getId()));
    }

    /**
     * 토큰으로 계획을 찾는다. 형식이 틀린 토큰과 없는 토큰을 구분하지 않고 똑같이 실패시킨다.
     *
     * @param token 계획 공개 토큰
     * @return 계획
     * @throws NotFoundException 토큰에 해당하는 계획이 없을 때
     */
    private StudyPlan find(String token) {
        if (token == null || !TOKEN.matcher(token).matches()) {
            throw new NotFoundException("존재하지 않는 계획입니다.");
        }
        return studyPlanRepository.findByPublicToken(token)
                .orElseThrow(() -> new NotFoundException("존재하지 않는 계획입니다."));
    }

    /**
     * 계획과 답변 기록으로 일정을 계산해 조회 결과를 만든다.
     *
     * @param plan    계획
     * @param answers 계획의 답변 기록
     * @return 달력, 오늘 할 일, 약한 과목을 담은 조회 결과
     */
    private PlanView view(StudyPlan plan, List<PlanAnswer> answers) {
        LocalDate today = today();
        PlanEngine.Schedule schedule = schedule(plan, today, answers);

        Map<LocalDate, Set<String>> answered = new HashMap<>();
        for (PlanAnswer a : answers) {
            answered.computeIfAbsent(a.getAnsweredOn(), k -> new HashSet<>()).add(a.getQuestionId());
        }
        List<PlanDayView> days = schedule.days().stream()
                .map(d -> new PlanDayView(d.date(), d.type(), d.subject(), d.questionIds().size(),
                        (int) d.questionIds().stream()
                                .filter(answered.getOrDefault(d.date(), Set.of())::contains).count()))
                .toList();

        PlanEngine.Day todayDay = schedule.days().stream().filter(d -> d.date().equals(today)).findFirst().orElse(null);
        Set<String> doneToday = answered.getOrDefault(today, Set.of());
        List<PlanTaskView> tasks = todayDay == null ? List.of() : todayDay.questionIds().stream()
                .map(contentStore::interviewDetail)
                .flatMap(java.util.Optional::stream)
                .map(q -> PlanTaskView.of(q, doneToday.contains(q.id())))
                .toList();

        return new PlanView(plan.getPublicToken(), plan.getRole(), plan.getStartDate(), plan.getTargetDate(),
                restDays(plan.getRestWeekdays()).stream().sorted().toList(), plan.getDailyMinutes(),
                plan.getStatus(), today, Math.max(0, ChronoUnit.DAYS.between(today, plan.getTargetDate())),
                todayDay == null ? null : todayDay.type(), tasks, days, schedule.weakSubjects(),
                schedule.droppedCount());
    }

    /**
     * 계획 조건으로 엔진을 실행한다.
     *
     * @param plan    계획
     * @param today   오늘 날짜
     * @param answers 계획의 답변 기록
     * @return 계산된 일정
     */
    private PlanEngine.Schedule schedule(StudyPlan plan, LocalDate today, List<PlanAnswer> answers) {
        PlanEngine.Spec spec = new PlanEngine.Spec(plan.getStartDate(), plan.getTargetDate(), plan.getRole(),
                restDays(plan.getRestWeekdays()), plan.getDailyMinutes(), plan.getSeed());
        return PlanEngine.compute(spec, today, contentStore.planQuestions(), answers);
    }

    /**
     * 학습 시간과 기간을 검증한다.
     *
     * @param start   시작일
     * @param target  면접일
     * @param minutes 하루 학습 시간(분)
     * @throws IllegalArgumentException 학습 시간이 지원 값이 아니거나 기간이 올바르지 않을 때
     */
    private void validatePeriod(LocalDate start, LocalDate target, int minutes) {
        PlanEngine.dailyCount(minutes);
        if (!target.isAfter(start)) {
            throw new IllegalArgumentException("면접일은 시작일보다 뒤여야 합니다.");
        }
        if (ChronoUnit.DAYS.between(start, target) > MAX_PERIOD_DAYS) {
            throw new IllegalArgumentException("계획 기간은 최대 " + MAX_PERIOD_DAYS + "일입니다.");
        }
    }

    /**
     * 쉬는 요일을 중복 없이 요일 순서대로 쉼표로 이어 붙인다.
     *
     * @param restWeekdays 쉬는 요일, null이면 쉬지 않는다
     * @return 요일 이름을 쉼표로 이은 문자열, 쉬지 않으면 빈 문자열
     * @throws IllegalArgumentException 목록에 null이 있을 때
     */
    private String joinRest(List<DayOfWeek> restWeekdays) {
        if (restWeekdays == null) {
            return "";
        }
        if (restWeekdays.stream().anyMatch(java.util.Objects::isNull)) {
            throw new IllegalArgumentException("쉬는 요일이 올바르지 않습니다.");
        }
        return restWeekdays.stream().distinct().sorted().map(DayOfWeek::name).collect(Collectors.joining(","));
    }

    /**
     * 저장된 쉬는 요일 문자열을 요일 집합으로 바꾼다.
     *
     * @param restWeekdays 요일 이름을 쉼표로 이은 문자열
     * @return 쉬는 요일 집합
     * @throws IllegalArgumentException 요일 이름이 올바르지 않을 때
     */
    private Set<DayOfWeek> restDays(String restWeekdays) {
        Set<DayOfWeek> out = EnumSet.noneOf(DayOfWeek.class);
        for (String s : restWeekdays.split(",")) {
            if (!s.isBlank()) {
                out.add(DayOfWeek.valueOf(s.strip()));
            }
        }
        return out;
    }

    /**
     * 한국 시간 기준 오늘 날짜를 돌려준다.
     *
     * @return 오늘 날짜
     */
    private LocalDate today() {
        return LocalDate.now(KST);
    }
}