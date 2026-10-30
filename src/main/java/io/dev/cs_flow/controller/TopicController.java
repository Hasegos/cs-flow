package io.dev.cs_flow.controller;

import io.dev.cs_flow.common.interceptor.VisitorCookieInterceptor;
import io.dev.cs_flow.common.util.BotDetector;
import io.dev.cs_flow.common.util.BreadcrumbLd;
import io.dev.cs_flow.common.util.OgImages;
import io.dev.cs_flow.common.util.SubjectSlugs;
import io.dev.cs_flow.dto.TopicInfo;
import io.dev.cs_flow.dto.TopicViewPath;
import io.dev.cs_flow.service.ErrorEntryService;
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
import java.util.List;

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
    private final ErrorEntryService errorEntryService;

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
    @GetMapping("/{subjectSlug:" + SubjectSlugs.PATTERN + "}/{topicSlug:[a-z0-9\\-]+}")
    public String topicDetail(@PathVariable String subjectSlug,
                              @PathVariable String topicSlug,
                              HttpServletRequest request,
                              Model model){
        log.info("토픽 상세 페이지 요청 - subjectSlug: {}, topicSlug: {}", subjectSlug, topicSlug);

        TopicInfo topic = topicService.getPublishedTopic(subjectSlug, topicSlug);
        TopicViewPath viewPath = visualizerService.resolveTopicView(topic, subjectSlug);

        String encodedTopic = URLEncoder.encode(topicSlug, StandardCharsets.UTF_8);
        String canonicalUrl = "https://csflow.kr/" + subjectSlug + "/" + encodedTopic;

        Long topicId = topicService.getTopicId(topicSlug);
        String visitorId = (String) request.getAttribute(VisitorCookieInterceptor.REQUEST_ATTR);
        if (topicId != null && visitorId != null && !BotDetector.isBot(request.getHeader("User-Agent"))) {
            topicService.recordView(topicId, visitorId);
        }

        model.addAttribute("topic", topic);
        model.addAttribute("currentSubject", subjectSlug);
        model.addAttribute("jsFileKey", viewPath.jsFileKey());
        model.addAttribute("ldJson", topicService.buildLdJson(topic, canonicalUrl));
        model.addAttribute("breadcrumbLd", BreadcrumbLd.build(List.of(
                new BreadcrumbLd.Crumb(topic.subject().name(), "https://csflow.kr/" + subjectSlug),
                new BreadcrumbLd.Crumb(topic.title(), canonicalUrl))));
        model.addAttribute("ogImage", OgImages.url(subjectSlug, topicSlug));
        model.addAttribute("prevTopic", topicService.getPrevTopic(topic));
        model.addAttribute("nextTopic", topicService.getNextTopic(topic));
        model.addAttribute("relatedTopics", topicService.getRelatedTopics(topic));
        model.addAttribute("topicErrors", errorEntryService.getVerifiedByTopic(subjectSlug, topicSlug));
        model.addAttribute("quizQuestions", quizService.getQuestions(topicSlug));
        model.addAttribute("liked", topicId != null && visitorId != null && topicLikeService.isLiked(topicId, visitorId));
        model.addAttribute("likeCount", topicId == null ? 0 : topicLikeService.countLikes(topicId));
        model.addAttribute("canonicalUrl", canonicalUrl);
        model.addAttribute("kakaoJsKey", kakaoJsKey);

        return viewPath.viewName();
    }
}