package io.dev.cs_flow.service;

import io.dev.cs_flow.model.PlanAnswer;
import io.dev.cs_flow.model.enums.PlanPhase;
import io.dev.cs_flow.model.enums.PlanRole;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * 면접 계획의 일정과 출제를 계산하는 순수 함수 모음.
 * <p>
 * DB, 시계, 난수를 쓰지 않는다. 같은 입력(조건, seed, 오늘 날짜, 문항, 답변 기록)이면 항상 같은 일정이 나온다.
 * 일정은 저장하지 않고 호출할 때마다 계산하며, 면접일이나 조건이 바뀌어도 답변 기록은 그대로 두고 다시 계산하면 된다.
 * </p>
 * <p>
 * 기간은 시작일부터 면접일 전날까지다. 면접일 당일에는 문항을 배정하지 않는다.
 * 쉬는 요일은 문항 없는 휴식일이 되지만, 면접 전날은 쉬는 요일이어도 모의 면접일이다.
 * 오늘보다 앞선 날의 답변만 일정 계산에 반영하므로, 오늘 한 답변은 다음 날부터 약점과 밀린 문항에 반영된다.
 * </p>
 */
public final class PlanEngine {

    /** 모의 면접 문항 수. */
    public static final int MOCK_COUNT = 10;

    private static final int WEAK_DAYS_MIN_TOTAL = 5;
    private static final double WEAK_DAYS_RATIO = 0.15;
    private static final int SUBJECT_PER_DAY_MIN = 6;
    private static final int MOCK_WEAK_MIN = 3;
    private static final double WEAK_SUBJECT_RATE = 0.6;
    private static final double WEAK_QUESTION_RATE = 0.5;
    private static final int WEAK_SUBJECT_BOTTOM = 2;
    private static final long MOCK_SALT = 0x5DEECE66DL;

    /**
     * 인스턴스 생성을 막는다.
     */
    private PlanEngine() {
    }

    /** 하루의 성격. */
    public enum DayType {
        LEARN, REVIEW, MOCK, REST
    }

    /**
     * 엔진이 보는 면접 질문. 콘텐츠 JSON에 값이 비어 있으면 core는 false, level은 2로 채워서 넘긴다.
     *
     * @param id        질문 ID
     * @param subject   과목 slug
     * @param core      빈출 필수 질문 여부
     * @param level     난이도 (1 정의, 2 원리 · 비교, 3 심화 · 실무)
     * @param followUps 꼬리 질문. 질문 ID와 일치하는 값만 약점 보충일에 함께 출제한다
     */
    public record Question(String id, String subject, boolean core, int level, List<String> followUps) {
    }

    /**
     * 계획 조건.
     *
     * @param startDate    시작일
     * @param targetDate   면접일
     * @param role         직무
     * @param restDays     쉬는 요일
     * @param dailyMinutes 하루 학습 시간(분). 30, 45, 60
     * @param seed         문항 선택 순서를 정하는 값
     */
    public record Spec(LocalDate startDate, LocalDate targetDate, PlanRole role, Set<DayOfWeek> restDays,
                       int dailyMinutes, long seed) {
    }

    /**
     * 하루 일정.
     *
     * @param date        날짜
     * @param type        하루의 성격
     * @param subject     학습일에 한 과목만 다루면 그 과목 slug, 아니면 {@code null}
     * @param questionIds 그날 출제할 질문 ID
     */
    public record Day(LocalDate date, DayType type, String subject, List<String> questionIds) {
    }

    /**
     * 계산 결과.
     *
     * @param days          시작일부터 면접 전날까지의 일정
     * @param droppedCount  밀린 문항이 남은 날에 다 들어가지 못해 뺀 문항 수
     * @param weakSubjects  약한 과목, 적중률이 낮은 순
     */
    public record Schedule(List<Day> days, int droppedCount, List<String> weakSubjects) {
    }

    /**
     * 하루 학습 시간에 해당하는 학습 문항 수.
     *
     * @param dailyMinutes 하루 학습 시간(분)
     * @return 30분 7개, 45분 11개, 60분 15개
     * @throws IllegalArgumentException 30, 45, 60이 아닐 때
     */
    public static int dailyCount(int dailyMinutes) {
        return switch (dailyMinutes) {
            case 30 -> 7;
            case 45 -> 11;
            case 60 -> 15;
            default -> throw new IllegalArgumentException("지원하지 않는 학습 시간: " + dailyMinutes);
        };
    }

    /**
     * 직무별 과목 비중. 비중이 큰 과목이 앞에 오고 같으면 과목 slug 순이다. 표에 없는 과목은 출제하지 않는다.
     *
     * @param role 직무
     * @return 과목 slug별 비중
     */
    public static Map<String, Integer> weights(PlanRole role) {
        Map<String, Integer> w = switch (role) {
            case BACKEND -> Map.of("ds", 15, "algo", 10, "os", 20, "network", 20, "db", 25, "arch", 10);
            case FRONTEND -> Map.of("ds", 20, "algo", 20, "os", 10, "network", 30, "db", 10, "arch", 10);
            case EMBEDDED -> Map.of("ds", 15, "algo", 10, "os", 30, "network", 10, "db", 5, "arch", 30);
            case COMMON -> Map.of("ds", 1, "algo", 1, "os", 1, "network", 1, "db", 1, "arch", 1);
        };
        Map<String, Integer> out = new LinkedHashMap<>();
        w.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .forEach(e -> out.put(e.getKey(), e.getValue()));
        return out;
    }

    /**
     * 일정을 계산한다.
     *
     * @param spec      계획 조건
     * @param today     오늘 날짜. 이보다 앞선 날의 학습이 끝나지 않았으면 밀린 것으로 본다
     * @param questions 전체 면접 질문
     * @param answers   답변 기록. 쌓인 순서대로
     * @return 일정, 뺀 문항 수, 약한 과목
     */
    public static Schedule compute(Spec spec, LocalDate today, List<Question> questions, List<PlanAnswer> answers) {
        int daily = dailyCount(spec.dailyMinutes());
        Map<String, Integer> weights = weights(spec.role());
        Comparator<Question> priority = priority(spec.seed());

        Map<String, Question> byId = new HashMap<>();
        Map<String, List<Question>> pool = new LinkedHashMap<>();
        weights.keySet().forEach(s -> pool.put(s, new ArrayList<>()));
        for (Question q : questions) {
            byId.put(q.id(), q);
            if (pool.containsKey(q.subject())) {
                pool.get(q.subject()).add(q);
            }
        }
        pool.values().forEach(l -> l.sort(priority));

        List<LocalDate> study = new ArrayList<>();
        Map<LocalDate, Day> days = new TreeMap<>();
        for (LocalDate d = spec.startDate(); d.isBefore(spec.targetDate()); d = d.plusDays(1)) {
            boolean last = d.plusDays(1).equals(spec.targetDate());
            if (last || !spec.restDays().contains(d.getDayOfWeek())) {
                study.add(d);
            } else {
                days.put(d, new Day(d, DayType.REST, null, List.of()));
            }
        }
        if (study.isEmpty()) {
            return new Schedule(List.of(), 0, List.of());
        }

        LocalDate eff = today.isBefore(spec.startDate()) ? spec.startDate() : today;
        List<PlanAnswer> history = answers.stream()
                .filter(a -> a.getAnsweredOn().isBefore(today))
                .sorted(Comparator.comparing(PlanAnswer::getAnsweredOn))
                .toList();
        Map<String, PlanAnswer> latest = new LinkedHashMap<>();
        Set<String> learned = new LinkedHashSet<>();
        for (PlanAnswer a : history) {
            latest.put(a.getQuestionId(), a);
            if (a.getPhase() == PlanPhase.LEARN) {
                learned.add(a.getQuestionId());
            }
        }
        List<String> weak = weakSubjects(latest, byId, weights);

        int total = study.size();
        int weakCount = total >= WEAK_DAYS_MIN_TOTAL ? Math.max(1, (int) (total * WEAK_DAYS_RATIO)) : 0;
        int learnCount = total - 1 - weakCount;
        List<LocalDate> learnDates = study.subList(0, learnCount);
        List<LocalDate> reviewDates = study.subList(learnCount, learnCount + weakCount);
        LocalDate mockDate = study.get(total - 1);

        int dropped = layLearnDays(days, learnDates, eff, daily, weights, pool, learned, priority);
        layReviewDays(days, reviewDates, eff, daily, weak, latest, byId, pool, priority);
        List<String> mock = mockDate.isBefore(eff) ? List.of()
                : pickMock(spec.seed(), total == 1, weights, pool, weak);
        days.put(mockDate, new Day(mockDate, DayType.MOCK, null, mock));

        return new Schedule(new ArrayList<>(days.values()), dropped, weak);
    }

    /**
     * 학습일에 질문을 배정한다. 오늘 이전 날의 못 푼 질문은 오늘부터 남은 학습일에 고르게 다시 나누고, 하루 문항 수의 1.5배를 넘으면 우선순위가 낮은 질문부터 뺀다.
     *
     * @param days       날짜별 일정을 채울 맵
     * @param learnDates 학습일 목록
     * @param eff         일정 계산 기준일
     * @param daily       하루 문항 수
     * @param weights     과목별 비중
     * @param pool        과목별 후보 질문(우선순위 정렬)
     * @param learned     이미 학습 단계에서 답한 질문 ID
     * @param priority    질문 우선순위 비교자
     * @return 뺀 질문 수
     */
    private static int layLearnDays(Map<LocalDate, Day> days, List<LocalDate> learnDates, LocalDate eff, int daily,
                                    Map<String, Integer> weights, Map<String, List<Question>> pool,
                                    Set<String> learned, Comparator<Question> priority) {
        List<Block> blocks = layoutLearn(learnDates.size(), daily, weights, pool);
        List<Integer> future = new ArrayList<>();
        List<Question> missed = new ArrayList<>();
        for (int i = 0; i < learnDates.size(); i++) {
            if (learnDates.get(i).isBefore(eff)) {
                blocks.get(i).questions().stream().filter(q -> !learned.contains(q.id())).forEach(missed::add);
            } else {
                future.add(i);
            }
        }

        List<List<Question>> lists = new ArrayList<>();
        for (int i = 0; i < learnDates.size(); i++) {
            lists.add(new ArrayList<>(blocks.get(i).questions()));
        }
        int dropped = 0;
        if (future.isEmpty()) {
            dropped = missed.size();
        } else {
            for (int i : future) {
                lists.get(i).removeIf(q -> learned.contains(q.id()));
            }
            int cap = daily * 3 / 2;
            int demand = missed.size() + future.stream().mapToInt(i -> lists.get(i).size()).sum();
            int over = demand - cap * future.size();
            if (over > 0) {
                List<Question> all = new ArrayList<>(missed);
                future.forEach(i -> all.addAll(lists.get(i)));
                all.sort(priority);
                Set<String> drop = new LinkedHashSet<>();
                for (int k = all.size() - over; k < all.size(); k++) {
                    drop.add(all.get(k).id());
                }
                missed.removeIf(q -> drop.contains(q.id()));
                future.forEach(i -> lists.get(i).removeIf(q -> drop.contains(q.id())));
                dropped = over;
            }
            missed.sort(priority);
            for (Question q : missed) {
                int target = future.get(0);
                for (int i : future) {
                    if (lists.get(i).size() < lists.get(target).size()) {
                        target = i;
                    }
                }
                lists.get(target).add(q);
            }
        }

        for (int i = 0; i < learnDates.size(); i++) {
            LocalDate d = learnDates.get(i);
            days.put(d, new Day(d, DayType.LEARN, blocks.get(i).subject(), ids(lists.get(i))));
        }
        return dropped;
    }

    /**
     * 약점 보충일에 질문을 배정한다. 적중률 50% 미만 질문, 그 꼬리 질문, 약한 과목의 아직 안 푼 필수 질문 순으로 하루 문항 수만큼 채운다.
     *
     * @param days        날짜별 일정을 채울 맵
     * @param reviewDates 약점 보충일 목록
     * @param eff         일정 계산 기준일
     * @param daily       하루 문항 수
     * @param weak        약한 과목
     * @param latest      질문별 최신 답변
     * @param byId        질문 ID별 질문
     * @param pool        과목별 후보 질문
     * @param priority    질문 우선순위 비교자
     */
    private static void layReviewDays(Map<LocalDate, Day> days, List<LocalDate> reviewDates, LocalDate eff, int daily,
                                      List<String> weak, Map<String, PlanAnswer> latest, Map<String, Question> byId,
                                      Map<String, List<Question>> pool, Comparator<Question> priority) {
        List<Question> low = new ArrayList<>();
        for (var e : latest.entrySet()) {
            Question q = byId.get(e.getKey());
            Double rate = rate(e.getValue());
            if (q != null && pool.containsKey(q.subject()) && rate != null && rate < WEAK_QUESTION_RATE) {
                low.add(q);
            }
        }
        low.sort(Comparator.<Question>comparingDouble(q -> rate(latest.get(q.id()))).thenComparing(priority));

        Set<String> picked = new LinkedHashSet<>();
        low.forEach(q -> picked.add(q.id()));
        for (Question q : low) {
            for (String f : q.followUps() == null ? List.<String>of() : q.followUps()) {
                Question fq = byId.get(f);
                if (fq != null && pool.containsKey(fq.subject())) {
                    picked.add(fq.id());
                }
            }
        }
        for (String s : weak) {
            for (Question q : pool.get(s)) {
                if (q.core() && !latest.containsKey(q.id())) {
                    picked.add(q.id());
                }
            }
        }

        List<String> order = new ArrayList<>(picked);
        int next = 0;
        for (LocalDate d : reviewDates) {
            List<String> part = List.of();
            if (!d.isBefore(eff)) {
                int to = Math.min(order.size(), next + daily);
                part = new ArrayList<>(order.subList(Math.min(next, to), to));
                next = to;
            }
            days.put(d, new Day(d, DayType.REVIEW, null, part));
        }
    }

    /**
     * 모의 면접 질문 10개를 고른다. 직무 비중대로 뽑되 약한 과목에서 최대 3개 넣고, 하루짜리 계획이면 필수 질문을 먼저 쓴다.
     *
     * @param seed     문항 선택 순서를 정하는 값
     * @param coreOnly 필수 질문을 먼저 쓸지 여부
     * @param weights  과목별 비중
     * @param pool     과목별 후보 질문
     * @param weak     약한 과목
     * @return 질문 ID 목록
     */
    private static List<String> pickMock(long seed, boolean coreOnly, Map<String, Integer> weights,
                                         Map<String, List<Question>> pool, List<String> weak) {
        long salt = seed ^ MOCK_SALT;
        Comparator<Question> order = coreOnly
                ? Comparator.<Question, Boolean>comparing(q -> !q.core()).thenComparing(shuffle(salt))
                : shuffle(salt);
        Map<String, List<Question>> sorted = new LinkedHashMap<>();
        pool.forEach((s, l) -> sorted.put(s, l.stream().sorted(order).toList()));

        Map<String, Integer> used = new HashMap<>();
        List<Question> picked = new ArrayList<>();
        boolean progress = !weak.isEmpty();
        while (progress && picked.size() < MOCK_WEAK_MIN) {
            progress = false;
            for (String s : weak) {
                int n = used.getOrDefault(s, 0);
                if (picked.size() < MOCK_WEAK_MIN && n < sorted.get(s).size()) {
                    picked.add(sorted.get(s).get(n));
                    used.put(s, n + 1);
                    progress = true;
                }
            }
        }

        Map<String, Integer> caps = new LinkedHashMap<>();
        sorted.forEach((s, l) -> caps.put(s, l.size() - used.getOrDefault(s, 0)));
        Map<String, Integer> alloc = apportion(MOCK_COUNT - picked.size(), weights, caps);
        alloc.forEach((s, n) -> {
            int from = used.getOrDefault(s, 0);
            picked.addAll(sorted.get(s).subList(from, from + n));
        });
        picked.sort(shuffle(salt));
        return ids(picked);
    }

    /**
     * 학습일마다 풀 질문을 정한다. 학습일이 6일 이상이면 하루 한 과목, 아니면 과목을 섞어서 나눈다.
     *
     * @param days    학습일 수
     * @param daily   하루 문항 수
     * @param weights 과목별 비중
     * @param pool    과목별 후보 질문(우선순위 정렬)
     * @return 학습일별 과목과 질문
     */
    private static List<Block> layoutLearn(int days, int daily, Map<String, Integer> weights,
                                           Map<String, List<Question>> pool) {
        List<Block> blocks = new ArrayList<>();
        if (days == 0) {
            return blocks;
        }
        if (days >= SUBJECT_PER_DAY_MIN) {
            Map<String, Integer> caps = new LinkedHashMap<>();
            pool.forEach((s, l) -> caps.put(s, (l.size() + daily - 1) / daily));
            Map<String, Integer> alloc = apportion(days, weights, caps);
            for (String s : weights.keySet()) {
                int d = alloc.getOrDefault(s, 0);
                if (d == 0) {
                    continue;
                }
                List<Question> picked = pool.get(s).subList(0, Math.min(pool.get(s).size(), d * daily));
                for (List<Question> part : split(picked, d)) {
                    blocks.add(new Block(s, part));
                }
            }
        } else {
            Map<String, Integer> caps = new LinkedHashMap<>();
            pool.forEach((s, l) -> caps.put(s, l.size()));
            Map<String, Integer> alloc = apportion(days * daily, weights, caps);
            List<Slot> slots = new ArrayList<>();
            int order = 0;
            for (String s : weights.keySet()) {
                int n = alloc.getOrDefault(s, 0);
                for (int k = 0; k < n; k++) {
                    slots.add(new Slot((k + 0.5) / n, order, pool.get(s).get(k)));
                }
                order++;
            }
            slots.sort(Comparator.comparingDouble(Slot::pos).thenComparingInt(Slot::order));
            for (List<Question> part : split(slots.stream().map(Slot::question).toList(), days)) {
                blocks.add(new Block(null, part));
            }
        }
        while (blocks.size() < days) {
            blocks.add(new Block(null, List.of()));
        }
        return blocks;
    }

    /**
     * 약한 과목. 최신 답변 기준 키워드 적중률이 60% 미만이거나 적중률 하위 2개 과목이다.
     * 키워드가 없는 질문은 자기 평가(KNOW 100%, UNSURE 50%, DONT 0%)로 대신한다.
     *
     * @param latest  질문별 최신 답변
     * @param byId    질문 ID별 질문
     * @param weights 과목별 비중
     * @return 약한 과목, 적중률이 낮은 순
     */
    private static List<String> weakSubjects(Map<String, PlanAnswer> latest, Map<String, Question> byId,
                                             Map<String, Integer> weights) {
        Map<String, int[]> sum = new LinkedHashMap<>();
        for (var e : latest.entrySet()) {
            Question q = byId.get(e.getKey());
            int[] ht = hitTotal(e.getValue());
            if (q == null || ht == null || !weights.containsKey(q.subject())) {
                continue;
            }
            int[] acc = sum.computeIfAbsent(q.subject(), k -> new int[2]);
            acc[0] += ht[0];
            acc[1] += ht[1];
        }
        List<String> subjects = new ArrayList<>(sum.keySet());
        subjects.removeIf(s -> sum.get(s)[1] == 0);
        Comparator<String> byRate = Comparator
                .<String>comparingDouble(s -> (double) sum.get(s)[0] / sum.get(s)[1]).thenComparing(s -> s);
        subjects.sort(byRate);
        List<String> weak = new ArrayList<>();
        for (int i = 0; i < subjects.size(); i++) {
            String s = subjects.get(i);
            if (i < WEAK_SUBJECT_BOTTOM || (double) sum.get(s)[0] / sum.get(s)[1] < WEAK_SUBJECT_RATE) {
                weak.add(s);
            }
        }
        return weak;
    }

    /**
     * 답변 하나의 적중 수와 전체 수를 구한다. 키워드가 없으면 자기 평가로 대신한다.
     *
     * @param a 답변 기록
     * @return {적중 수, 전체 수}, 점수를 낼 수 없으면 null
     */
    private static int[] hitTotal(PlanAnswer a) {
        if (a.getTotalCount() > 0) {
            return new int[]{a.getHitCount(), a.getTotalCount()};
        }
        if (a.getSelfRating() == null) {
            return null;
        }
        return switch (a.getSelfRating()) {
            case KNOW -> new int[]{2, 2};
            case UNSURE -> new int[]{1, 2};
            case DONT -> new int[]{0, 2};
        };
    }

    /**
     * 답변 하나의 적중률을 구한다.
     *
     * @param a 답변 기록
     * @return 0~1 사이 적중률, 점수를 낼 수 없으면 null
     */
    private static Double rate(PlanAnswer a) {
        int[] ht = hitTotal(a);
        return ht == null ? null : (double) ht[0] / ht[1];
    }

    /**
     * 비중대로 정수를 나눈다(최대잉여법). 상한에 걸린 과목의 몫은 남은 과목이 비중대로 나눠 가진다.
     * 합이 total보다 작을 수 있다(상한 합이 모자랄 때).
     *
     * @param total   나눌 정수
     * @param weights 과목별 비중
     * @param caps    과목별 상한
     * @return 과목별로 나눈 몫
     */
    static Map<String, Integer> apportion(int total, Map<String, Integer> weights, Map<String, Integer> caps) {
        Map<String, Integer> out = new LinkedHashMap<>();
        weights.keySet().forEach(s -> out.put(s, 0));
        List<String> active = new ArrayList<>();
        for (String s : weights.keySet()) {
            if (weights.get(s) > 0 && caps.getOrDefault(s, 0) > 0) {
                active.add(s);
            }
        }
        int remaining = total;
        while (remaining > 0 && !active.isEmpty()) {
            long sum = active.stream().mapToLong(weights::get).sum();
            int n = active.size();
            int[] give = new int[n];
            long[] frac = new long[n];
            int used = 0;
            for (int i = 0; i < n; i++) {
                long x = (long) remaining * weights.get(active.get(i));
                give[i] = (int) (x / sum);
                frac[i] = x % sum;
                used += give[i];
            }
            List<Integer> order = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                order.add(i);
            }
            order.sort(Comparator.<Integer>comparingLong(i -> -frac[i]).thenComparingInt(i -> i));
            for (int k = 0; k < remaining - used; k++) {
                give[order.get(k)]++;
            }
            for (int i = 0; i < n; i++) {
                String s = active.get(i);
                int add = Math.min(give[i], caps.get(s) - out.get(s));
                out.merge(s, add, Integer::sum);
                remaining -= add;
            }
            active.removeIf(s -> out.get(s) >= caps.get(s));
        }
        return out;
    }

    /**
     * 질문 우선순위 비교자를 만든다. 필수 질문, 낮은 난이도, seed 해시 순이다.
     *
     * @param seed 문항 선택 순서를 정하는 값
     * @return 질문 비교자
     */
    private static Comparator<Question> priority(long seed) {
        return Comparator.<Question, Boolean>comparing(q -> !q.core())
                .thenComparingInt(Question::level)
                .thenComparing(shuffle(seed));
    }

    /**
     * seed와 질문 ID의 해시로 질문을 섞는 비교자를 만든다. 질문 목록의 순서와 상관없이 같은 결과가 나온다.
     *
     * @param seed 섞는 순서를 정하는 값
     * @return 질문 비교자
     */
    private static Comparator<Question> shuffle(long seed) {
        return Comparator.<Question>comparingLong(q -> mix(seed, q.id())).thenComparing(Question::id);
    }

    /**
     * seed와 질문 ID를 섞어 64비트 해시를 만든다(SplitMix64 방식).
     *
     * @param seed 섞는 순서를 정하는 값
     * @param id   질문 ID
     * @return 해시 값
     */
    private static long mix(long seed, String id) {
        long z = seed + 0x9E3779B97F4A7C15L * (id.hashCode() + 1L);
        z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
        z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
        return z ^ (z >>> 31);
    }

    /**
     * 목록을 순서대로 이어서 거의 같은 크기의 조각으로 나눈다. 남는 항목은 앞 조각부터 하나씩 더 받는다.
     *
     * @param items 나눌 목록
     * @param parts 조각 수
     * @return 조각 목록
     */
    private static <T> List<List<T>> split(List<T> items, int parts) {
        List<List<T>> out = new ArrayList<>();
        int base = items.size() / parts;
        int extra = items.size() % parts;
        int from = 0;
        for (int i = 0; i < parts; i++) {
            int to = from + base + (i < extra ? 1 : 0);
            out.add(new ArrayList<>(items.subList(from, to)));
            from = to;
        }
        return out;
    }

    /**
     * 질문 목록을 질문 ID 목록으로 바꾼다.
     *
     * @param questions 질문 목록
     * @return 질문 ID 목록
     */
    private static List<String> ids(List<Question> questions) {
        return questions.stream().map(Question::id).toList();
    }

    /**
     * 학습일 하루에 배정한 과목과 질문.
     *
     * @param subject   한 과목만 다루면 그 과목 slug, 아니면 null
     * @param questions 그날의 질문
     */
    private record Block(String subject, List<Question> questions) {
    }

    /**
     * 여러 과목을 섞을 때 질문의 상대 위치.
     *
     * @param pos      과목 안에서의 상대 위치(0~1)
     * @param order    과목 순서
     * @param question 질문
     */
    private record Slot(double pos, int order, Question question) {
    }
}