package io.dev.cs_flow.service;

import io.dev.cs_flow.model.Topic;
import io.dev.cs_flow.repository.TopicRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 사이트맵 생성에 필요한 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 공개된 토픽 목록 조회 결과를 캐시하여 sitemap.xml 요청마다 DB를 조회하지 않도록 한다.
 * 토픽 발행 또는 수정 시 {@link #evictCache()}를 호출하여 캐시를 무효화해야 한다.
 * </p>
 */
@Service
@RequiredArgsConstructor
public class SitemapService {

    private final TopicRepository topicRepository;

    /**
     * 공개된 모든 토픽 목록을 조회한다.
     * <p>
     * 결과는 {@code sitemap} 캐시에 저장되며, 캐시가 유효한 동안 DB 조회를 생략한다.
     * </p>
     *
     * @return 공개된 토픽 목록, 없으면 빈 리스트 반환
     */
    @Cacheable("sitemap")
    public List<Topic> getPublishedTopics(){
        return topicRepository.findAllPublished();
    }

    /**
     * 사이트맵 캐시를 무효화한다.
     * <p>
     * 토픽 발행·수정·삭제 시 호출하여 다음 sitemap.xml 요청 시 최신 데이터가 반영되도록 한다.
     * </p>
     */
    @CacheEvict(value = "sitemap", allEntries = true)
    public void evictCache(){}
}