package io.dev.cs_flow.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 콘텐츠 JSON의 에러 사전 항목 한 건 (`content/errors/{slug}.json`).
 *
 * @param slug         항목 slug (파일 이름과 같아야 한다)
 * @param order        목록 순서 (1부터, 기존 error_id 오름차순)
 * @param category     분류
 * @param title        제목
 * @param errorMessage 에러 메시지 원문
 * @param envOs        재현 환경 OS, 없으면 null
 * @param envDistro    재현 환경 배포판, 없으면 null
 * @param envVersion   재현 환경 버전, 없으면 null
 * @param cause        원인, 없으면 null
 * @param solution     해결 방법, 없으면 null
 * @param reproduction 재현 기록, 없으면 null
 * @param createdOn    작성일
 * @param verifiedOn   재현 확인일, 없으면 null
 * @param verified     직접 재현해 검증했는지
 * @param sources      근거 링크 목록
 * @param topics       관련 토픽 slug 목록
 */
public record ContentError(
        String slug,
        Integer order,
        String category,
        String title,
        String errorMessage,
        String envOs,
        String envDistro,
        String envVersion,
        String cause,
        String solution,
        String reproduction,
        LocalDate createdOn,
        LocalDate verifiedOn,
        Boolean verified,
        List<Source> sources,
        List<String> topics
) {

    /**
     * 근거 링크 한 건.
     *
     * @param label 표시 이름
     * @param url   주소
     */
    public record Source(String label, String url) {
    }
}