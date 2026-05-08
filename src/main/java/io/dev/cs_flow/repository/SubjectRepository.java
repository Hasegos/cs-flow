package io.dev.cs_flow.repository;

import io.dev.cs_flow.model.Subject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 과목(Subject) 엔티티에 대한 데이터 접근 계층.
 * <p>
 * 공개된 과목만 조회하는 메서드를 제공하며,
 * 비공개 과목({@code isPublished = false})은 모든 쿼리에서 제외된다.
 * </p>
 */
public interface SubjectRepository extends JpaRepository<Subject, Long> {

    /**
     * 공개된 모든 과목을 조회한다.
     *
     * @return {@code isPublished = true}인 과목 목록, 없으면 빈 리스트 반환
     */
    List<Subject> findAllByIsPublishedTrue();

    /**
     * slug와 공개 여부로 과목 단건을 조회한다.
     *
     * @param slug 과목 영문 식별자 (URL 경로에 사용)
     * @return 공개된 과목 Optional, 없으면 {@code Optional.empty()} 반환
     */
    Optional<Subject> findBySlugAndIsPublishedTrue(String slug);
}