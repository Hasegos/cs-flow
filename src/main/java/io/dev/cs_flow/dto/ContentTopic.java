package io.dev.cs_flow.dto;

import java.util.List;

/**
 * 콘텐츠 JSON의 토픽 한 건 (`content/{과목}/{slug}.json`).
 * 조회수 · 좋아요 같은 운영 중 값은 콘텐츠가 아니므로 넣지 않는다.
 *
 * @param subject         과목 slug (폴더 이름과 같아야 한다)
 * @param slug            토픽 slug (파일 이름과 같아야 한다)
 * @param title           제목
 * @param templateName    본문 템플릿 이름
 * @param metaDescription 검색 · 공유용 설명, 없으면 null
 * @param published       발행 여부
 * @param order           과목 안 순서 (1부터, 이전 · 다음 토픽과 목록 기본 정렬 기준)
 * @param tags            태그 목록
 * @param visual          시각화 정보(키, 3D 여부), 없으면 null
 * @param interview       면접 질문 목록 (4단계에서 채움, 없으면 null이나 빈 목록)
 * @param quizzes         퀴즈 문항 목록
 */
public record ContentTopic(
        String subject,
        String slug,
        String title,
        String templateName,
        String metaDescription,
        Boolean published,
        Integer order,
        List<String> tags,
        ContentVisual visual,
        List<ContentQuiz> quizzes,
        List<ContentInterview> interview
) {
}