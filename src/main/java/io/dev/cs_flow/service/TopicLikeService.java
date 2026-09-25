package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.dto.LikeResult;
import io.dev.cs_flow.model.Topic;
import io.dev.cs_flow.model.TopicLike;
import io.dev.cs_flow.repository.TopicLikeRepository;
import io.dev.cs_flow.repository.TopicRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * 토픽 추천(좋아요) 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 로그인 없이 익명 {@code visitor_id} 기준으로 토픽당 1회만 추천할 수 있으며,
 * 같은 방문자가 다시 요청하면 추천이 취소된다(토글).
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TopicLikeService {

    private final TopicLikeRepository topicLikeRepository;
    private final TopicRepository topicRepository;

    /**
     * 토픽에 대한 방문자의 추천 여부를 조회한다.
     *
     * @param topicId   기준 토픽 ID
     * @param visitorId 익명 방문자 식별자
     * @return 추천했으면 {@code true}
     */
    @Transactional(readOnly = true)
    public boolean isLiked(Long topicId, String visitorId){
        return topicLikeRepository.findByTopic_TopicIdAndVisitorId(topicId, visitorId).isPresent();
    }

    /**
     * 토픽의 추천 수를 조회한다.
     *
     * @param topicId 기준 토픽 ID
     * @return 추천 수
     */
    @Transactional(readOnly = true)
    public long countLikes(Long topicId){
        return topicLikeRepository.countByTopic_TopicId(topicId);
    }

    /**
     * 토픽 추천을 토글한다. 이미 추천한 방문자면 추천을 취소하고,
     * 아니면 새로 추천을 등록한다.
     *
     * @param topicSlug 토픽 영문 식별자
     * @param visitorId 익명 방문자 식별자
     * @return 토글 후 추천 여부와 추천 수
     * @throws NotFoundException 해당 slug의 공개된 토픽이 없을 경우
     */
    @Transactional
    public LikeResult toggleLike(String topicSlug, String visitorId){
        Topic topic = topicRepository.findBySlugAndIsPublishedTrue(topicSlug)
                .orElseThrow(() -> new NotFoundException("존재하지 않는 토픽입니다. slug: " + topicSlug));

        Optional<TopicLike> existing = topicLikeRepository.findByTopic_TopicIdAndVisitorId(topic.getTopicId(), visitorId);

        boolean liked;
        if (existing.isPresent()) {
            topicLikeRepository.delete(existing.get());
            topicRepository.decrementLikeCount(topic.getTopicId());
            liked = false;
            log.info("추천 취소 - topicSlug: {}, visitorId: {}", topicSlug, visitorId);
        } else {
            topicLikeRepository.save(new TopicLike(topic, visitorId, LocalDateTime.now()));
            topicRepository.incrementLikeCount(topic.getTopicId());
            liked = true;
            log.info("추천 등록 - topicSlug: {}, visitorId: {}", topicSlug, visitorId);
        }

        long count = topicLikeRepository.countByTopic_TopicId(topic.getTopicId());
        return new LikeResult(liked, count);
    }
}