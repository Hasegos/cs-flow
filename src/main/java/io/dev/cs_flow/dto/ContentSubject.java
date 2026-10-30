package io.dev.cs_flow.dto;

/**
 * 콘텐츠 JSON의 과목 한 건 (`content/subjects.json`).
 *
 * @param slug        과목 주소 이름 (예: arch)
 * @param name        과목 표시 이름
 * @param colorAccent 강조 색상
 * @param published   발행 여부
 * @param order       과목 표시 순서 (1부터)
 */
public record ContentSubject(
        String slug,
        String name,
        String colorAccent,
        Boolean published,
        Integer order
) {
}