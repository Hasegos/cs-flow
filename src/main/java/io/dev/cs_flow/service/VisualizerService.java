package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.dto.TopicInfo;
import io.dev.cs_flow.dto.TopicViewPath;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 시각화 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 토픽의 시각화 JS 키({@code visual.key})를 검증하고,
 * 그 안의 묶음 폴더(assetGroup)로 토픽 학습 페이지의 뷰 이름을 결정한다.
 * </p>
 */
@Slf4j
@Service
public class VisualizerService {

    /** 시각화 JS 키 형식: {과목}/{묶음}/{이름} 또는 {과목}/{묶음}/2d/{이름} (예: arch/11-20/2d/branch-prediction) */
    private static final Pattern JS_FILE_KEY = Pattern.compile("^([a-z]+)/(\\d+-\\d+)/(?:2d/)?([a-z0-9\\-]+)$");
    private static final String TEMPLATE_NAME = "^[a-z0-9\\-]+$";

    /**
     * 토픽의 시각화 JS 키와 학습 페이지 뷰 이름을 결정한다.
     * <p>
     * 키는 {과목}/{묶음}/{이름} 형식이어야 하고 과목이 요청 과목과 같아야 한다.
     * 2D 파일은 {과목}/{묶음}/2d/ 폴더에 있으므로, 키에 2d/가 없어도 있는 것으로 보정해 돌려준다.
     * 뷰 이름은 topics/{과목}/{묶음}/{templateName} 이다.
     * </p>
     *
     * @param topic       대상 토픽
     * @param subjectSlug 요청 URL의 과목 영문 식별자
     * @return JS 키와 뷰 이름
     * @throws NotFoundException 시각화 정보가 없거나 키 · templateName 형식이 올바르지 않을 경우
     */
    public TopicViewPath resolveTopicView(TopicInfo topic, String subjectSlug){
        log.info("시각화 경로 조회 - topicSlug: {}", topic.slug());
        if (topic.visual() == null || topic.visual().key() == null) {
            throw new NotFoundException("시각화 정보가 존재하지 않습니다. topicSlug: " + topic.slug());
        }
        String jsFileKey = topic.visual().key();

        Matcher keyMatcher = JS_FILE_KEY.matcher(jsFileKey);
        if (!keyMatcher.matches() || !keyMatcher.group(1).equals(subjectSlug)) {
            log.warn("비정상 시각화 키 감지 - topicSlug: {}", topic.slug());
            throw new NotFoundException("시각화 정보가 올바르지 않습니다.");
        }

        String templateName = topic.templateName();
        if (!templateName.matches(TEMPLATE_NAME)) {
            log.warn("비정상 templateName 감지 - topicSlug: {}", topic.slug());
            throw new NotFoundException("존재하지 않는 페이지입니다.");
        }

        String viewName = "topics/" + subjectSlug + "/" + keyMatcher.group(2) + "/" + templateName;
        String assetKey = keyMatcher.group(1) + "/" + keyMatcher.group(2) + "/2d/" + keyMatcher.group(3);
        return new TopicViewPath(assetKey, viewName);
    }
}