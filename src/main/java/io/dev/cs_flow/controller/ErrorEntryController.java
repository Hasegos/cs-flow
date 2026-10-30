package io.dev.cs_flow.controller;

import io.dev.cs_flow.common.util.BreadcrumbLd;
import io.dev.cs_flow.common.util.OgImages;
import io.dev.cs_flow.common.util.PageRangeUtil;
import io.dev.cs_flow.dto.ErrorCategoryCount;
import io.dev.cs_flow.dto.ErrorEntryView;
import io.dev.cs_flow.dto.TopicSearchCondition;
import io.dev.cs_flow.service.ErrorEntryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 에러 메시지 사전 목록·상세 페이지 요청을 처리하는 컨트롤러.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class ErrorEntryController {

    private static final int PAGE_SIZE = 10;
    private static final String BASE_URL = "https://csflow.kr/errors";

    private final ErrorEntryService errorEntryService;

    /**
     * 에러 사전 목록 페이지를 렌더링한다.
     * 검색어(q)가 있으면 에러 메시지·제목·분류에 걸리는 항목만 보여주고, 검색엔진 색인에서 제외(noindex)한다.
     *
     * @param page  페이지 번호 (0-based, 기본값 0)
     * @param q     에러 문자열 검색어 (선택)
     * @param model 뷰에 전달할 데이터 모델
     * @return 목록 페이지 뷰 이름
     */
    @GetMapping("/errors")
    public String list(@RequestParam(defaultValue = "0") int page,
                       @RequestParam(required = false) String q,
                       Model model) {
        return renderList(null, page, q, model);
    }

    /**
     * 에러 사전 분류별 목록 페이지를 렌더링한다.
     * 검증된 항목이 {@link ErrorCategoryCount#MIN_INDEXABLE}개 미만인 분류와 검색 결과는 색인에서 제외(noindex)한다.
     *
     * @param category 분류 slug
     * @param page     페이지 번호 (0-based, 기본값 0)
     * @param q        에러 문자열 검색어 (선택)
     * @param model    뷰에 전달할 데이터 모델
     * @return 목록 페이지 뷰 이름
     * @throws io.dev.cs_flow.common.exception.NotFoundException 항목이 없는 분류일 경우
     */
    @GetMapping("/errors/category/{category:[a-z0-9\\-]+}")
    public String listByCategory(@PathVariable String category,
                                 @RequestParam(defaultValue = "0") int page,
                                 @RequestParam(required = false) String q,
                                 Model model) {
        return renderList(category, page, q, model);
    }

    /**
     * 전체 목록과 분류별 목록이 함께 쓰는 모델 구성과 뷰 이름 반환.
     *
     * @param category 분류 slug, 전체 목록이면 null
     * @param page     페이지 번호 (0-based)
     * @param q        검색어 (선택)
     * @param model    뷰에 전달할 데이터 모델
     * @return 목록 페이지 뷰 이름
     */
    private String renderList(String category, int page, String q, Model model) {
        TopicSearchCondition condition = new TopicSearchCondition(q, null);
        log.info("에러 사전 목록 요청 - category: {}, condition: {}, page: {}", category, condition, page);

        ErrorCategoryCount current = category == null ? null : errorEntryService.getCategory(category);
        Page<ErrorEntryView> entryPage = errorEntryService.search(category, condition, Math.max(0, page), PAGE_SIZE);
        String basePath = category == null ? "/errors" : "/errors/category/" + category;

        model.addAttribute("ogImage", OgImages.url("errors", category == null ? "_index" : "_category-" + category));
        model.addAttribute("categories", errorEntryService.getCategories());
        model.addAttribute("category", category);
        model.addAttribute("categoryLabel", current == null ? null : current.label());
        model.addAttribute("basePath", basePath);
        model.addAttribute("entries", entryPage.getContent());
        model.addAttribute("currentPage", entryPage.getNumber());
        model.addAttribute("totalPages", entryPage.getTotalPages());
        model.addAttribute("totalElements", entryPage.getTotalElements());
        model.addAttribute("pageRange", PageRangeUtil.build(entryPage.getNumber(), entryPage.getTotalPages()));
        model.addAttribute("q", condition.query());
        model.addAttribute("qQs", queryString("q", condition.query()));
        model.addAttribute("filtered", condition.isFiltered());
        model.addAttribute("noindex", condition.isFiltered() || (current != null && !current.indexable()));
        model.addAttribute("currentSection", "errors");
        if (current == null) {
            model.addAttribute("pageTitle", "에러 메시지 사전 | CS Flow");
            model.addAttribute("pageDescription", "에러 메시지 원문으로 찾는 원인과 해결 방법. 발생 환경과 근거 링크를 함께 정리하고, 직접 재현해 검증한 항목만 표시합니다.");
        } else {
            model.addAttribute("pageTitle", current.label() + " 에러 메시지 모음 | CS Flow 에러 사전");
            model.addAttribute("pageDescription", current.label() + " 에러 메시지 " + current.total()
                    + "개의 원인과 해결 방법. 발생 환경과 근거 링크를 함께 정리하고, 직접 재현해 검증한 항목은 검증됨으로 표시합니다.");
        }
        String canonicalBase = "https://csflow.kr" + basePath;
        List<BreadcrumbLd.Crumb> crumbs = new ArrayList<>(List.of(new BreadcrumbLd.Crumb("에러 사전", BASE_URL)));
        if (current != null) {
            crumbs.add(new BreadcrumbLd.Crumb(current.label(), canonicalBase));
        }
        model.addAttribute("breadcrumbLd", BreadcrumbLd.build(crumbs));
        model.addAttribute("canonicalUrl", entryPage.getNumber() > 0 ? canonicalBase + "?page=" + entryPage.getNumber() : canonicalBase);
        return "errors/list";
    }

    /**
     * 에러 사전 항목 상세 페이지를 렌더링한다.
     * 검증되지 않은 항목은 접근은 가능하지만 검색엔진 색인에서 제외(noindex)하고 구조화 데이터를 내보내지 않는다.
     *
     * @param slug  항목 영문 식별자
     * @param model 뷰에 전달할 데이터 모델
     * @return 상세 페이지 뷰 이름
     */
    @GetMapping("/errors/{slug:[a-z0-9\\-]+}")
    public String detail(@PathVariable String slug, Model model) {
        log.info("에러 사전 상세 요청 - slug: {}", slug);

        ErrorEntryView entry = errorEntryService.getEntry(slug);
        String canonicalUrl = BASE_URL + "/" + URLEncoder.encode(slug, StandardCharsets.UTF_8);

        model.addAttribute("entry", entry);
        model.addAttribute("noindex", !entry.verified());
        model.addAttribute("ogImage", OgImages.url("errors", slug));
        model.addAttribute("ldJson", errorEntryService.buildLdJson(entry, canonicalUrl));
        model.addAttribute("breadcrumbLd", BreadcrumbLd.build(List.of(
                new BreadcrumbLd.Crumb("에러 사전", BASE_URL),
                new BreadcrumbLd.Crumb(entry.title(), canonicalUrl))));
        model.addAttribute("currentSection", "errors");
        model.addAttribute("pageTitle", entry.title() + " 원인과 해결 | CS Flow 에러 사전");
        model.addAttribute("pageDescription", errorEntryService.describe(entry));
        model.addAttribute("canonicalUrl", canonicalUrl);
        return "errors/detail";
    }

    /**
     * 링크 뒤에 붙일 "&name=value" 문자열을 만든다. 값이 null이면 빈 문자열을 반환한다.
     */
    private static String queryString(String name, String value) {
        if (value == null) {
            return "";
        }
        return "&" + name + "=" + URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}