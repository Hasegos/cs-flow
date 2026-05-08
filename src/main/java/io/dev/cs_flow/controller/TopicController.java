package io.dev.cs_flow.controller;

import io.dev.cs_flow.model.Topic;
import io.dev.cs_flow.service.TopicService;
import io.dev.cs_flow.service.VisualizerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * 토픽 학습 페이지 요청을 처리하는 컨트롤러.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class TopicController {

    private final TopicService topicService;
    private final VisualizerService visualizerService;

    /**
     * 토픽 학습 페이지를 렌더링한다.
     * 토픽 정보, 시각화 JS 파일 키, 연관 토픽 목록을 함께 전달한다.
     * 토픽의 {@code templateName}을 기반으로 Thymeleaf 템플릿을 동적으로 결정한다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @param topicSlug   토픽 영문 식별자
     * @param model       뷰에 전달할 데이터 모델
     * @return 토픽 학습 페이지 뷰 이름 (topics/{subjectSlug}/{templateName})
     */
    @GetMapping("/{subjectSlug}/{topicSlug}")
    public String topicDetail(@PathVariable String subjectSlug,
                              @PathVariable String topicSlug,
                              Model model){
        log.info("토픽 상세 페이지 요청 - subjectSlug: {}, topicSlug: {}", subjectSlug, topicSlug);

        Topic topic = topicService.getPublishedTopic(subjectSlug, topicSlug);
        String jsFileKey = visualizerService.getVisualizer(topic.getTopicId()).getJsFileKey();

        model.addAttribute("topic", topic);
        model.addAttribute("jsFileKey", jsFileKey);
        model.addAttribute("relatedTopics", topicService.getRelatedTopics(topic.getTopicId()));

        return "topics/" + subjectSlug + "/" + topic.getTemplateName();
    }
}