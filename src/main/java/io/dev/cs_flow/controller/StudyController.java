package io.dev.cs_flow.controller;

import io.dev.cs_flow.service.SubjectService;
import io.dev.cs_flow.service.TopicService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 내 학습(진행도·북마크) 페이지 요청을 처리하는 컨트롤러.
 * <p>
 * 학습 기록은 브라우저 localStorage에만 있으므로, 서버는 과목 목록과 공개 토픽 목록만 전달한다.
 * </p>
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class StudyController {

    private final SubjectService subjectService;
    private final TopicService topicService;

    /**
     * 내 학습 페이지를 렌더링한다. 사람마다 내용이 달라 검색엔진 색인에서 제외한다.
     *
     * @param model 뷰에 전달할 데이터 모델
     * @return 내 학습 페이지 뷰 이름
     */
    @GetMapping("/study")
    public String study(Model model){
        log.info("내 학습 페이지 요청");
        model.addAttribute("subjects", subjectService.getPublishedSubjects());
        model.addAttribute("topicIndexJson", topicService.getTopicIndexJson());
        model.addAttribute("currentPage", "study");
        model.addAttribute("noindex", true);
        model.addAttribute("canonicalUrl", "https://csflow.kr/study");
        return "study/study";
    }
}