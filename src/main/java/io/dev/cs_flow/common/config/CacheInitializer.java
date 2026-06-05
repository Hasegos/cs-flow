package io.dev.cs_flow.common.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.cache.CacheManager;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

/**
 * 애플리케이션 시작 시 전체 캐시를 초기화하는 컴포넌트.
 * <p>
 * 배포(앱 재시작) 시 이전 캐시 데이터가 남아 구버전 데이터가 서빙되는 것을 방지한다.
 * {@link ApplicationReadyEvent} 시점에 실행되어 등록된 모든 캐시를 일괄 초기화한다.
 * </p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CacheInitializer implements ApplicationListener<ApplicationReadyEvent> {

    private final CacheManager cacheManager;

    /**
     * 애플리케이션이 완전히 기동된 후 전체 캐시를 초기화한다.
     *
     * @param event 애플리케이션 준비 완료 이벤트
     */
    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        cacheManager.getCacheNames()
                .forEach(name -> {
                    cacheManager.getCache(name).clear();
                    log.info("캐시 초기화 - {}", name);
                });
    }
}