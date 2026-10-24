package io.dev.cs_flow.dto;

import io.dev.cs_flow.common.util.ErrorCategories;

/**
 * 에러 사전 분류와 해당 분류의 항목 수 (목록 분류 칩, 분류 페이지 색인 판단).
 *
 * @param category 분류 slug
 * @param total    전체 항목 수
 * @param verified 검증된 항목 수
 */
public record ErrorCategoryCount(String category, long total, long verified) {

    public static final long MIN_INDEXABLE = 3;

    /**
     * 화면에 보일 분류 이름을 반환한다.
     *
     * @return 표시 이름
     */
    public String label() {
        return ErrorCategories.label(category);
    }

    /**
     * 분류 페이지를 검색엔진에 색인해도 되는지 반환한다.
     *
     * @return 검증된 항목이 {@link #MIN_INDEXABLE}개 이상이면 true
     */
    public boolean indexable() {
        return verified >= MIN_INDEXABLE;
    }
}