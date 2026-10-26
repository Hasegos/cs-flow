package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.common.util.SearchPatterns;
import io.dev.cs_flow.dto.ErrorCategoryCount;
import io.dev.cs_flow.dto.ErrorEntrySummary;
import io.dev.cs_flow.dto.TopicSearchCondition;
import io.dev.cs_flow.model.ErrorEntry;
import io.dev.cs_flow.model.ErrorEntrySource;
import io.dev.cs_flow.repository.ErrorEntryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 에러 사전 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 항목 단건 조회, 에러 문자열 검색, 검색 결과 요약 문구, TechArticle JSON-LD 생성 기능을 제공한다.
 * 검증되지 않은 항목은 JSON-LD를 만들지 않는다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ErrorEntryService {

    private static final int DESCRIPTION_MESSAGE_MAX = 90;

    private final ErrorEntryRepository errorEntryRepository;
    private final ObjectMapper objectMapper;

    /**
     * slug로 항목 단건을 조회한다. 검증 여부와 관계없이 조회되며, 색인 여부는 화면에서 구분한다.
     *
     * @param slug 항목 영문 식별자
     * @return 항목 (근거 링크, 관련 개념 포함)
     * @throws NotFoundException 해당 slug의 항목이 없을 경우
     */
    @Cacheable(value = "errorEntry", key = "#slug")
    @Transactional(readOnly = true)
    public ErrorEntry getEntry(String slug) {
        log.info("에러 항목 단건 조회 - slug: {}", slug);
        return errorEntryRepository.findDetailBySlug(slug)
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
    @Transactional(readOnly = true)
    public Page<ErrorEntry> search(String category, TopicSearchCondition condition, int page, int size) {
        log.info("에러 항목 목록 조회 - category: {}, condition: {}, page: {}, size: {}", category, condition, page, size);
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Order.desc("errorId")));
        Page<Long> idPage = errorEntryRepository.searchIds(
                category == null ? "" : category, SearchPatterns.toLikePattern(condition.query()), pageable);
        if (idPage.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, idPage.getTotalElements());
        }
        Map<Long, ErrorEntry> byId = new LinkedHashMap<>();
        errorEntryRepository.findAllByIds(idPage.getContent()).forEach(e -> byId.put(e.getErrorId(), e));
        List<ErrorEntry> ordered = idPage.getContent().stream().map(byId::get).toList();
        return new PageImpl<>(ordered, pageable, idPage.getTotalElements());
    }

    /**
     * 토픽에 연결된 검증된 항목 요약을 조회한다. 토픽 페이지의 "이 개념에서 만나는 에러"에 쓴다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @param topicSlug   토픽 영문 식별자
     * @return 항목 요약 목록, 없으면 빈 리스트 반환
     */
    @Cacheable(value = "topicErrors", key = "#subjectSlug + ':' + #topicSlug")
    @Transactional(readOnly = true)
    public List<ErrorEntrySummary> getVerifiedByTopic(String subjectSlug, String topicSlug) {
        return errorEntryRepository.findVerifiedByTopic(subjectSlug, topicSlug);
    }

    /**
     * 분류별 항목 수를 항목이 많은 분류부터 조회한다. 목록 화면의 분류 칩과 sitemap에 쓴다.
     *
     * @return 분류별 항목 수 목록, 항목이 없으면 빈 리스트 반환
     */
    @Transactional(readOnly = true)
    public List<ErrorCategoryCount> getCategories() {
        return errorEntryRepository.countByCategory();
    }

    /**
     * 분류 slug에 해당하는 분류의 항목 수를 조회한다.
     *
     * @param category 분류 slug
     * @return 해당 분류의 항목 수
     * @throws NotFoundException 항목이 하나도 없는 분류일 경우
     */
    @Transactional(readOnly = true)
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
    @Transactional(readOnly = true)
    public String describe(ErrorEntry entry) {
        String firstLine = entry.getErrorMessage().strip().lines().findFirst().orElse("").strip();
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
    @Transactional(readOnly = true)
    public String buildLdJson(ErrorEntry entry, String canonicalUrl) {
        if (!entry.isVerified()) {
            return null;
        }
        Map<String, Object> publisher = Map.of(
                "@type", "Organization",
                "name", "CS Flow",
                "url", "https://csflow.kr"
        );
        LocalDate modified = entry.getVerifiedOn() != null ? entry.getVerifiedOn() : entry.getCreatedOn();
        Map<String, Object> ld = new LinkedHashMap<>();
        ld.put("@context", "https://schema.org");
        ld.put("@type", "TechArticle");
        ld.put("headline", entry.getTitle());
        ld.put("description", describe(entry));
        ld.put("url", canonicalUrl);
        ld.put("mainEntityOfPage", canonicalUrl);
        ld.put("inLanguage", "ko");
        ld.put("datePublished", entry.getCreatedOn().toString());
        ld.put("dateModified", modified.toString());
        ld.put("author", publisher);
        ld.put("publisher", publisher);
        List<String> citations = entry.getSources().stream().map(ErrorEntrySource::getUrl).toList();
        if (!citations.isEmpty()) {
            ld.put("citation", citations);
        }
        try {
            return objectMapper.writeValueAsString(ld).replace("<", "\\u003c");
        } catch (Exception e) {
            log.warn("JSON-LD 직렬화 실패 - errorSlug: {}", entry.getSlug(), e);
            return null;
        }
    }

    /**
     * sitemap에 넣을 검증된 항목의 slug 목록을 조회한다.
     *
     * @return 검증된 항목 slug 목록, 없으면 빈 리스트 반환
     */
    @Cacheable("errorSitemap")
    @Transactional(readOnly = true)
    public List<String> getVerifiedSlugs() {
        return errorEntryRepository.findVerifiedSlugs();
    }
}