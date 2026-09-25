package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.dto.TopicViewPath;
import io.dev.cs_flow.model.Topic;
import io.dev.cs_flow.repository.VisualizerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 시각화(Visualizer) 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 토픽의 시각화 JS 키({@code jsFileKey})를 검증하고,
 * 그 안의 묶음 폴더(assetGroup)로 토픽 학습 페이지의 뷰 이름을 결정한다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VisualizerService {

    /** 시각화 JS 키 형식: {과목}/{묶음}/{이름} (예: arch/11-20/branch-prediction) */
    private static final Pattern JS_FILE_KEY = Pattern.compile("^([a-z]+)/(\\d+-\\d+)/[a-z0-9\\-]+$");
    private static final String TEMPLATE_NAME = "^[a-z0-9\\-]+$";

    private final VisualizerRepository visualizerRepository;

    /**
     * 토픽의 시각화 JS 키와 학습 페이지 뷰 이름을 결정한다.
     * <p>
     * jsFileKey는 {과목}/{묶음}/{이름} 형식이어야 하고 과목이 요청 과목과 같아야 한다.
     * 뷰 이름은 topics/{과목}/{묶음}/{templateName} 이다.
     * </p>
     *
     * @param topic       대상 토픽
     * @param subjectSlug 요청 URL의 과목 영문 식별자
     * @return JS 키와 뷰 이름
     * @throws NotFoundException 시각화 정보가 없거나 jsFileKey·templateName 형식이 올바르지 않을 경우
     */
    @Cacheable(value = "visualizer", key = "#topic.topicId")
    @Transactional(readOnly = true)
    public TopicViewPath resolveTopicView(Topic topic, String subjectSlug){
        log.info("시각화 경로 조회 - topicId: {}", topic.getTopicId());
        String jsFileKey = visualizerRepository.findByTopicId(topic.getTopicId())
                .orElseThrow(() -> new NotFoundException(
                        "시각화 정보가 존재하지 않습니다. topicId: " + topic.getTopicId()
                ))
                .getJsFileKey();

        Matcher keyMatcher = JS_FILE_KEY.matcher(jsFileKey);
        if (!keyMatcher.matches() || !keyMatcher.group(1).equals(subjectSlug)) {
            log.warn("비정상 jsFileKey 감지 - topicId: {}", topic.getTopicId());
            throw new NotFoundException("시각화 정보가 올바르지 않습니다.");
        }

        String templateName = topic.getTemplateName();
        if (!templateName.matches(TEMPLATE_NAME)) {
            log.warn("비정상 templateName 감지 - topicId: {}", topic.getTopicId());
            throw new NotFoundException("존재하지 않는 페이지입니다.");
        }

        String viewName = "topics/" + subjectSlug + "/" + keyMatcher.group(2) + "/" + templateName;
        return new TopicViewPath(jsFileKey, viewName);
    }
}