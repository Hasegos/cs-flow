package io.dev.cs_flow.common.config;

import io.dev.cs_flow.common.interceptor.AccessLogInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Spring MVC 공통 설정 클래스.
 * <p>
 * 인터셉터 등록 등 웹 계층 전반에 적용되는 설정을 관리한다.
 * </p>
 */
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final AccessLogInterceptor accessLogInterceptor;

    /**
     * 인터셉터를 등록한다.
     * <p>
     * {@link AccessLogInterceptor}를 전체 경로에 적용하되,
     * Actuator 및 정적 리소스 경로는 불필요한 로그 생성을 방지하기 위해 제외한다.
     * </p>
     *
     * @param registry 인터셉터 등록 레지스트리
     */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
       registry.addInterceptor(accessLogInterceptor)
               .addPathPatterns("/**")
               .excludePathPatterns(
                       "/actuator/**",
                       "/css/**",
                       "/js/**",
                       "/img/**"
               );
    }
}