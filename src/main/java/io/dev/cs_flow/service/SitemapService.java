package io.dev.cs_flow.service;

import io.dev.cs_flow.dto.TopicInfo;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 사이트맵 생성에 필요한 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 콘텐츠 JSON({@link ContentStore})의 공개된 토픽 목록을 돌려준다. 메모리에 이미 있으므로 따로 캐시하지 않는다.
 * </p>
 */
@Service
@RequiredArgsConstructor
public class SitemapService {

    private final ContentStore contentStore;

    /**
     * 공개된 모든 토픽 목록을 전체 순서대로 조회한다.
     *
     * @return 공개된 토픽 목록, 없으면 빈 리스트 반환
     */
    public List<TopicInfo> getPublishedTopics(){
        return contentStore.topics();
    }
}