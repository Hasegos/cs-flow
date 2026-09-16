package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.model.Topic;
import io.dev.cs_flow.repository.TopicRepository;
import io.dev.cs_flow.repository.TopicViewRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
    private final TopicViewRepository topicViewRepository;

    /**
     * 과목 slug와 토픽 slug로 공개된 토픽 단건을 조회한다.
     *
     * @param subjectSlug 과목 영문 식별자
     * @param topicSlug   토픽 영문 식별자
     * @return 공개된 토픽
     * @throws NotFoundException 해당 slug의 공개된 토픽이 없을 경우
     */
    @Cacheable(value = "topic", key = "#subjectSlug + ':' + #topicSlug")
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
    @Cacheable(value = "relatedTopics", key = "#topicId")
    @Transactional(readOnly = true)
    public List<Topic> getRelatedTopics(Long topicId){
        log.info("연관 토픽 목록 조회 - topicId: {}", topicId);
        return topicRepository.findRelatedTopic(topicId);
    }

    /**
     * 과목 slug에 해당하는 공개된 토픽 목록을 페이지 단위로 조회한다.
     * <p>
     * collection fetch join과 Pageable 충돌을 피하기 위해 2단계로 조회한다.
     * 1단계: topicId만 페이징 조회 (DB에서 정확한 LIMIT/OFFSET 적용)
     * 2단계: 해당 ID로 tags 포함 조회 후, 1단계 정렬 순서에 맞춰 재정렬
     * </p>
     *
     * @param subjectSlug 과목 영문 식별자
     * @param page        페이지 번호 (0-based)
     * @param size        페이지 크기
     * @param sort        정렬 기준 ("view"면 조회수 내림차순, "like"면 추천수 내림차순, 그 외는 발행 오름차순)
     * @return 공개된 토픽 Page 객체
     */
    @Transactional(readOnly = true)
    public Page<Topic> getPublishedTopicsPageable(String subjectSlug, int page, int size, String sort){
        log.info("토픽 목록 조회 - subjectSlug: {}, page: {}, size: {}, sort: {}", subjectSlug, page, size, sort);
        Sort order;
        if ("view".equals(sort)) {
            order = Sort.by(
                    Sort.Order.desc("viewCount"),
                    Sort.Order.asc("viewCountUpdatedAt").nullsLast(),
                    Sort.Order.asc("topicId")
            );
        } else if ("like".equals(sort)) {
            order = Sort.by(
                    Sort.Order.desc("likeCount"),
                    Sort.Order.asc("likeCountUpdatedAt").nullsLast(),
                    Sort.Order.asc("topicId")
            );
        } else {
            order = Sort.by("topicId").ascending();
        }
        Pageable pageable = PageRequest.of(page, size, order);

        Page<Long> idPage = topicRepository.findPublishedTopicIdsBySubjectSlug(subjectSlug, pageable);
        List<Topic> topics = topicRepository.findTopicsWithTagsByIds(idPage.getContent());

        Map<Long, Topic> byId = new LinkedHashMap<>();
        topics.forEach(t -> byId.put(t.getTopicId(), t));
        List<Topic> ordered = idPage.getContent().stream().map(byId::get).toList();

        return new PageImpl<>(ordered, pageable, idPage.getTotalElements());
    }

    /**
     * 토픽 조회를 기록한다. 같은 방문자가 오늘 이미 조회했으면 무시한다.
     *
     * @param topicId   기준 토픽 ID
     * @param visitorId 익명 방문자 식별자
     */
    @Transactional
    public void recordView(Long topicId, String visitorId){
        int inserted = topicViewRepository.recordViewIfNew(topicId, visitorId);
        if (inserted > 0) {
            topicRepository.incrementViewCount(topicId);
            log.info("조회수 증가 - topicId: {}", topicId);
        }
    }
}