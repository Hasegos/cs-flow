package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.common.util.SearchPatterns;
import io.dev.cs_flow.dto.InterviewQuestionView;
import io.dev.cs_flow.dto.TagCount;
import io.dev.cs_flow.dto.TopicIndexItem;
import io.dev.cs_flow.dto.TopicInfo;
import io.dev.cs_flow.dto.TopicSearchCondition;
import io.dev.cs_flow.dto.TopicTagView;
import io.dev.cs_flow.model.TopicStat;
import io.dev.cs_flow.repository.TopicStatRepository;
import io.dev.cs_flow.repository.TopicViewRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 토픽 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 토픽 내용(제목, 태그, 순서 등)은 콘텐츠 JSON({@link ContentStore})에서 읽고,
 * 조회수 · 추천수는 DB {@code topic_stat} 테이블에서 slug로 읽어 합친다.
 * 과목 slug 기반 토픽 목록(검색어 · 태그 필터 포함), 단건 조회, 태그 기반 연관 토픽,
 * 과목별 태그 집계, JSON-LD 생성, 내 학습용 토픽 목록, 조회 기록 기능을 제공한다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TopicService {

    private final ContentStore contentStore;
    private final TopicStatRepository topicStatRepository;
    private final TopicViewRepository topicViewRepository;
    private final ObjectMapper objectMapper;

    /**
     * 과목 slug와 토픽 slug로 공개된 토픽 단건을 조회한다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @param topicSlug   토픽 영문 식별자
     * @return 공개된 토픽
     * @throws NotFoundException 해당 slug의 공개된 토픽이 없을 경우
     */
    public TopicInfo getPublishedTopic(String subjectSlug, String topicSlug){
        log.info("토픽 단건 조회 - subjectSlug: {}, topicSlug: {}", subjectSlug, topicSlug);
        return contentStore.topic(subjectSlug, topicSlug)
                .orElseThrow(() -> new NotFoundException(
                        "존재하지않는 토픽입니다. subjectSlug: " + subjectSlug + ", topicSlug: " + topicSlug
                ));
    }

    /**
     * 특정 토픽과 태그가 하나라도 겹치는 연관 토픽 목록을 전체 순서대로 조회한다. 본인은 제외한다.
     *
     * @param topic 기준 토픽
     * @return 연관 토픽 목록, 없으면 빈 리스트 반환
     */
    public List<TopicInfo> getRelatedTopics(TopicInfo topic){
        Set<String> tags = topic.tags().stream().map(TopicTagView::tag).collect(Collectors.toSet());
        return contentStore.topics().stream()
                .filter(t -> !t.slug().equals(topic.slug()))
                .filter(t -> t.tags().stream().anyMatch(tag -> tags.contains(tag.tag())))
                .toList();
    }

    /**
     * 같은 과목에서 현재 토픽 다음 순서의 공개 토픽을 조회한다.
     *
     * @param topic 현재 토픽
     * @return 다음 토픽, 과목의 마지막 토픽이면 null
     */
    public TopicIndexItem getNextTopic(TopicInfo topic){
        return neighbor(topic, 1);
    }

    /**
     * 같은 과목에서 현재 토픽 바로 앞 순서의 공개 토픽을 조회한다.
     *
     * @param topic 현재 토픽
     * @return 이전 토픽, 과목의 첫 토픽이면 null
     */
    public TopicIndexItem getPrevTopic(TopicInfo topic){
        return neighbor(topic, -1);
    }

    /**
     * 같은 과목 안에서 기준 토픽에서 offset만큼 떨어진 토픽을 요약으로 돌려준다.
     *
     * @param topic  기준 토픽
     * @param offset 기준 토픽에서 떨어진 칸 수(이전은 음수, 다음은 양수)
     * @return 이웃 토픽 요약, 과목의 처음이나 끝을 벗어나면 null
     */
    private TopicIndexItem neighbor(TopicInfo topic, int offset){
        List<TopicInfo> siblings = contentStore.topicsOf(topic.subject().slug());
        for (int i = 0; i < siblings.size(); i++) {
            if (siblings.get(i).slug().equals(topic.slug())) {
                int at = i + offset;
                if (at < 0 || at >= siblings.size()) {
                    return null;
                }
                TopicInfo found = siblings.get(at);
                return new TopicIndexItem(found.slug(), found.title(), found.subject().slug());
            }
        }
        return null;
    }

    /**
     * 조건에 맞는 공개된 토픽 목록을 페이지 단위로 조회한다. 조회수 · 추천수는 DB 값을 slug로 합친다.
     *
     * @param subjectSlug 과목 영문 식별자, null이면 전체 과목
     * @param condition   검색 조건 (검색어는 대소문자·띄어쓰기 무시 부분 일치, 태그는 정확히 일치)
     * @param page        페이지 번호 (0-based)
     * @param size        페이지 크기
     * @param sort        정렬 기준 ("view"면 조회수 내림차순, "like"면 추천수 내림차순, 그 외는 발행 오름차순)
     * @return 공개된 토픽 Page 객체
     */
    @Transactional(readOnly = true)
    public Page<TopicInfo> getPublishedTopicsPageable(String subjectSlug, TopicSearchCondition condition,
                                                      int page, int size, String sort){
        log.info("토픽 목록 조회 - subjectSlug: {}, condition: {}, page: {}, size: {}, sort: {}",
                subjectSlug, condition, page, size, sort);
        Map<String, TopicStat> stats = new HashMap<>();
        topicStatRepository.findAll().forEach(s -> stats.put(s.getSlug(), s));

        String query = SearchPatterns.normalizeQuery(condition.query());
        List<TopicInfo> matched = (subjectSlug == null ? contentStore.topics() : contentStore.topicsOf(subjectSlug))
                .stream()
                .filter(t -> condition.tag() == null || t.tags().stream().anyMatch(tag -> tag.tag().equals(condition.tag())))
                .filter(t -> query == null
                        || SearchPatterns.contains(t.title(), query)
                        || t.tags().stream().anyMatch(tag -> SearchPatterns.contains(tag.tag(), query)))
                .map(t -> {
                    TopicStat s = stats.get(t.slug());
                    return s == null ? t : t.withCounts(s.getViewCount(), s.getLikeCount());
                })
                .sorted(comparator(sort, stats))
                .toList();

        Pageable pageable = PageRequest.of(page, size);
        int from = (int) Math.min(pageable.getOffset(), matched.size());
        int to = Math.min(from + size, matched.size());
        return new PageImpl<>(matched.subList(from, to), pageable, matched.size());
    }

    /**
     * 정렬 기준에 맞는 비교자를 만든다. 동점이면 먼저 그 수에 도달한 토픽, 그다음 전체 순서(seq) 순이다.
     *
     * @param sort  정렬 기준({@code view}, {@code like}, 그 외는 전체 순서)
     * @param stats 토픽 slug별 조회수 · 추천수 통계
     * @return 토픽 비교자
     */
    private static Comparator<TopicInfo> comparator(String sort, Map<String, TopicStat> stats){
        Comparator<TopicInfo> bySeq = Comparator.comparingInt(TopicInfo::seq);
        Comparator<LocalDateTime> nullsLast = Comparator.nullsLast(Comparator.naturalOrder());
        if ("view".equals(sort)) {
            return Comparator.comparingLong(TopicInfo::viewCount).reversed()
                    .thenComparing(t -> stats.containsKey(t.slug()) ? stats.get(t.slug()).getViewCountUpdatedAt() : null, nullsLast)
                    .thenComparing(bySeq);
        }
        if ("like".equals(sort)) {
            return Comparator.comparingLong(TopicInfo::likeCount).reversed()
                    .thenComparing(t -> stats.containsKey(t.slug()) ? stats.get(t.slug()).getLikeCountUpdatedAt() : null, nullsLast)
                    .thenComparing(bySeq);
        }
        return bySeq;
    }

    /**
     * 과목에 속한 공개 토픽의 태그 목록을 토픽 수와 함께 조회한다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @return 태그와 토픽 수 목록 (토픽 수 내림차순, 태그 오름차순), 없으면 빈 리스트 반환
     */
    public List<TagCount> getPublishedTags(String subjectSlug){
        Map<String, Long> counts = new HashMap<>();
        contentStore.topicsOf(subjectSlug).forEach(t ->
                t.tags().forEach(tag -> counts.merge(tag.tag(), 1L, Long::sum)));
        return counts.entrySet().stream()
                .map(e -> new TagCount(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(TagCount::count).reversed().thenComparing(TagCount::tag))
                .toList();
    }

    /**
     * 토픽의 면접 질문을 순서대로 조회한다.
     *
     * @param topicSlug 토픽 영문 식별자
     * @return 면접 질문 목록, 없으면 빈 리스트 반환
     */
    public List<InterviewQuestionView> getInterviewQuestions(String topicSlug){
        return contentStore.interviews(topicSlug);
    }

    /**
     * 내 학습 페이지에서 쓸 공개 토픽 목록을 JSON 문자열로 만든다.
     * <p>
     * 브라우저에 저장된 학습 기록(slug)을 제목·과목과 매칭하는 데 쓰인다.
     * </p>
     *
     * @return [{slug, title, subjectSlug}] 형태의 JSON 문자열
     */
    @Cacheable("topicIndex")
    public String getTopicIndexJson(){
        log.info("공개 토픽 목록(JSON) 조회");
        List<TopicIndexItem> items = contentStore.topics().stream()
                .map(t -> new TopicIndexItem(t.slug(), t.title(), t.subject().slug()))
                .toList();
        return objectMapper.writeValueAsString(items);
    }

    /**
     * 토픽 학습 페이지용 JSON-LD(LearningResource)를 생성한다.
     *
     * @param topic        대상 토픽
     * @param canonicalUrl 토픽 페이지 canonical URL
     * @return JSON-LD 문자열, 직렬화 실패 시 null
     */
    public String buildLdJson(TopicInfo topic, String canonicalUrl){
        Map<String, Object> ld = new LinkedHashMap<>();
        ld.put("@context", "https://schema.org");
        ld.put("@type", "LearningResource");
        ld.put("name", topic.title());
        ld.put("description", topic.metaDescription());
        ld.put("url", canonicalUrl);
        ld.put("provider", Map.of(
                "@type", "Organization",
                "name", "CS Flow",
                "url", "https://csflow.kr"
        ));
        try {
            return objectMapper.writeValueAsString(ld).replace("<", "\\u003c");
        } catch (Exception e) {
            log.warn("JSON-LD 직렬화 실패 - topicSlug: {}", topic.slug(), e);
            return null;
        }
    }

    /**
     * 토픽 조회를 기록한다. 같은 방문자가 오늘 이미 조회했으면 무시한다.
     *
     * @param topicSlug 토픽 영문 식별자
     * @param visitorId 익명 방문자 식별자
     */
    @Transactional
    public void recordView(String topicSlug, String visitorId){
        int inserted = topicViewRepository.recordViewIfNew(topicSlug, visitorId);
        if (inserted > 0) {
            topicStatRepository.incrementViewCount(topicSlug);
            log.info("조회수 증가 - topicSlug: {}", topicSlug);
        }
    }
}