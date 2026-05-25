package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.model.Topic;
import io.dev.cs_flow.repository.TopicRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 토픽(Topic) 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 과목 slug 기반 토픽 목록 조회, 토픽 단건 조회,
 * 태그 기반 연관 토픽 조회 기능을 제공한다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TopicService {

    private final TopicRepository topicRepository;

    /**
     * 과목 slug와 토픽 slug로 공개된 토픽 단건을 조회한다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @param topicSlug   토픽 영문 식별자
     * @return 공개된 토픽
     * @throws NotFoundException 해당 slug의 공개된 토픽이 없을 경우
     */
    @Transactional(readOnly = true)
    public Topic getPublishedTopic(String subjectSlug, String topicSlug){
        log.info("토픽 단건 조회 - subjectSlug: {}, topicSlug: {}", subjectSlug, topicSlug);
        return topicRepository.findPublishedTopic(subjectSlug, topicSlug)
                .orElseThrow(() -> new NotFoundException(
                        "존재하지않는 토픽입니다. subjectSlug: " + subjectSlug + ", topicSlug: " + topicSlug
                ));
    }

    /**
     * 특정 토픽과 동일한 태그를 가진 연관 토픽 목록을 조회한다.
     *
     * @param topicId 기준 토픽 ID
     * @return 연관 토픽 목록, 없으면 빈 리스트 반환
     */
    @Transactional(readOnly = true)
    public List<Topic> getRelatedTopics(Long topicId){
        log.info("연관 토픽 목록 조회 - topicId: {}", topicId);
        return topicRepository.findRelatedTopic(topicId);
    }

    /**
     * 과목 slug에 해당하는 공개된 토픽 목록을 페이지 단위로 조회한다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @param page        페이지 번호 (0-based)
     * @param size        페이지 크기
     * @return 공개된 토픽 Page 객체
     */
    @Transactional(readOnly = true)
    public Page<Topic> getPublishedTopicsPageable(String subjectSlug, int page, int size){
        log.info("토픽 목록 조회 - subjectSlug: {}, page: {}, size: {}", subjectSlug, page, size);
        Pageable pageable = PageRequest.of(page, size, Sort.by("topicId").ascending());
        return topicRepository.findPublishedTopicsBySubjectSlugPageable(subjectSlug, pageable);
    }
}