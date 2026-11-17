package io.dev.cs_flow.controller;

import io.dev.cs_flow.service.SubjectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 면접 대비 계획 페이지 요청을 처리하는 컨트롤러.
 * <p>
 * 계획 데이터는 {@code /api/plans}로 불러오고 계획 주소(토큰)는 브라우저 localStorage에 두므로,
 * 서버는 화면 뼈대와 과목 이름만 전달한다.
 * </p>
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class InterviewController {

    private final SubjectService subjectService;

    /**
     * 면접 대비 계획 페이지를 렌더링한다. 사람마다 내용이 달라 검색엔진 색인에서 제외한다.
     *
     * @param model 뷰에 전달할 데이터 모델
     * @return 면접 대비 계획 페이지 뷰 이름
     */
    @GetMapping("/interview")
    public String interview(Model model) {
        log.info("면접 대비 페이지 요청");
        model.addAttribute("subjects", subjectService.getPublishedSubjects());
        model.addAttribute("currentPage", "interview");
        model.addAttribute("noindex", true);
        model.addAttribute("pageTitle", "면접 대비 계획 | CS Flow");
        model.addAttribute("pageDescription", "면접일까지 매일 풀 CS 면접 질문을 직무와 학습 시간에 맞춰 짜 주는 계획입니다.");
        model.addAttribute("canonicalUrl", "https://csflow.kr/interview");
        return "interview/interview";
    }
}