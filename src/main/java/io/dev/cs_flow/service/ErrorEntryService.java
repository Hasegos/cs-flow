package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.common.util.SearchPatterns;
import io.dev.cs_flow.dto.ContentError;
import io.dev.cs_flow.dto.ErrorCategoryCount;
import io.dev.cs_flow.dto.ErrorEntrySummary;
import io.dev.cs_flow.dto.ErrorEntryView;
import io.dev.cs_flow.dto.TopicSearchCondition;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 에러 사전 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 콘텐츠 JSON({@link ContentStore})에서 항목 단건 조회, 에러 문자열 검색, 검색 결과 요약 문구,
 * TechArticle JSON-LD 생성 기능을 제공한다. 검증되지 않은 항목은 JSON-LD를 만들지 않는다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ErrorEntryService {

    private static final int DESCRIPTION_MESSAGE_MAX = 90;

    private final ContentStore contentStore;
    private final ObjectMapper objectMapper;

    /**
     * slug로 항목 단건을 조회한다. 검증 여부와 관계없이 조회되며, 색인 여부는 화면에서 구분한다.
     *
     * @param slug 항목 영문 식별자
     * @return 항목 (근거 링크, 관련 개념 포함)
     * @throws NotFoundException 해당 slug의 항목이 없을 경우
     */
    public ErrorEntryView getEntry(String slug) {
        log.info("에러 항목 단건 조회 - slug: {}", slug);
        return contentStore.errorEntry(slug)
                .orElseThrow(() -> new NotFoundException("존재하지 않는 에러 항목입니다. slug: " + slug));
    }

    /**
     * 분류와 검색어에 맞는 항목 목록을 페이지 단위로 조회한다. 조건이 없으면 전체를 최신 등록 순으로 돌려준다.
     *
     * @param category  분류 slug, 전체면 null
     * @param condition 검색 조건 (검색어만 사용, 소문자·공백 제거 부분 일치)
     * @param page      페이지 번호 (0-based)
     * @param size      페이지 크기
     * @return 항목 Page 객체
     */
    public Page<ErrorEntryView> search(String category, TopicSearchCondition condition, int page, int size) {
        log.info("에러 항목 목록 조회 - category: {}, condition: {}, page: {}, size: {}", category, condition, page, size);
        String query = SearchPatterns.normalizeQuery(condition.query());
        List<ErrorEntryView> matched = contentStore.errorEntries().stream()
                .filter(e -> category == null || e.category().equals(category))
                .filter(e -> query == null
                        || SearchPatterns.contains(e.errorMessage(), query)
                        || SearchPatterns.contains(e.title(), query)
                        || SearchPatterns.contains(e.category(), query))
                .sorted(Comparator.comparingInt(ErrorEntryView::order).reversed())
                .toList();
        Pageable pageable = PageRequest.of(page, size);
        int from = (int) Math.min(pageable.getOffset(), matched.size());
        int to = Math.min(from + size, matched.size());
        return new PageImpl<>(matched.subList(from, to), pageable, matched.size());
    }

    /**
     * 토픽에 연결된 검증된 항목 요약을 등록 순으로 조회한다. 토픽 페이지의 "이 개념에서 만나는 에러"에 쓴다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @param topicSlug   토픽 영문 식별자
     * @return 항목 요약 목록, 없으면 빈 리스트 반환
     */
    public List<ErrorEntrySummary> getVerifiedByTopic(String subjectSlug, String topicSlug) {
        return contentStore.errorEntries().stream()
                .filter(ErrorEntryView::verified)
                .filter(e -> e.topics().stream()
                        .anyMatch(t -> t.slug().equals(topicSlug) && t.subject().slug().equals(subjectSlug)))
                .map(e -> new ErrorEntrySummary(e.slug(), e.title(), e.errorMessage()))
                .toList();
    }

    /**
     * 분류별 항목 수를 항목이 많은 분류부터 조회한다. 목록 화면의 분류 칩과 sitemap에 쓴다.
     *
     * @return 분류별 항목 수 목록, 항목이 없으면 빈 리스트 반환
     */
    public List<ErrorCategoryCount> getCategories() {
        Map<String, long[]> counts = new TreeMap<>();
        for (ErrorEntryView e : contentStore.errorEntries()) {
            long[] c = counts.computeIfAbsent(e.category(), k -> new long[2]);
            c[0]++;
            if (e.verified()) {
                c[1]++;
            }
        }
        return counts.entrySet().stream()
                .map(e -> new ErrorCategoryCount(e.getKey(), e.getValue()[0], e.getValue()[1]))
                .sorted(Comparator.comparingLong(ErrorCategoryCount::total).reversed()
                        .thenComparing(ErrorCategoryCount::category))
                .toList();
    }

    /**
     * 분류 slug에 해당하는 분류의 항목 수를 조회한다.
     *
     * @param category 분류 slug
     * @return 해당 분류의 항목 수
     * @throws NotFoundException 항목이 하나도 없는 분류일 경우
     */
    public ErrorCategoryCount getCategory(String category) {
        return getCategories().stream()
                .filter(c -> c.category().equals(category))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("존재하지 않는 에러 분류입니다. category: " + category));
    }

    /**
     * 항목 페이지의 meta description 문구를 만든다. 에러 메시지 첫 줄을 그대로 넣는다.
     *
     * @param entry 대상 항목
     * @return 검색 결과에 보일 한 문장
     */
    public String describe(ErrorEntryView entry) {
        String firstLine = entry.errorMessage().strip().lines().findFirst().orElse("").strip();
        if (firstLine.length() > DESCRIPTION_MESSAGE_MAX) {
            firstLine = firstLine.substring(0, DESCRIPTION_MESSAGE_MAX) + "…";
        }
        return "\"" + firstLine + "\" 에러의 원인, 해결 방법, 재현 방법을 근거 링크와 함께 정리했습니다.";
    }

    /**
     * 항목 페이지용 JSON-LD(TechArticle)를 생성한다. 검증되지 않은 항목은 만들지 않는다.
     *
     * @param entry        대상 항목
     * @param canonicalUrl 항목 페이지 canonical URL
     * @return JSON-LD 문자열, 검증되지 않았거나 직렬화에 실패하면 null
     */
    public String buildLdJson(ErrorEntryView entry, String canonicalUrl) {
        if (!entry.verified()) {
            return null;
        }
        Map<String, Object> publisher = Map.of(
                "@type", "Organization",
                "name", "CS Flow",
                "url", "https://csflow.kr"
        );
        LocalDate modified = entry.verifiedOn() != null ? entry.verifiedOn() : entry.createdOn();
        Map<String, Object> ld = new LinkedHashMap<>();
        ld.put("@context", "https://schema.org");
        ld.put("@type", "TechArticle");
        ld.put("headline", entry.title());
        ld.put("description", describe(entry));
        ld.put("url", canonicalUrl);
        ld.put("mainEntityOfPage", canonicalUrl);
        ld.put("inLanguage", "ko");
        ld.put("datePublished", entry.createdOn().toString());
        ld.put("dateModified", modified.toString());
        ld.put("author", publisher);
        ld.put("publisher", publisher);
        List<String> citations = entry.sources().stream().map(ContentError.Source::url).toList();
        if (!citations.isEmpty()) {
            ld.put("citation", citations);
        }
        try {
            return objectMapper.writeValueAsString(ld).replace("<", "\\u003c");
        } catch (Exception e) {
            log.warn("JSON-LD 직렬화 실패 - errorSlug: {}", entry.slug(), e);
            return null;
        }
    }

    /**
     * sitemap에 넣을 검증된 항목의 slug 목록을 등록 순으로 조회한다.
     *
     * @return 검증된 항목 slug 목록, 없으면 빈 리스트 반환
     */
    public List<String> getVerifiedSlugs() {
        return contentStore.errorEntries().stream()
                .filter(ErrorEntryView::verified)
                .map(ErrorEntryView::slug)
                .toList();
    }
}