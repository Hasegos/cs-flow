package io.dev.cs_flow.dto;

/**
 * 토픽 목록 검색 조건.
 * <p>
 * 생성 시점에 입력값을 정규화한다: 앞뒤 공백 제거, 빈 값은 null(조건 없음), 최대 {@value #MAX_LENGTH}자로 자름.
 * 따라서 이 record를 받는 쪽은 이미 정리된 값만 다룬다.
 * </p>
 *
 * @param query 제목·태그 검색어, 없으면 null
 * @param tag   태그 필터, 없으면 null
 */
public record TopicSearchCondition(String query, String tag) {

    public static final int MAX_LENGTH = 50;

    public TopicSearchCondition {
        query = normalize(query);
        tag = normalize(tag);
    }

    /**
     * 검색어 또는 태그 조건이 하나라도 있는지 여부.
     *
     * @return 조건이 있으면 true
     */
    public boolean isFiltered() {
        return query != null || tag != null;
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.strip();
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed.length() > MAX_LENGTH ? trimmed.substring(0, MAX_LENGTH) : trimmed;
    }
}