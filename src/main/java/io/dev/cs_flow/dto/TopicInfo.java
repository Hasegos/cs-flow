package io.dev.cs_flow.dto;

import java.util.List;

/**
 * 화면에 보여 줄 토픽 정보. 콘텐츠 JSON에서 만들고, 목록 화면에서만 조회수 · 추천수를 합친다.
 *
 * @param slug            토픽 영문 식별자
 * @param title           제목
 * @param templateName    본문 템플릿 이름
 * @param metaDescription 검색 · 공유용 설명, 없으면 null
 * @param subject         소속 과목
 * @param tags            태그 목록
 * @param visual          시각화 정보, 없으면 null
 * @param order           과목 안 순서
 * @param seq             전체 순서
 * @param viewCount       조회수 (목록 화면에서만 채워지고 그 외에는 0)
 * @param likeCount       추천수 (목록 화면에서만 채워지고 그 외에는 0)
 */
public record TopicInfo(
        String slug,
        String title,
        String templateName,
        String metaDescription,
        SubjectView subject,
        List<TopicTagView> tags,
        ContentVisual visual,
        int order,
        int seq,
        long viewCount,
        long likeCount
) {

    /**
     * 조회수와 추천수를 채운 사본을 돌려준다.
     *
     * @param view 조회수
     * @param like 추천수
     * @return 숫자가 채워진 사본
     */
    public TopicInfo withCounts(long view, long like) {
        return new TopicInfo(slug, title, templateName, metaDescription, subject, tags, visual, order, seq, view, like);
    }
}