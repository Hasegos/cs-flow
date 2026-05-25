package io.dev.cs_flow.controller;

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

import java.util.*;

/**
 * 과목 홈 페이지 요청을 처리하는 컨트롤러.
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
     *
     * @param subjectSlug 과목 영문 식별자
     * @param page        페이지 번호 (0-based, 기본값 0)
     * @param model       뷰에 전달할 데이터 모델
     * @return 과목 홈 페이지 뷰 이름
     */
    @GetMapping("/{subjectSlug:arch|os|network|ds|algo|db}")
    public String subjectHome(
            @PathVariable String subjectSlug,
            @RequestParam(defaultValue = "0") int page,
            Model model){
        log.info("과목 홈 페이지 요청 - subjectSlug: {}", subjectSlug);

        Page<Topic> topicPage = topicService.getPublishedTopicsPageable(subjectSlug, page, PAGE_SIZE);

        model.addAttribute("subject", subjectService.getPublishedSubject(subjectSlug));
        model.addAttribute("topics", topicPage.getContent());
        model.addAttribute("currentPage", topicPage.getNumber());
        model.addAttribute("totalPages",    topicPage.getTotalPages());
        model.addAttribute("totalElements", topicPage.getTotalElements());
        model.addAttribute("pageRange", buildPageRange(topicPage.getNumber(), topicPage.getTotalPages()));
        model.addAttribute("currentSubjet", subjectSlug);
        model.addAttribute("canonicalUrl", "https://csflow.kr/" + subjectSlug);
        return "subject/subject";
    }

    /**
     * 페이지네이션에 표시할 페이지 번호 목록을 생성한다.
     * -1은 생략 구분자(…)를 의미한다.
     *
     * 규칙:
     * - 첫 페이지(0)와 마지막 페이지는 항상 포함
     * - 현재 페이지 ±2 범위 포함
     * - gap == 2이면 중간 페이지 직접 삽입 (1 ... 3 대신 1 2 3)
     * - gap > 2이면 -1(…) 삽입
     */
    private List<Integer> buildPageRange(int currentPage, int totalPages){
        if (totalPages <= 1){
            return Collections.emptyList();
        }

        Set<Integer> pageSet = new LinkedHashSet<>();
        pageSet.add(0);
        for(int i = Math.max(0, currentPage - 2); i <= Math.min(totalPages - 1, currentPage + 2); i++){
            pageSet.add(i);
        }
        pageSet.add(totalPages - 1);

        List<Integer> sorted = new ArrayList<>(pageSet);
        Collections.sort(sorted);

        List<Integer> result = new ArrayList<>();
        int prev = -2;
        for (int p : sorted) {
            if (prev >= 0) {
                int gap = p - prev;
                if (gap == 2) {
                    result.add(prev + 1);
                } else if (gap > 2) {
                    result.add(-1);
                }
            }
            result.add(p);
            prev = p;
        }
        return result;
    }
}