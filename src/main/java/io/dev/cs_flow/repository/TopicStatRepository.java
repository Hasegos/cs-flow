package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.TopicStat;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 토픽별 조회수 · 추천수({@link TopicStat})에 대한 데이터 접근 계층.
 * <p>
 * 새 토픽은 행이 없으므로 증가 쿼리는 행이 없으면 만들고 있으면 더하는 upsert로 처리한다.
 * </p>
 */
public interface TopicStatRepository extends JpaRepository<TopicStat, String> {

    /**
     * 토픽의 조회수를 1 증가시키고 그 시각을 기록한다. 행이 없으면 1로 만든다.
     *
     * @param slug 토픽 영문 식별자
     */
    @Modifying
    @Query(value = """
            INSERT INTO topic_stat (slug, view_count, view_count_updated_at, like_count)
            VALUES (:slug, 1, CURRENT_TIMESTAMP, 0)
            ON CONFLICT (slug) DO UPDATE
            SET view_count = topic_stat.view_count + 1, view_count_updated_at = CURRENT_TIMESTAMP
            """, nativeQuery = true)
    void incrementViewCount(@Param("slug") String slug);

    /**
     * 토픽의 추천 수를 1 증가시키고 그 시각을 기록한다. 행이 없으면 1로 만든다.
     *
     * @param slug 토픽 영문 식별자
     */
    @Modifying
    @Query(value = """
            INSERT INTO topic_stat (slug, view_count, like_count, like_count_updated_at)
            VALUES (:slug, 0, 1, CURRENT_TIMESTAMP)
            ON CONFLICT (slug) DO UPDATE
            SET like_count = topic_stat.like_count + 1, like_count_updated_at = CURRENT_TIMESTAMP
            """, nativeQuery = true)
    void incrementLikeCount(@Param("slug") String slug);

    /**
     * 토픽의 추천 수를 1 감소시킨다(0 미만으로는 내려가지 않음).
     *
     * @param slug 토픽 영문 식별자
     */
    @Modifying
    @Query("UPDATE TopicStat s SET s.likeCount = s.likeCount - 1, s.likeCountUpdatedAt = CURRENT_TIMESTAMP WHERE s.slug = :slug AND s.likeCount > 0")
    void decrementLikeCount(@Param("slug") String slug);
}