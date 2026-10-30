package io.dev.cs_flow.service;

import io.dev.cs_flow.dto.ContentManifest;
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
import java.util.regex.Pattern;

/**
 * 콘텐츠 JSON(`content/`)을 기동할 때 읽고 검증한다.
 * <p>
 * 파일 구성은 {@code subjects.json}, {@code manifest.json}, {@code {과목}/{토픽slug}.json}이다.
 * 문법 오류, 모르는 필드, 필수 값 누락, 중복, 개수 불일치가 하나라도 있으면 {@link IllegalStateException}으로
 * 빈 생성을 실패시켜 앱이 뜨지 않게 한다. 지금은 검증만 하고 읽기 경로는 아직 DB를 쓴다.
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
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .build();

        List<ContentSubject> loadedSubjects = readOne(resolver, mapper, base + "/subjects.json",
                new TypeReference<List<ContentSubject>>() { });
        ContentManifest manifest = readOne(resolver, mapper, base + "/manifest.json",
                new TypeReference<ContentManifest>() { });
        Map<Resource, ContentTopic> loadedTopics = readTopics(resolver, mapper, base);
        failIfAny("콘텐츠 파일을 읽지 못했습니다");

        validateSubjects(loadedSubjects);
        for (Map.Entry<Resource, ContentTopic> entry : loadedTopics.entrySet()) {
            validateTopic(entry.getKey(), entry.getValue(), loadedSubjects);
        }
        validateUnique(loadedTopics);
        validateManifest(manifest, loadedSubjects, loadedTopics.values());
        failIfAny("콘텐츠 검증에 실패했습니다");

        Map<String, Integer> subjectOrder = new HashMap<>();
        loadedSubjects.forEach(s -> subjectOrder.put(s.slug(), s.order()));
        this.subjects = loadedSubjects.stream().sorted(Comparator.comparing(ContentSubject::order)).toList();
        this.topics = loadedTopics.values().stream()
                .sorted(Comparator.comparing((ContentTopic t) -> subjectOrder.get(t.subject()))
                        .thenComparing(ContentTopic::order))
                .toList();
        log.info("콘텐츠 검증 완료 - 과목 {}, 토픽 {}, 퀴즈 {}", subjects.size(), topics.size(),
                topics.stream().mapToInt(t -> t.quizzes().size()).sum());
    }

    /**
     * 파일 하나를 지정한 타입으로 읽는다. 실패하면 오류 목록에 쌓고 null을 돌려준다.
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
     */
    private Map<Resource, ContentTopic> readTopics(ResourcePatternResolver resolver, JsonMapper mapper, String base) {
        Map<Resource, ContentTopic> result = new LinkedHashMap<>();
        Resource[] resources;
        try {
            resources = resolver.getResources(base + "/*/*.json");
        } catch (IOException e) {
            errors.add("토픽 폴더를 읽지 못했습니다: " + base + " (" + e.getMessage() + ")");
            return result;
        }
        if (resources.length == 0) {
            errors.add("토픽 파일이 없습니다: " + base + "/{과목}/{slug}.json");
        }
        for (Resource resource : resources) {
            ContentTopic topic = parse(resource, mapper, new TypeReference<ContentTopic>() { });
            if (topic != null) {
                result.put(resource, topic);
            }
        }
        return result;
    }

    /**
     * 리소스를 JSON으로 파싱한다. 문법 오류나 모르는 필드는 파일 이름과 함께 오류 목록에 쌓는다.
     */
    private <T> T parse(Resource resource, JsonMapper mapper, TypeReference<T> type) {
        try (InputStream in = resource.getInputStream()) {
            return mapper.readValue(in, type);
        } catch (Exception e) {
            errors.add(describe(resource) + ": JSON을 읽지 못했습니다 - " + firstLine(e.getMessage()));
            return null;
        }
    }

    /**
     * 과목 목록의 필수 값, slug 형식, 중복, 순서를 검증한다.
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
        if (t.subject() == null || subjectList.stream().noneMatch(s -> t.subject().equals(s.slug()))) {
            errors.add(where + ": subjects.json에 없는 과목입니다 - " + t.subject());
        }
        String path = pathOf(resource);
        if (t.subject() != null && !path.endsWith("/" + t.subject() + "/" + t.slug() + ".json")) {
            errors.add(where + ": 폴더 · 파일 이름이 subject · slug와 다릅니다");
        }
        validateVisual(where, t);
        validateTags(where, t.tags());
        validateQuizzes(where, t.quizzes());
    }

    /**
     * 시각화 정보를 검증한다. 발행된 토픽은 키가 필수이고, 3D가 있으면 키에 {@code /2d/}가 있어야 3D 경로를 만들 수 있다.
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
     */
    private void validateQuizzes(String where, List<ContentQuiz> quizzes) {
        if (quizzes == null) {
            errors.add(where + ": quizzes가 없습니다");
            return;
        }
        for (int i = 0; i < quizzes.size(); i++) {
            ContentQuiz q = quizzes.get(i);
            String at = where + " quizzes[" + i + "]";
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
     * 토픽 slug(전체)와 과목 안 order가 겹치지 않는지 검증한다.
     */
    private void validateUnique(Map<Resource, ContentTopic> loaded) {
        Map<String, String> slugOwner = new HashMap<>();
        Map<String, String> orderOwner = new HashMap<>();
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
        }
    }

    /**
     * 읽은 과목 · 토픽 · 퀴즈 개수가 manifest와 같은지 전체와 과목별로 검증한다.
     */
    private void validateManifest(ContentManifest m, List<ContentSubject> subjectList, Iterable<ContentTopic> topicList) {
        Map<String, int[]> actual = new HashMap<>();
        subjectList.forEach(s -> actual.put(s.slug(), new int[2]));
        int topicTotal = 0;
        int quizTotal = 0;
        for (ContentTopic t : topicList) {
            int[] c = actual.computeIfAbsent(String.valueOf(t.subject()), k -> new int[2]);
            int quizzes = t.quizzes() == null ? 0 : t.quizzes().size();
            c[0]++;
            c[1] += quizzes;
            topicTotal++;
            quizTotal += quizzes;
        }
        expect("manifest.subjects", m.subjects(), subjectList.size());
        expect("manifest.topics", m.topics(), topicTotal);
        expect("manifest.quizzes", m.quizzes(), quizTotal);
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
        }
        for (String slug : m.bySubject().keySet()) {
            if (!actual.containsKey(slug)) {
                errors.add("manifest.bySubject에만 있는 과목입니다: " + slug);
            }
        }
    }

    /**
     * 명세 값과 실제 값이 다르면 오류로 기록한다.
     */
    private void expect(String name, Integer declared, int actual) {
        if (declared == null || declared != actual) {
            errors.add(name + " = " + declared + ", 실제 파일에서 센 값 = " + actual);
        }
    }

    private void require(String where, String field, Object value) {
        if (value == null) {
            errors.add(where + ": " + field + "가 없습니다");
        }
    }

    private void checkText(String where, String field, String value, int max) {
        if (value == null || value.isBlank()) {
            errors.add(where + ": " + field + "가 비어 있습니다");
        } else if (value.length() > max) {
            errors.add(where + ": " + field + "가 " + max + "자를 넘습니다");
        }
    }

    private void checkSlug(String where, String field, String value, int max) {
        checkText(where, field, value, max);
        if (value != null && !value.isBlank() && !SLUG.matcher(value).matches()) {
            errors.add(where + ": " + field + " 형식이 올바르지 않습니다 (소문자, 숫자, 하이픈) - " + value);
        }
    }

    /**
     * 오류가 쌓여 있으면 목록을 담아 예외를 던진다.
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

    private static String pathOf(Resource resource) {
        try {
            return resource.getURL().getPath();
        } catch (IOException e) {
            return String.valueOf(resource.getDescription());
        }
    }

    private static String describe(Resource resource) {
        String path = pathOf(resource);
        String[] parts = path.split("/");
        int n = parts.length;
        return n >= 2 ? parts[n - 2] + "/" + parts[n - 1] : path;
    }

    private static String firstLine(String message) {
        if (message == null) {
            return "알 수 없는 오류";
        }
        int idx = message.indexOf('\n');
        return idx < 0 ? message : message.substring(0, idx);
    }
}