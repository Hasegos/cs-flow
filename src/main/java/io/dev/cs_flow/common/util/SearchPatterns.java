package io.dev.cs_flow.common.util;

import java.util.Locale;

/**
 * 검색어를 LIKE 패턴으로 바꾸는 유틸.
 * <p>
 * 토픽 검색과 에러 사전 검색이 같은 정규화 규칙(소문자, 공백 제거, 부분 일치)을 쓰도록 한 곳에 둔다.
 * </p>
 */
public final class SearchPatterns {

    private SearchPatterns() {
    }

    /**
     * 메모리 검색용으로 검색어를 소문자 · 공백 제거 형태로 정규화한다.
     *
     * @param query 정규화된 검색어
     * @return 소문자이고 공백이 없는 검색어, null이면 null(조건 없음)
     */
    public static String normalizeQuery(String query) {
        return query == null ? null : query.toLowerCase(Locale.ROOT).replaceAll("\s+", "");
    }

    /**
     * 텍스트를 소문자로 바꾸고 공백(스페이스)을 뺀 값에 정규화된 검색어가 들어 있는지 본다. DB의 LIKE 검색과 같은 규칙이다.
     *
     * @param text            검색 대상 텍스트
     * @param normalizedQuery {@link #normalizeQuery}로 만든 검색어
     * @return 부분 일치하면 true
     */
    public static boolean contains(String text, String normalizedQuery) {
        return text != null && text.toLowerCase(Locale.ROOT).replace(" ", "").contains(normalizedQuery);
    }

    /**
     * 검색어를 소문자·공백 제거 부분 일치 LIKE 패턴으로 바꾼다. LIKE 특수문자는 '!'로 이스케이프한다.
     * 예: "로드밸런서"와 "로드 밸런서"가 같은 패턴이 되어 제목 "로드 밸런서"에 걸린다.
     *
     * @param query 정규화된 검색어, null이면 전체 일치 패턴("%")
     * @return ESCAPE '!'와 함께 쓰는 LIKE 패턴
     */
    public static String toLikePattern(String query) {
        if (query == null) {
            return "%";
        }
        String escaped = query.toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", "")
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
        return "%" + escaped + "%";
    }
}