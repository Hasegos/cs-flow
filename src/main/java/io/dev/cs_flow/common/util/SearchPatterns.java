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