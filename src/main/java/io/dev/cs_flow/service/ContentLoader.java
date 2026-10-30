package io.dev.cs_flow.service;

import io.dev.cs_flow.dto.ContentError;
import io.dev.cs_flow.dto.ContentManifest;
import io.dev.cs_flow.dto.ContentInterview;
import io.dev.cs_flow.dto.ContentQuiz;
import io.dev.cs_flow.dto.ContentSubject;
import io.dev.cs_flow.dto.ContentTopic;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.stereotype.Component;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 콘텐츠 JSON(`content/`)을 기동할 때 읽고 검증한다.
 * <p>
 * 파일 구성은 {@code subjects.json}, {@code manifest.json}, {@code {과목}/{묶음}/{토픽slug}.json}, {@code errors/{묶음}/{slug}.json}이다.
 * 문법 오류, 모르는 필드, 필수 값 누락, 중복, 개수 불일치가 하나라도 있으면 {@link IllegalStateException}으로
 * 빈 생성을 실패시켜 앱이 뜨지 않게 한다. 읽은 내용은 {@link ContentStore}가 화면용 객체로 만든다.
 * </p>
 */
@Slf4j
@Component
public class ContentLoader {

    private static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    private static final Pattern OPTION = Pattern.compile("^[A-D]$");
    private static final int MAX_REPORTED_ERRORS = 30;
    private static final int OPTION_COUNT = 4;

    @Getter
    private final List<ContentSubject> subjects;

    @Getter
    private final List<ContentTopic> topics;

    @Getter
    private final List<ContentError> errorEntries;

    private final List<String> errors = new ArrayList<>();

    /**
     * 위치 아래의 콘텐츠를 읽고 검증한다. 하나라도 어긋나면 예외로 끝낸다.
     *
     * @param resolver 리소스 탐색기
     * @param location 콘텐츠 폴더 위치 (예: classpath:content, file:/경로)
     * @throws IllegalStateException 읽기 실패 또는 검증 실패. 메시지에 문제 목록이 들어간다
     */
    public ContentLoader(ResourcePatternResolver resolver,
                         @Value("${cs-flow.content.location:classpath:content}") String location) {
        String base = location.endsWith("/") ? location.substring(0, location.length() - 1) : location;
        JsonMapper mapper = JsonMapper.builder()
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .build();

        List<ContentSubject> loadedSubjects = readOne(resolver, mapper, base + "/subjects.json",
                new TypeReference<List<ContentSubject>>() { });
        ContentManifest manifest = readOne(resolver, mapper, base + "/manifest.json",
                new TypeReference<ContentManifest>() { });
        Map<Resource, ContentTopic> loadedTopics = readTopics(resolver, mapper, base);
        Map<Resource, ContentError> loadedErrors = readErrors(resolver, mapper, base);
        failIfAny("콘텐츠 파일을 읽지 못했습니다");

        validateSubjects(loadedSubjects);
        for (Map.Entry<Resource, ContentTopic> entry : loadedTopics.entrySet()) {
            validateTopic(entry.getKey(), entry.getValue(), loadedSubjects);
        }
        validateUnique(loadedTopics);
        validateErrors(loadedErrors, loadedTopics.values());
        validateManifest(manifest, loadedSubjects, loadedTopics.values(), loadedErrors.size());
        failIfAny("콘텐츠 검증에 실패했습니다");

        Map<String, Integer> subjectOrder = new HashMap<>();
        loadedSubjects.forEach(s -> subjectOrder.put(s.slug(), s.order()));
        this.subjects = loadedSubjects.stream().sorted(Comparator.comparing(ContentSubject::order)).toList();
        this.topics = loadedTopics.values().stream()
                .sorted(Comparator.comparing((ContentTopic t) -> subjectOrder.get(t.subject()))
                        .thenComparing(ContentTopic::order))
                .toList();
        this.errorEntries = loadedErrors.values().stream().sorted(Comparator.comparing(ContentError::order)).toList();
        log.info("콘텐츠 검증 완료 - 과목 {}, 토픽 {}, 퀴즈 {}, 에러 {}", subjects.size(), topics.size(),
                topics.stream().mapToInt(t -> t.quizzes().size()).sum(), errorEntries.size());
    }

    /**
     * 파일 하나를 지정한 타입으로 읽는다. 실패하면 오류 목록에 쌓고 null을 돌려준다.
     *
     * @param resolver 리소스 탐색기
     * @param mapper   JSON 매퍼
     * @param path     읽을 파일 경로
     * @param type     변환할 타입
     * @return 읽은 값, 실패하면 null
     */
    private <T> T readOne(ResourcePatternResolver resolver, JsonMapper mapper, String path, TypeReference<T> type) {
        Resource resource = resolver.getResource(path);
        if (!resource.exists()) {
            errors.add("파일이 없습니다: " + path);
            return null;
        }
        return parse(resource, mapper, type);
    }

    /**
     * 과목 폴더 아래의 토픽 JSON을 모두 읽는다. 파일이 하나도 없으면 오류로 기록한다.
     *
     * @param resolver 리소스 탐색기
     * @param mapper   JSON 매퍼
     * @param base     콘텐츠 폴더 위치
     * @return 파일별 토픽, 읽지 못한 파일은 빠진다
     */
    private Map<Resource, ContentTopic> readTopics(ResourcePatternResolver resolver, JsonMapper mapper, String base) {
        Map<Resource, ContentTopic> result = new LinkedHashMap<>();
        Resource[] resources;
        try {
            resources = resolver.getResources(base + "/*/*/*.json");
        } catch (IOException e) {
            errors.add("토픽 폴더를 읽지 못했습니다: " + base + " (" + e.getMessage() + ")");
            return result;
        }
        if (resources.length == 0) {
            errors.add("토픽 파일이 없습니다: " + base + "/{과목}/{묶음}/{slug}.json");
        }
        for (Resource resource : resources) {
            if (describe(resource).startsWith("errors/")) {
                continue;
            }
            ContentTopic topic = parse(resource, mapper, new TypeReference<ContentTopic>() { });
            if (topic != null) {
                result.put(resource, topic);
            }
        }
        return result;
    }

    /**
     * 에러 사전 JSON({@code errors/{묶음}/*.json})을 모두 읽는다. 없으면 빈 맵이고, 개수는 manifest가 대조한다.
     *
     * @param resolver 리소스 탐색기
     * @param mapper   JSON 매퍼
     * @param base     콘텐츠 폴더 위치
     * @return 파일별 에러 사전 항목, 읽지 못한 파일은 빠진다
     */
    private Map<Resource, ContentError> readErrors(ResourcePatternResolver resolver, JsonMapper mapper, String base) {
        Map<Resource, ContentError> result = new LinkedHashMap<>();
        try {
            for (Resource resource : resolver.getResources(base + "/errors/*/*.json")) {
                ContentError entry = parse(resource, mapper, new TypeReference<ContentError>() { });
                if (entry != null) {
                    result.put(resource, entry);
                }
            }
        } catch (IOException e) {
            errors.add("에러 사전 폴더를 읽지 못했습니다: " + base + "/errors (" + e.getMessage() + ")");
        }
        return result;
    }

    /**
     * 리소스를 JSON으로 파싱한다. 문법 오류나 모르는 필드는 파일 이름과 함께 오류 목록에 쌓는다.
     *
     * @param resource 읽을 파일
     * @param mapper   JSON 매퍼
     * @param type     변환할 타입
     * @return 파싱한 값, 실패하면 null
     */
    private <T> T parse(Resource resource, JsonMapper mapper, TypeReference<T> type) {
        try (InputStream in = resource.getInputStream()) {
            T value = mapper.readValue(in, type);
            if (value == null) {
                errors.add(describe(resource) + ": 내용이 비어 있습니다 (null)");
            } else if (value instanceof List<?> list && list.contains(null)) {
                errors.add(describe(resource) + ": 목록에 null 항목이 있습니다");
                return null;
            }
            return value;
        } catch (Exception e) {
            errors.add(describe(resource) + ": JSON을 읽지 못했습니다 - " + firstLine(e.getMessage()));
            return null;
        }
    }

    /**
     * 과목 목록의 필수 값, slug 형식, 중복, 순서를 검증한다.
     *
     * @param list 과목 목록
     */
    private void validateSubjects(List<ContentSubject> list) {
        Set<String> slugs = new HashSet<>();
        Set<Integer> orders = new HashSet<>();
        for (ContentSubject s : list) {
            String where = "subjects.json[" + s.slug() + "]";
            checkSlug(where, "slug", s.slug(), 100);
            checkText(where, "name", s.name(), 100);
            checkText(where, "colorAccent", s.colorAccent(), 20);
            require(where, "published", s.published());
            if (s.order() == null || s.order() < 1) {
                errors.add(where + ": order는 1 이상이어야 합니다");
            } else if (!orders.add(s.order())) {
                errors.add(where + ": order가 겹칩니다 - " + s.order());
            }
            if (s.slug() != null && !slugs.add(s.slug())) {
                errors.add(where + ": slug가 겹칩니다");
            }
        }
    }

    /**
     * 토픽 한 건의 필수 값, 길이, 폴더 · 파일 이름 일치, 태그, 퀴즈를 검증한다.
     *
     * @param resource    토픽 파일
     * @param t           토픽
     * @param subjectList 과목 목록
     */
    private void validateTopic(Resource resource, ContentTopic t, List<ContentSubject> subjectList) {
        String where = describe(resource);
        checkSlug(where, "slug", t.slug(), 100);
        checkText(where, "title", t.title(), 200);
        checkText(where, "templateName", t.templateName(), 200);
        require(where, "published", t.published());
        if (t.metaDescription() != null && t.metaDescription().length() > 300) {
            errors.add(where + ": metaDescription이 300자를 넘습니다");
        }
        if (t.order() == null || t.order() < 1) {
            errors.add(where + ": order는 1 이상이어야 합니다");
        }
        if (t.seq() == null || t.seq() < 1) {
            errors.add(where + ": seq는 1 이상이어야 합니다");
        }
        if (t.subject() == null || subjectList.stream().noneMatch(s -> t.subject().equals(s.slug()))) {
            errors.add(where + ": subjects.json에 없는 과목입니다 - " + t.subject());
        }
        String path = pathOf(resource);
        if (t.subject() != null && t.slug() != null) {
            Matcher folder = Pattern.compile("/" + Pattern.quote(t.subject()) + "/(\\d+-\\d+)/" + Pattern.quote(t.slug()) + "\\.json$").matcher(path);
            if (!folder.find()) {
                errors.add(where + ": 폴더 · 파일 이름이 {subject}/{묶음 예: 1-10}/{slug}.json과 다릅니다");
            } else if (t.visual() != null && t.visual().key() != null
                    && !t.visual().key().startsWith(t.subject() + "/" + folder.group(1) + "/")) {
                errors.add(where + ": 묶음 폴더(" + folder.group(1) + ")와 visual.key의 묶음이 다릅니다 - " + t.visual().key());
            }
        }
        validateVisual(where, t);
        validateTags(where, t.tags());
        validateStrings(where, "roles", t.roles());
        validateStrings(where, "exams", t.exams());
        validateQuizzes(where, t);
        validateInterviews(where, t);
    }

    /**
     * 시각화 정보를 검증한다. 발행된 토픽은 visual이 필수이고 visual이 있으면 키가 필수다. 3D가 있으면 키에 {@code /2d/}가 있어야 3D 경로를 만들 수 있다.
     *
     * @param where 오류 메시지에 쓸 위치(파일 이름)
     * @param t     토픽
     */
    private void validateVisual(String where, ContentTopic t) {
        if (t.visual() == null) {
            if (Boolean.TRUE.equals(t.published())) {
                errors.add(where + ": 발행된 토픽에 visual이 없습니다");
            }
            return;
        }
        checkText(where, "visual.key", t.visual().key(), 200);
        require(where, "visual.has3d", t.visual().has3d());
        if (Boolean.TRUE.equals(t.visual().has3d()) && t.visual().key() != null && !t.visual().key().contains("/2d/")) {
            errors.add(where + ": has3d인 토픽의 visual.key에 /2d/가 없습니다 - " + t.visual().key());
        }
    }

    /**
     * 태그 목록이 있고 각 태그가 비어 있지 않으며 50자 이하이고 겹치지 않는지 검증한다.
     *
     * @param where 오류 메시지에 쓸 위치(파일 이름)
     * @param tags  태그 목록
     */
    private void validateTags(String where, List<String> tags) {
        if (tags == null) {
            errors.add(where + ": tags가 없습니다");
            return;
        }
        Set<String> seen = new HashSet<>();
        for (String tag : tags) {
            if (tag == null || tag.isBlank() || tag.length() > 50) {
                errors.add(where + ": 태그는 1~50자여야 합니다 - " + tag);
            } else if (!seen.add(tag)) {
                errors.add(where + ": 태그가 겹칩니다 - " + tag);
            }
        }
    }

    /**
     * 퀴즈 문항의 순서(1부터 빠짐없이), 보기 4개, 정답 A~D, 해설을 검증한다.
     *
     * @param where 오류 메시지에 쓸 위치(파일 이름)
     * @param t     토픽
     */
    private void validateQuizzes(String where, ContentTopic t) {
        List<ContentQuiz> quizzes = t.quizzes();
        if (quizzes == null) {
            errors.add(where + ": quizzes가 없습니다");
            return;
        }
        for (int i = 0; i < quizzes.size(); i++) {
            ContentQuiz q = quizzes.get(i);
            String at = where + " quizzes[" + i + "]";
            if (q == null) {
                errors.add(at + ": null 항목입니다");
                continue;
            }
            if (q.id() == null || !q.id().equals(t.subject() + "." + t.slug() + ".quiz" + (i + 1))) {
                errors.add(at + ": id는 {과목}.{slug}.quiz{순서}여야 합니다 - " + q.id());
            }
            if (q.displayOrder() == null || q.displayOrder() != i + 1) {
                errors.add(at + ": displayOrder는 " + (i + 1) + "여야 합니다 (1부터 빠짐없이)");
            }
            checkText(at, "prompt", q.prompt(), Integer.MAX_VALUE);
            checkText(at, "explanation", q.explanation(), Integer.MAX_VALUE);
            if (q.options() == null || q.options().size() != OPTION_COUNT
                    || q.options().stream().anyMatch(o -> o == null || o.isBlank())) {
                errors.add(at + ": options는 비어 있지 않은 보기 " + OPTION_COUNT + "개여야 합니다");
            }
            if (q.correctOption() == null || !OPTION.matcher(q.correctOption()).matches()) {
                errors.add(at + ": correctOption은 A~D 중 하나여야 합니다 - " + q.correctOption());
            }
        }
    }

    /**
     * 면접 질문이 없거나, 있으면 ID 순서(1부터 빠짐없이), 질문 · 답변, 난이도(1~3), 키워드 · 꼬리 질문 값을 검증한다.
     *
     * @param where 오류 메시지에 쓸 위치(파일 이름)
     * @param t     토픽
     */
    private void validateInterviews(String where, ContentTopic t) {
        List<ContentInterview> interviews = t.interview();
        if (interviews == null) {
            return;
        }
        for (int i = 0; i < interviews.size(); i++) {
            ContentInterview q = interviews.get(i);
            String at = where + " interview[" + i + "]";
            if (q == null) {
                errors.add(at + ": null 항목입니다");
                continue;
            }
            if (q.id() == null || !q.id().equals(t.subject() + "." + t.slug() + ".q" + (i + 1))) {
                errors.add(at + ": id는 {과목}.{slug}.q{순서}여야 합니다 - " + q.id());
            }
            checkText(at, "question", q.question(), Integer.MAX_VALUE);
            checkText(at, "answer", q.answer(), Integer.MAX_VALUE);
            if (q.level() != null && (q.level() < 1 || q.level() > 3)) {
                errors.add(at + ": level은 1~3이어야 합니다 - " + q.level());
            }
            validateStrings(at, "keywords", q.keywords());
            validateStrings(at, "followUps", q.followUps());
        }
    }

    /**
     * 선택 목록(roles, exams, keywords, followUps)이 없거나, 있으면 각 값이 비어 있지 않은지 검증한다.
     *
     * @param where 오류 메시지에 쓸 위치(파일 이름)
     * @param field  검증할 필드 이름
     * @param values 필드 값 목록
     */
    private void validateStrings(String where, String field, List<String> values) {
        if (values == null) {
            return;
        }
        for (String value : values) {
            if (value == null || value.isBlank()) {
                errors.add(where + ": " + field + "에 빈 값이 있습니다");
            }
        }
    }

    /**
     * 에러 사전 항목의 필수 값, 길이, 파일 이름 일치, order · slug 중복, 근거 링크, 관련 토픽 존재를 검증한다.
     *
     * @param loaded    파일별 에러 사전 항목
     * @param topicList 토픽 목록
     */
    private void validateErrors(Map<Resource, ContentError> loaded, Iterable<ContentTopic> topicList) {
        Set<String> topicSlugs = new HashSet<>();
        topicList.forEach(t -> topicSlugs.add(t.slug()));
        Set<String> slugs = new HashSet<>();
        Set<Integer> orders = new HashSet<>();
        for (Map.Entry<Resource, ContentError> entry : loaded.entrySet()) {
            ContentError e = entry.getValue();
            String where = describe(entry.getKey());
            checkSlug(where, "slug", e.slug(), 100);
            if (e.slug() != null && e.order() != null && e.order() >= 1) {
                int low = (e.order() - 1) / 10 * 10 + 1;
                String folder = "/errors/" + low + "-" + (low + 9) + "/" + e.slug() + ".json";
                if (!pathOf(entry.getKey()).endsWith(folder)) {
                    errors.add(where + ": 폴더 · 파일 이름이 order와 slug에 맞지 않습니다 (기대 위치 errors" + folder.substring(7) + ")");
                }
            }
            if (e.slug() != null && !slugs.add(e.slug())) {
                errors.add(where + ": slug가 겹칩니다");
            }
            if (e.order() == null || e.order() < 1) {
                errors.add(where + ": order는 1 이상이어야 합니다");
            } else if (!orders.add(e.order())) {
                errors.add(where + ": order가 겹칩니다 - " + e.order());
            }
            checkText(where, "category", e.category(), 50);
            checkText(where, "title", e.title(), 200);
            checkText(where, "errorMessage", e.errorMessage(), Integer.MAX_VALUE);
            require(where, "createdOn", e.createdOn());
            require(where, "verified", e.verified());
            if (Boolean.TRUE.equals(e.verified()) && e.verifiedOn() == null) {
                errors.add(where + ": 검증된 항목에 verifiedOn이 없습니다");
            }
            for (String env : new String[]{e.envOs(), e.envDistro(), e.envVersion()}) {
                if (env != null && env.length() > 100) {
                    errors.add(where + ": 환경 값이 100자를 넘습니다");
                }
            }
            if (e.sources() == null || e.topics() == null) {
                errors.add(where + ": sources와 topics는 목록이어야 합니다");
                continue;
            }
            for (ContentError.Source s : e.sources()) {
                if (s == null || s.label() == null || s.label().isBlank() || s.label().length() > 200
                        || s.url() == null || !s.url().startsWith("http") || s.url().length() > 500) {
                    errors.add(where + ": 근거 링크의 label(1~200자)과 url(http로 시작, 500자 이하)을 확인하세요");
                }
            }
            Set<String> linked = new HashSet<>();
            for (String topic : e.topics()) {
                if (!topicSlugs.contains(topic)) {
                    errors.add(where + ": 없는 토픽을 가리킵니다 - " + topic);
                } else if (!linked.add(topic)) {
                    errors.add(where + ": 관련 토픽이 겹칩니다 - " + topic);
                }
            }
        }
    }

    /**
     * 토픽 slug(전체)와 과목 안 order, 전체 순서(seq)가 겹치지 않는지 검증하고, 이어서 {@link #validateSeqFollowsOrder}로 order와 seq의 방향이 같은지 검증한다.
     *
     * @param loaded 파일별 토픽
     */
    private void validateUnique(Map<Resource, ContentTopic> loaded) {
        Map<String, String> slugOwner = new HashMap<>();
        Map<String, String> orderOwner = new HashMap<>();
        Map<String, String> seqOwner = new HashMap<>();
        for (Map.Entry<Resource, ContentTopic> entry : loaded.entrySet()) {
            ContentTopic t = entry.getValue();
            String where = describe(entry.getKey());
            String slugPrev = slugOwner.put(String.valueOf(t.slug()), where);
            if (slugPrev != null) {
                errors.add(where + ": slug가 " + slugPrev + "와 겹칩니다");
            }
            String orderPrev = orderOwner.put(t.subject() + "#" + t.order(), where);
            if (orderPrev != null) {
                errors.add(where + ": order가 " + orderPrev + "와 겹칩니다");
            }
            String seqPrev = seqOwner.put(String.valueOf(t.seq()), where);
            if (seqPrev != null) {
                errors.add(where + ": seq가 " + seqPrev + "와 겹칩니다");
            }
        }
        validateSeqFollowsOrder(loaded.values());
    }

    /**
     * 같은 과목 안에서 order가 커질수록 seq도 커지는지 검증한다. 과목 안 순서와 전체 순서가 어긋나면 이전 · 다음 링크가 틀어진다.
     *
     * @param topicList 토픽 목록
     */
    private void validateSeqFollowsOrder(Iterable<ContentTopic> topicList) {
        Map<String, List<ContentTopic>> bySubject = new HashMap<>();
        for (ContentTopic t : topicList) {
            if (t.subject() != null && t.order() != null && t.seq() != null) {
                bySubject.computeIfAbsent(t.subject(), k -> new ArrayList<>()).add(t);
            }
        }
        for (Map.Entry<String, List<ContentTopic>> entry : bySubject.entrySet()) {
            List<ContentTopic> sorted = entry.getValue().stream().sorted(Comparator.comparing(ContentTopic::order)).toList();
            for (int i = 1; i < sorted.size(); i++) {
                if (sorted.get(i).seq() <= sorted.get(i - 1).seq()) {
                    errors.add(entry.getKey() + "/" + sorted.get(i).slug() + ": order 순서와 seq 순서가 어긋납니다");
                }
            }
        }
    }

    /**
     * 읽은 과목 · 토픽 · 퀴즈 · 면접 질문 · 에러 사전 개수가 manifest와 같은지 전체와 과목별로 검증한다.
     *
     * @param m           manifest
     * @param subjectList 과목 목록
     * @param topicList   토픽 목록
     * @param errorCount  읽은 에러 사전 항목 수
     */
    private void validateManifest(ContentManifest m, List<ContentSubject> subjectList, Iterable<ContentTopic> topicList,
                                  int errorCount) {
        Map<String, int[]> actual = new HashMap<>();
        subjectList.forEach(s -> actual.put(s.slug(), new int[3]));
        int topicTotal = 0;
        int quizTotal = 0;
        int interviewTotal = 0;
        for (ContentTopic t : topicList) {
            int[] c = actual.computeIfAbsent(String.valueOf(t.subject()), k -> new int[3]);
            int quizzes = t.quizzes() == null ? 0 : t.quizzes().size();
            int interviews = t.interview() == null ? 0 : t.interview().size();
            c[0]++;
            c[1] += quizzes;
            c[2] += interviews;
            topicTotal++;
            quizTotal += quizzes;
            interviewTotal += interviews;
        }
        expect("manifest.subjects", m.subjects(), subjectList.size());
        expect("manifest.topics", m.topics(), topicTotal);
        expect("manifest.quizzes", m.quizzes(), quizTotal);
        expect("manifest.interviews", m.interviews(), interviewTotal);
        expect("manifest.errors", m.errors(), errorCount);
        if (m.bySubject() == null) {
            errors.add("manifest.bySubject가 없습니다");
            return;
        }
        for (Map.Entry<String, int[]> entry : actual.entrySet()) {
            ContentManifest.Count expected = m.bySubject().get(entry.getKey());
            if (expected == null) {
                errors.add("manifest.bySubject에 과목이 없습니다: " + entry.getKey());
                continue;
            }
            expect("manifest." + entry.getKey() + ".topics", expected.topics(), entry.getValue()[0]);
            expect("manifest." + entry.getKey() + ".quizzes", expected.quizzes(), entry.getValue()[1]);
            expect("manifest." + entry.getKey() + ".interviews", expected.interviews(), entry.getValue()[2]);
        }
        for (String slug : m.bySubject().keySet()) {
            if (!actual.containsKey(slug)) {
                errors.add("manifest.bySubject에만 있는 과목입니다: " + slug);
            }
        }
    }

    /**
     * 명세 값이 없거나 실제 값과 다르면 오류로 기록한다.
     *
     * @param name     대조할 항목 이름
     * @param declared manifest에 적힌 값
     * @param actual   실제로 센 값
     */
    private void expect(String name, Integer declared, int actual) {
        if (declared == null || declared != actual) {
            errors.add(name + " = " + declared + ", 실제 파일에서 센 값 = " + actual);
        }
    }

    /**
     * 값이 null이면 오류로 기록한다.
     *
     * @param where 오류 메시지에 쓸 위치(파일 이름)
     * @param field 필드 이름
     * @param value 필드 값
     */
    private void require(String where, String field, Object value) {
        if (value == null) {
            errors.add(where + ": " + field + "가 없습니다");
        }
    }

    /**
     * 문자열이 비어 있거나 최대 길이를 넘으면 오류로 기록한다.
     *
     * @param where 오류 메시지에 쓸 위치(파일 이름)
     * @param field 필드 이름
     * @param value 필드 값
     * @param max   최대 길이
     */
    private void checkText(String where, String field, String value, int max) {
        if (value == null || value.isBlank()) {
            errors.add(where + ": " + field + "가 비어 있습니다");
        } else if (value.length() > max) {
            errors.add(where + ": " + field + "가 " + max + "자를 넘습니다");
        }
    }

    /**
     * slug가 비어 있지 않고 소문자 · 숫자 · 하이픈 형식인지 검증한다.
     *
     * @param where 오류 메시지에 쓸 위치(파일 이름)
     * @param field 필드 이름
     * @param value 필드 값
     * @param max   최대 길이
     */
    private void checkSlug(String where, String field, String value, int max) {
        checkText(where, field, value, max);
        if (value != null && !value.isBlank() && !SLUG.matcher(value).matches()) {
            errors.add(where + ": " + field + " 형식이 올바르지 않습니다 (소문자, 숫자, 하이픈) - " + value);
        }
    }

    /**
     * 오류가 쌓여 있으면 목록을 담아 예외를 던진다.
     *
     * @param headline 예외 메시지의 첫 줄
     * @throws IllegalStateException 쌓인 오류가 있을 때
     */
    private void failIfAny(String headline) {
        if (errors.isEmpty()) {
            return;
        }
        List<String> shown = errors.subList(0, Math.min(errors.size(), MAX_REPORTED_ERRORS));
        String more = errors.size() > shown.size() ? "\n... 외 " + (errors.size() - shown.size()) + "건" : "";
        throw new IllegalStateException(headline + " (" + errors.size() + "건)\n - "
                + String.join("\n - ", shown) + more);
    }

    /**
     * 리소스의 URL 경로를 돌려준다. 읽지 못하면 설명 문자열을 쓴다.
     *
     * @param resource 리소스
     * @return URL 경로, 읽지 못하면 설명 문자열
     */
    private static String pathOf(Resource resource) {
        try {
            return resource.getURL().getPath();
        } catch (IOException e) {
            return String.valueOf(resource.getDescription());
        }
    }

    /**
     * 오류 메시지용으로 {@code 과목폴더/파일이름} 형태의 짧은 이름을 만든다.
     *
     * @param resource 리소스
     * @return {@code 과목폴더/묶음폴더/파일이름} 형태의 이름, 경로 구간이 3개 미만이면 전체 경로
     */
    private static String describe(Resource resource) {
        String path = pathOf(resource);
        String[] parts = path.split("/");
        int n = parts.length;
        return n >= 3 ? parts[n - 3] + "/" + parts[n - 2] + "/" + parts[n - 1] : path;
    }

    /**
     * 예외 메시지의 첫 줄만 돌려준다.
     *
     * @param message 예외 메시지
     * @return 첫 줄, message가 null이면 "알 수 없는 오류"
     */
    private static String firstLine(String message) {
        if (message == null) {
            return "알 수 없는 오류";
        }
        int idx = message.indexOf('\n');
        return idx < 0 ? message : message.substring(0, idx);
    }
}