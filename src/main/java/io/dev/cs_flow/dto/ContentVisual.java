package io.dev.cs_flow.dto;

/**
 * 콘텐츠 JSON의 토픽 시각화 정보. 토픽 파일의 {@code visual}에 들어간다.
 *
 * @param key   시각화 파일 키 (DB {@code js_file_key} 그대로, 예: arch/1-10/2d/cache-memory)
 * @param has3d 3D 확장 파일이 있는지 (있으면 키의 {@code /2d/}를 {@code /3d/}로 바꾼 경로)
 */
public record ContentVisual(
        String key,
        Boolean has3d
) {
}