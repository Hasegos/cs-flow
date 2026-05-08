package io.dev.cs_flow.controller;

import io.dev.cs_flow.service.SubjectService;
import io.dev.cs_flow.service.TopicService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * 과목 홈 페이지 요청을 처리하는 컨트롤러.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class SubjectController {

    private final SubjectService subjectService;
    private final TopicService topicService;

    /**
     * 과목 홈 페이지를 렌더링한다.
     * 과목 정보와 해당 과목의 공개된 토픽 목록을 함께 전달한다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @param model       뷰에 전달할 데이터 모델
     * @return 과목 홈 페이지 뷰 이름
     */
    @GetMapping("/{subjectSlug}")
    public String subjectHome(@PathVariable String subjectSlug, Model model){
        log.info("과목 홈 페이지 요청 - subjectSlug: {}", subjectSlug);
        model.addAttribute("subject", subjectService.getPublishedSubject(subjectSlug));
        model.addAttribute("topics", topicService.getPublishedTopics(subjectSlug));
        return "subject/subject";
    }
}