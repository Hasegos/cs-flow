package io.dev.cs_flow.controller;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.common.interceptor.VisitorCookieInterceptor;
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
import tools.jackson.databind.ObjectMapper;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
    private final ObjectMapper objectMapper;

    /** 시각화 JS 키 형식: {과목}/{묶음}/{이름} (예: arch/11-20/branch-prediction) */
    private static final Pattern JS_FILE_KEY = Pattern.compile("^([a-z]+)/(\\d+-\\d+)/[a-z0-9\\-]+$");

    @Value("${kakao.js-key}")
    private String kakaoJsKey;

    /**
     * 토픽 학습 페이지를 렌더링한다.
     * 토픽 정보, 시각화 JS 파일 키, 연관 토픽 목록을 함께 전달한다.
     * 토픽의 {@code templateName}을 기반으로 Thymeleaf 템플릿을 동적으로 결정한다.
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

        String jsFileKey = visualizerService.getVisualizer(topic.getTopicId()).getJsFileKey();
        Matcher keyMatcher = JS_FILE_KEY.matcher(jsFileKey);
        if(!keyMatcher.matches() || !keyMatcher.group(1).equals(subjectSlug)){
            log.warn("비정상 jsFileKey 감지 - topicId: {}", topic.getTopicId());
            throw new NotFoundException("시각화 정보가 올바르지 않습니다.");
        }
        String assetGroup = keyMatcher.group(2);

        String templateName = topic.getTemplateName();
        if(!templateName.matches("^[a-z0-9\\-]+$")){
            log.warn("비정상 templateName 감지 - topicId: {}", topic.getTopicId());
            throw new NotFoundException("존재하지 않는 페이지입니다.");
        }

        String encodedTopic = URLEncoder.encode(topicSlug, StandardCharsets.UTF_8);
        String canonicalUrl = "https://csflow.kr/" + subjectSlug + "/" + encodedTopic;

        try {
            Map<String, Object> ld = new LinkedHashMap<>();
            ld.put("@context", "https://schema.org");
            ld.put("@type", "LearningResource");
            ld.put("name", topic.getTitle());
            ld.put("description", topic.getMetaDescription());
            ld.put("url", canonicalUrl);
            ld.put("provider", Map.of(
                    "@type", "Organization",
                    "name", "CS Flow",
                    "url", "https://csflow.kr"
            ));
            model.addAttribute("ldJson", objectMapper.writeValueAsString(ld));
        }catch (Exception e){
            log.warn("JSON-LD 직렬화 실패 - topicSlug: {}", topicSlug, e);
        }

        String visitorId = (String) request.getAttribute(VisitorCookieInterceptor.REQUEST_ATTR);
        if (visitorId != null) {
            topicService.recordView(topic.getTopicId(), visitorId);
        }

        model.addAttribute("topic", topic);
        model.addAttribute("jsFileKey", jsFileKey);
        model.addAttribute("relatedTopics", topicService.getRelatedTopics(topic.getTopicId()));
        model.addAttribute("quizQuestions", quizService.getQuestions(topic.getTopicId()));
        model.addAttribute("liked", visitorId != null && topicLikeService.isLiked(topic.getTopicId(), visitorId));
        model.addAttribute("likeCount", topicLikeService.countLikes(topic.getTopicId()));
        model.addAttribute("canonicalUrl", canonicalUrl);
        model.addAttribute("kakaoJsKey", kakaoJsKey);

        return "topics/" + subjectSlug + "/" + assetGroup + "/" + templateName;
    }
}