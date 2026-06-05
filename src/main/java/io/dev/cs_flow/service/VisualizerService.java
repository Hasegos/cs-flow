package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.model.Visualizer;
import io.dev.cs_flow.repository.VisualizerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 시각화(Visualizer) 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 토픽 ID 기반으로 시각화 정보를 조회하며,
 * 조회된 {@code jsFileKey}는 프론트엔드에서 JS 파일 로드에 사용된다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VisualizerService {

    private final VisualizerRepository visualizerRepository;

    /**
     * 토픽 ID에 해당하는 시각화 정보를 조회한다.
     *
     * @param topicId 조회할 토픽 ID
     * @return 시각화 정보
     * @throws NotFoundException 해당 토픽의 시각화 정보가 없을 경우
     */
    @Cacheable(value = "visualizer", key = "#topicId")
    @Transactional(readOnly = true)
    public Visualizer getVisualizer (Long topicId){
        log.info("시각화 정보 조회 - topicId: {}", topicId);
        return visualizerRepository.findByTopicId(topicId)
                .orElseThrow(() -> new NotFoundException(
                        "시각화 정보가 존재하지 않습니다. topicId: " + topicId
                ));
    }
}