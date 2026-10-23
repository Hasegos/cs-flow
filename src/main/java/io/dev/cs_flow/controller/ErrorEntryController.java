package io.dev.cs_flow.controller;

import io.dev.cs_flow.common.util.PageRangeUtil;
import io.dev.cs_flow.dto.TopicSearchCondition;
import io.dev.cs_flow.model.ErrorEntry;
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
        TopicSearchCondition condition = new TopicSearchCondition(q, null);
        log.info("에러 사전 목록 요청 - condition: {}, page: {}", condition, page);

        Page<ErrorEntry> entryPage = errorEntryService.search(condition, Math.max(0, page), PAGE_SIZE);

        model.addAttribute("entries", entryPage.getContent());
        model.addAttribute("currentPage", entryPage.getNumber());
        model.addAttribute("totalPages", entryPage.getTotalPages());
        model.addAttribute("totalElements", entryPage.getTotalElements());
        model.addAttribute("pageRange", PageRangeUtil.build(entryPage.getNumber(), entryPage.getTotalPages()));
        model.addAttribute("q", condition.query());
        model.addAttribute("qQs", queryString("q", condition.query()));
        model.addAttribute("filtered", condition.isFiltered());
        model.addAttribute("noindex", condition.isFiltered());
        model.addAttribute("pageTitle", "에러 메시지 사전 | CS Flow");
        model.addAttribute("pageDescription", "에러 메시지 원문으로 찾는 원인과 해결 방법. 발생 환경과 근거 링크를 함께 정리하고, 직접 재현해 검증한 항목만 표시합니다.");
        model.addAttribute("canonicalUrl", entryPage.getNumber() > 0 ? BASE_URL + "?page=" + entryPage.getNumber() : BASE_URL);
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

        ErrorEntry entry = errorEntryService.getEntry(slug);
        String canonicalUrl = BASE_URL + "/" + URLEncoder.encode(slug, StandardCharsets.UTF_8);

        model.addAttribute("entry", entry);
        model.addAttribute("noindex", !entry.isVerified());
        model.addAttribute("ldJson", errorEntryService.buildLdJson(entry, canonicalUrl));
        model.addAttribute("pageTitle", entry.getTitle() + " 원인과 해결 | CS Flow 에러 사전");
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