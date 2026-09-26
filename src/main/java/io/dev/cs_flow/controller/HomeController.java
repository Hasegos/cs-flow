package io.dev.cs_flow.controller;

import io.dev.cs_flow.service.SubjectService;
import io.dev.cs_flow.service.TopicService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 랜딩 페이지 요청을 처리하는 컨트롤러.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class HomeController {
    
    private final SubjectService subjectService;
    private final TopicService topicService;

    /**
     * 랜딩 페이지를 렌더링한다.
     * 공개된 과목 목록과, "이어서 학습하기"에서 마지막 토픽을 찾는 데 쓸 공개 토픽 목록을 함께 전달한다.
     *
     * @param model 뷰에 전달할 데이터 모델
     * @return 랜딩 페이지 뷰 이름
     */
    @GetMapping("/")
    public String home(Model model){
        log.info("홈 페이지 요청");
        model.addAttribute("subjects", subjectService.getPublishedSubjects());
        model.addAttribute("topicIndexJson", topicService.getTopicIndexJson());
        model.addAttribute("canonicalUrl", "https://csflow.kr/");
        return "home";
    }
}