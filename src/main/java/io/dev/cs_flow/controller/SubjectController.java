package io.dev.cs_flow.controller;

import io.dev.cs_flow.common.util.PageRangeUtil;
import io.dev.cs_flow.dto.TopicSearchCondition;
import io.dev.cs_flow.model.Topic;
import io.dev.cs_flow.service.SubjectService;
import io.dev.cs_flow.service.TopicService;
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
 * 과목 홈 페이지(태그·검색어 필터 포함)와 전체 검색 페이지 요청을 처리하는 컨트롤러.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class SubjectController {

    private final SubjectService subjectService;
    private final TopicService topicService;
    private static final int PAGE_SIZE = 10;

    /**
     * 과목 홈 페이지를 렌더링한다.
     * 과목 정보와 해당 과목의 공개된 토픽 목록을 페이지 단위로 전달한다.
     * 검색어(q)·태그(tag)가 있으면 조건에 맞는 토픽만 보여주고, 검색엔진 색인에서 제외(noindex)한다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @param page        페이지 번호 (0-based, 기본값 0)
     * @param sort        정렬 기준 (default / view / like)
     * @param q           제목·태그 검색어 (선택)
     * @param tag         태그 필터 (선택)
     * @param model       뷰에 전달할 데이터 모델
     * @return 과목 홈 페이지 뷰 이름
     */
    @GetMapping("/{subjectSlug:arch|os|network|ds|algo|db}")
    public String subjectHome(
            @PathVariable String subjectSlug,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "default") String sort,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String tag,
            Model model){
        TopicSearchCondition condition = new TopicSearchCondition(q, tag);
        log.info("과목 홈 페이지 요청 - subjectSlug: {}, sort: {}, condition: {}", subjectSlug, sort, condition);

        Page<Topic> topicPage = topicService.getPublishedTopicsPageable(
                subjectSlug, condition, Math.max(0, page), PAGE_SIZE, sort);

        model.addAttribute("subject", subjectService.getPublishedSubject(subjectSlug));
        model.addAttribute("topics", topicPage.getContent());
        model.addAttribute("currentPage", topicPage.getNumber());
        model.addAttribute("totalPages",    topicPage.getTotalPages());
        model.addAttribute("totalElements", topicPage.getTotalElements());
        model.addAttribute("pageRange", PageRangeUtil.build(topicPage.getNumber(), topicPage.getTotalPages()));
        model.addAttribute("currentSubjet", subjectSlug);
        model.addAttribute("currentSort", sort);
        model.addAttribute("tags", topicService.getPublishedTags(subjectSlug));
        model.addAttribute("q", condition.query());
        model.addAttribute("tag", condition.tag());
        model.addAttribute("filtered", condition.isFiltered());
        model.addAttribute("qQs", queryString("q", condition.query()));
        model.addAttribute("filterQs", queryString("q", condition.query()) + queryString("tag", condition.tag()));
        model.addAttribute("noindex", condition.isFiltered());
        model.addAttribute("canonicalUrl", "https://csflow.kr/" + subjectSlug);
        return "subject/subject";
    }

    /**
     * 전체 과목 검색 페이지를 렌더링한다.
     * 검색어가 없으면 결과 없이 검색창만 보여준다. 검색 결과 페이지는 색인에서 제외(noindex)한다.
     *
     * @param q     제목·태그 검색어
     * @param page  페이지 번호 (0-based, 기본값 0)
     * @param model 뷰에 전달할 데이터 모델
     * @return 검색 페이지 뷰 이름
     */
    @GetMapping("/search")
    public String search(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            Model model){
        TopicSearchCondition condition = new TopicSearchCondition(q, null);
        log.info("검색 페이지 요청 - condition: {}, page: {}", condition, page);

        if (condition.isFiltered()) {
            Page<Topic> topicPage = topicService.getPublishedTopicsPageable(
                    null, condition, Math.max(0, page), PAGE_SIZE, "default");
            model.addAttribute("topics", topicPage.getContent());
            model.addAttribute("currentPage", topicPage.getNumber());
            model.addAttribute("totalPages", topicPage.getTotalPages());
            model.addAttribute("totalElements", topicPage.getTotalElements());
            model.addAttribute("pageRange", PageRangeUtil.build(topicPage.getNumber(), topicPage.getTotalPages()));
        }
        model.addAttribute("q", condition.query());
        model.addAttribute("qQs", queryString("q", condition.query()));
        model.addAttribute("noindex", true);
        model.addAttribute("canonicalUrl", "https://csflow.kr/search");
        return "search/search";
    }

    /**
     * 링크 뒤에 붙일 "&name=value" 문자열을 만든다. 값이 null이면 빈 문자열을 반환한다.
     */
    private static String queryString(String name, String value){
        if (value == null) {
            return "";
        }
        return "&" + name + "=" + URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}