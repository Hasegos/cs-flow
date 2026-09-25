package io.dev.cs_flow.dto;

/**
 * 토픽 학습 페이지를 그리는 데 필요한 리소스 경로.
 *
 * @param jsFileKey 시각화 JS 키 ({과목}/{묶음}/{이름}, 예: arch/11-20/branch-prediction)
 * @param viewName  Thymeleaf 뷰 이름 (topics/{과목}/{묶음}/{templateName})
 */
public record TopicViewPath(String jsFileKey, String viewName) {
}