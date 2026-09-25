package io.dev.cs_flow.common.util;

import java.util.*;

/**
 * 페이지네이션에 표시할 페이지 번호 목록을 만드는 유틸리티.
 */
public final class PageRangeUtil {

    private PageRangeUtil() {
    }

    /**
     * 페이지네이션에 표시할 페이지 번호 목록을 생성한다.
     * -1은 생략 구분자(…)를 의미한다.
     *
     * 규칙:
     * - 첫 페이지(0)와 마지막 페이지는 항상 포함
     * - 현재 페이지 ±2 범위 포함
     * - gap == 2이면 중간 페이지 직접 삽입 (1 ... 3 대신 1 2 3)
     * - gap > 2이면 -1(…) 삽입
     *
     * @param currentPage 현재 페이지 (0-based)
     * @param totalPages  전체 페이지 수
     * @return 표시할 페이지 번호 목록, 페이지가 1개 이하면 빈 리스트
     */
    public static List<Integer> build(int currentPage, int totalPages){
        if (totalPages <= 1){
            return Collections.emptyList();
        }

        Set<Integer> pageSet = new LinkedHashSet<>();
        pageSet.add(0);
        for(int i = Math.max(0, currentPage - 2); i <= Math.min(totalPages - 1, currentPage + 2); i++){
            pageSet.add(i);
        }
        pageSet.add(totalPages - 1);

        List<Integer> sorted = new ArrayList<>(pageSet);
        Collections.sort(sorted);

        List<Integer> result = new ArrayList<>();
        int prev = -2;
        for (int p : sorted) {
            if (prev >= 0) {
                int gap = p - prev;
                if (gap == 2) {
                    result.add(prev + 1);
                } else if (gap > 2) {
                    result.add(-1);
                }
            }
            result.add(p);
            prev = p;
        }
        return result;
    }
}