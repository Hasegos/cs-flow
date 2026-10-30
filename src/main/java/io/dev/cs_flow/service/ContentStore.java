package io.dev.cs_flow.service;

import io.dev.cs_flow.dto.ContentError;
import io.dev.cs_flow.dto.ContentQuiz;
import io.dev.cs_flow.dto.ContentSubject;
import io.dev.cs_flow.dto.ContentTopic;
import io.dev.cs_flow.dto.ErrorEntryView;
import io.dev.cs_flow.dto.QuizQuestionView;
import io.dev.cs_flow.dto.SubjectView;
import io.dev.cs_flow.dto.TopicInfo;
import io.dev.cs_flow.dto.TopicTagView;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * 검증이 끝난 콘텐츠 JSON을 화면용 객체로 바꿔 메모리에 들고 있는 저장소.
 * <p>
 * 기동할 때 한 번 만들고 이후 바뀌지 않는다. 비공개 과목 · 토픽은 여기서 걸러서 서비스는 공개된 것만 본다.
 * {@code cs-flow.content.show-unpublished}가 true인 환경(dev)에서는 비공개도 보인다.
 * 에러 사전 항목은 비공개 개념이 없고(검증 여부는 화면이 구분한다) 모두 보인다.
 * </p>
 */
@Slf4j
@Component
public class ContentStore {

    private final List<SubjectView> subjects;
    private final Map<String, SubjectView> subjectBySlug = new LinkedHashMap<>();
    private final List<TopicInfo> topics;
    private final Map<String, TopicInfo> topicBySlug = new HashMap<>();
    private final Map<String, List<TopicInfo>> topicsBySubject = new HashMap<>();
    private final Map<String, List<QuizQuestionView>> quizzesByTopic = new HashMap<>();
    private final Map<String, String> correctByQuizId = new HashMap<>();
    private final List<ErrorEntryView> errorEntries;
    private final Map<String, ErrorEntryView> errorBySlug = new HashMap<>();

    /**
     * 로더가 읽은 콘텐츠로 화면용 객체와 색인을 만든다.
     *
     * @param loader          검증된 콘텐츠
     * @param showUnpublished 비공개 과목 · 토픽도 보일지 여부
     */
    public ContentStore(ContentLoader loader,
                        @Value("${cs-flow.content.show-unpublished:false}") boolean showUnpublished) {
        Map<String, SubjectView> allSubjects = new HashMap<>();
        for (ContentSubject s : loader.getSubjects()) {
            SubjectView view = new SubjectView(s.slug(), s.name(), s.colorAccent());
            allSubjects.put(s.slug(), view);
            if (s.published() || showUnpublished) {
                subjectBySlug.put(s.slug(), view);
            }
        }
        this.subjects = List.copyOf(subjectBySlug.values());

        List<TopicInfo> visible = new ArrayList<>();
        for (ContentTopic t : loader.getTopics()) {
            if (!t.published() && !showUnpublished) {
                continue;
            }
            TopicInfo info = new TopicInfo(t.slug(), t.title(), t.templateName(), t.metaDescription(),
                    allSubjects.get(t.subject()), t.tags().stream().map(TopicTagView::new).toList(),
                    t.visual(), t.order(), t.seq(), 0, 0);
            visible.add(info);
            topicBySlug.put(t.slug(), info);
            topicsBySubject.computeIfAbsent(t.subject(), k -> new ArrayList<>()).add(info);
            indexQuizzes(t);
        }
        visible.sort(Comparator.comparingInt(TopicInfo::seq));
        this.topics = List.copyOf(visible);
        topicsBySubject.replaceAll((k, v) -> v.stream().sorted(Comparator.comparingInt(TopicInfo::order)).toList());

        List<ErrorEntryView> errors = new ArrayList<>();
        for (ContentError e : loader.getErrorEntries()) {
            List<TopicInfo> related = e.topics().stream().map(topicBySlug::get).filter(Objects::nonNull).toList();
            ErrorEntryView view = new ErrorEntryView(e.slug(), e.order(), e.category(), e.title(), e.errorMessage(),
                    e.envOs(), e.envDistro(), e.envVersion(), e.cause(), e.solution(), e.reproduction(),
                    e.createdOn(), e.verifiedOn(), e.verified(), e.sources(), related);
            errors.add(view);
            errorBySlug.put(e.slug(), view);
        }
        errors.sort(Comparator.comparingInt(ErrorEntryView::order));
        this.errorEntries = List.copyOf(errors);
        log.info("콘텐츠 저장소 준비 - 과목 {}, 토픽 {}, 에러 {}", subjects.size(), topics.size(), errorEntries.size());
    }

    private void indexQuizzes(ContentTopic t) {
        List<QuizQuestionView> views = new ArrayList<>();
        for (ContentQuiz q : t.quizzes()) {
            List<String> o = q.options();
            views.add(new QuizQuestionView(q.id(), q.prompt(), o.get(0), o.get(1), o.get(2), o.get(3), q.hint(), q.explanation()));
            correctByQuizId.put(q.id(), q.correctOption());
        }
        quizzesByTopic.put(t.slug(), List.copyOf(views));
    }

    /**
     * 공개된 과목 목록을 과목 순서대로 돌려준다.
     */
    public List<SubjectView> subjects() {
        return subjects;
    }

    /**
     * slug로 공개된 과목을 찾는다.
     */
    public Optional<SubjectView> subject(String slug) {
        return Optional.ofNullable(subjectBySlug.get(slug));
    }

    /**
     * 보이는 모든 토픽을 전체 순서(seq)대로 돌려준다.
     */
    public List<TopicInfo> topics() {
        return topics;
    }

    /**
     * 과목에 속한 토픽을 과목 안 순서대로 돌려준다.
     */
    public List<TopicInfo> topicsOf(String subjectSlug) {
        return topicsBySubject.getOrDefault(subjectSlug, List.of());
    }

    /**
     * 과목 slug와 토픽 slug로 토픽을 찾는다.
     */
    public Optional<TopicInfo> topic(String subjectSlug, String topicSlug) {
        TopicInfo info = topicBySlug.get(topicSlug);
        return info != null && info.subject().slug().equals(subjectSlug) ? Optional.of(info) : Optional.empty();
    }

    /**
     * 토픽 slug로 퀴즈 문항(정답 제외)을 출제 순서대로 돌려준다.
     */
    public List<QuizQuestionView> quizzes(String topicSlug) {
        return quizzesByTopic.getOrDefault(topicSlug, List.of());
    }

    /**
     * 문항 ID의 정답 보기(A~D)를 돌려준다. 없는 문항이면 비어 있다.
     */
    public Optional<String> correctOption(String questionId) {
        return Optional.ofNullable(correctByQuizId.get(questionId));
    }

    /**
     * 보이는 에러 사전 항목을 목록 순서(order)대로 돌려준다.
     */
    public List<ErrorEntryView> errorEntries() {
        return errorEntries;
    }

    /**
     * slug로 에러 사전 항목을 찾는다.
     */
    public Optional<ErrorEntryView> errorEntry(String slug) {
        return Optional.ofNullable(errorBySlug.get(slug));
    }
}