package io.dev.cs_flow.dto;

import java.util.List;

/**
 * 콘텐츠 JSON의 토픽 한 건 (`content/{과목}/{묶음}/{slug}.json`).
 * 조회수 · 좋아요 같은 운영 중 값은 콘텐츠가 아니므로 넣지 않는다.
 *
 * @param subject         과목 slug (폴더 이름과 같아야 한다)
 * @param slug            토픽 slug (파일 이름과 같아야 한다)
 * @param title           제목
 * @param templateName    본문 템플릿 이름
 * @param metaDescription 검색 · 공유용 설명, 없으면 null
 * @param published       발행 여부
 * @param order           과목 안 순서 (1부터, 이전 · 다음 토픽과 과목 목록 기본 정렬 기준)
 * @param seq             전체 순서 (1부터, 검색 기본 정렬과 조회수 · 추천수 동점 정렬 기준, 기존 topic_id 순서)
 * @param tags            태그 목록
 * @param roles           관련 직무 목록 (면접 대비 코스용, 지금은 비어 있어도 된다)
 * @param exams           관련 시험 목록 (지금은 비어 있어도 된다)
 * @param visual          시각화 정보(키, 3D 여부), 없으면 null
 * @param quizzes         퀴즈 문항 목록
 * @param interview       면접 질문 목록 (없으면 null이나 빈 목록)
 */
public record ContentTopic(
        String subject,
        String slug,
        String title,
        String templateName,
        String metaDescription,
        Boolean published,
        Integer order,
        Integer seq,
        List<String> tags,
        List<String> roles,
        List<String> exams,
        ContentVisual visual,
        List<ContentQuiz> quizzes,
        List<ContentInterview> interview
) {
}