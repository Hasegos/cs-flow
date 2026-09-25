package io.dev.cs_flow.controller;

import io.dev.cs_flow.common.interceptor.VisitorCookieInterceptor;
import io.dev.cs_flow.dto.TopicViewPath;
import io.dev.cs_flow.model.Topic;
import io.dev.cs_flow.service.QuizService;
import io.dev.cs_flow.service.TopicLikeService;
import io.dev.cs_flow.service.TopicService;
import io.dev.cs_flow.service.VisualizerService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * 토픽 학습 페이지 요청을 처리하는 컨트롤러.
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class TopicController {

    private final TopicService topicService;
    private final VisualizerService visualizerService;
    private final QuizService quizService;
    private final TopicLikeService topicLikeService;

    @Value("${kakao.js-key}")
    private String kakaoJsKey;

    /**
     * 토픽 학습 페이지를 렌더링한다.
     * 토픽 정보, 시각화 JS 파일 키, 연관 토픽 목록을 함께 전달한다.
     * 뷰 이름은 {@link VisualizerService#resolveTopicView}가 jsFileKey의 묶음 폴더와 templateName으로 결정한다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @param topicSlug   토픽 영문 식별자
     * @param model       뷰에 전달할 데이터 모델
     * @return 토픽 학습 페이지 뷰 이름 (topics/{subjectSlug}/{assetGroup}/{templateName})
     */
    @GetMapping("/{subjectSlug:arch|os|network|ds|algo|db}/{topicSlug:[a-z0-9\\-]+}")
    public String topicDetail(@PathVariable String subjectSlug,
                              @PathVariable String topicSlug,
                              HttpServletRequest request,
                              Model model){
        log.info("토픽 상세 페이지 요청 - subjectSlug: {}, topicSlug: {}", subjectSlug, topicSlug);

        Topic topic = topicService.getPublishedTopic(subjectSlug, topicSlug);
        TopicViewPath viewPath = visualizerService.resolveTopicView(topic, subjectSlug);

        String encodedTopic = URLEncoder.encode(topicSlug, StandardCharsets.UTF_8);
        String canonicalUrl = "https://csflow.kr/" + subjectSlug + "/" + encodedTopic;

        String visitorId = (String) request.getAttribute(VisitorCookieInterceptor.REQUEST_ATTR);
        if (visitorId != null) {
            topicService.recordView(topic.getTopicId(), visitorId);
        }

        model.addAttribute("topic", topic);
        model.addAttribute("jsFileKey", viewPath.jsFileKey());
        model.addAttribute("ldJson", topicService.buildLdJson(topic, canonicalUrl));
        model.addAttribute("relatedTopics", topicService.getRelatedTopics(topic.getTopicId()));
        model.addAttribute("quizQuestions", quizService.getQuestions(topic.getTopicId()));
        model.addAttribute("liked", visitorId != null && topicLikeService.isLiked(topic.getTopicId(), visitorId));
        model.addAttribute("likeCount", topicLikeService.countLikes(topic.getTopicId()));
        model.addAttribute("canonicalUrl", canonicalUrl);
        model.addAttribute("kakaoJsKey", kakaoJsKey);

        return viewPath.viewName();
    }
}