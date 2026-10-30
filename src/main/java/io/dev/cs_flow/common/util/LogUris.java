package io.dev.cs_flow.common.util;

/**
 * 요청 경로를 로그에 남기기 전에 민감한 부분을 가리는 유틸.
 */
public final class LogUris {

    /**
     * 인스턴스 생성을 막는다.
     */
    private LogUris() {
    }

    /**
     * 면접 계획 API 경로의 공개 토큰을 가린다. 토큰을 아는 사람은 계획을 조회 · 수정할 수 있다.
     *
     * @param uri 요청 경로
     * @return 토큰 자리를 {@code {token}}으로 바꾼 경로
     */
    public static String mask(String uri) {
        return uri.replaceFirst("^/api/plans/[^/]+", "/api/plans/{token}");
    }
}