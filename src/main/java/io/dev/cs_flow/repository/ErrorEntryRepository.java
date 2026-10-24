package io.dev.cs_flow.repository;

import io.dev.cs_flow.dto.ErrorCategoryCount;
import io.dev.cs_flow.model.ErrorEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * 에러 사전 항목 저장소.
 */
public interface ErrorEntryRepository extends JpaRepository<ErrorEntry, Long> {

    /**
     * 에러 메시지·제목·분류에 검색어가 들어간 항목 ID를 페이지 단위로 조회한다.
     * <p>
     * 비교는 소문자·공백 제거 기준이다. 줄바꿈은 제거하지 않으므로 한 줄 안의 문자열로 검색해야 걸린다.
     * </p>
     *
     * @param category 분류 slug, 전체면 빈 문자열
     * @param pattern  공백을 뺀 소문자 LIKE 패턴('!'로 이스케이프), 조건 없으면 "%"
     * @param pageable 페이지 정보
     * @return 항목 ID Page 객체
     */
    @Query(
            value = """
            SELECT e.errorId FROM ErrorEntry e
            WHERE (:category = '' OR e.category = :category)
              AND (REPLACE(LOWER(e.errorMessage), ' ', '') LIKE :pattern ESCAPE '!'
               OR REPLACE(LOWER(e.title), ' ', '') LIKE :pattern ESCAPE '!'
               OR REPLACE(LOWER(e.category), ' ', '') LIKE :pattern ESCAPE '!')
            """,
            countQuery = """
            SELECT COUNT(e) FROM ErrorEntry e
            WHERE (:category = '' OR e.category = :category)
              AND (REPLACE(LOWER(e.errorMessage), ' ', '') LIKE :pattern ESCAPE '!'
               OR REPLACE(LOWER(e.title), ' ', '') LIKE :pattern ESCAPE '!'
               OR REPLACE(LOWER(e.category), ' ', '') LIKE :pattern ESCAPE '!')
            """
    )
    Page<Long> searchIds(@Param("category") String category, @Param("pattern") String pattern, Pageable pageable);

    /**
     * 분류별 전체 항목 수와 검증된 항목 수를 항목이 많은 분류부터 조회한다.
     *
     * @return 분류별 항목 수 목록, 항목이 없으면 빈 리스트 반환
     */
    @Query("""
            SELECT new io.dev.cs_flow.dto.ErrorCategoryCount(
                e.category, COUNT(e), SUM(CASE WHEN e.verified = true THEN 1L ELSE 0L END))
            FROM ErrorEntry e
            GROUP BY e.category
            ORDER BY COUNT(e) DESC, e.category ASC
            """)
    List<ErrorCategoryCount> countByCategory();

    /**
     * 항목 ID 목록으로 항목을 조회한다. 목록 화면용이라 근거 링크와 관련 개념은 가져오지 않는다.
     *
     * @param ids 조회할 항목 ID 목록
     * @return 항목 목록
     */
    @Query("SELECT e FROM ErrorEntry e WHERE e.errorId IN :ids ORDER BY e.errorId ASC")
    List<ErrorEntry> findAllByIds(@Param("ids") List<Long> ids);

    /**
     * slug로 항목 단건을 근거 링크, 관련 개념(과목 포함)과 함께 조회한다.
     *
     * @param slug 항목 영문 식별자
     * @return 항목 Optional, 없으면 {@code Optional.empty()} 반환
     */
    @Query("""
            SELECT DISTINCT e FROM ErrorEntry e
            LEFT JOIN FETCH e.sources
            LEFT JOIN FETCH e.topics t
            LEFT JOIN FETCH t.subject
            WHERE e.slug = :slug
            """)
    Optional<ErrorEntry> findDetailBySlug(@Param("slug") String slug);

    /**
     * sitemap에 넣을 검증된 항목의 slug를 조회한다.
     *
     * @return 검증된 항목 slug 목록
     */
    @Query("SELECT e.slug FROM ErrorEntry e WHERE e.verified = true ORDER BY e.errorId ASC")
    List<String> findVerifiedSlugs();
}