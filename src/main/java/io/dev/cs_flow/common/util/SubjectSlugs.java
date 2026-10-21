package io.dev.cs_flow.common.util;

/**
 * 과목 페이지 URL에서 허용하는 과목 slug 목록.
 * <p>
 * 과목 홈과 토픽 상세 매핑이 같은 패턴을 쓰도록 한 곳에 둔다. 새 과목을 열 때는 여기에 slug를 추가한다.
 * 목록에 없는 경로는 컨트롤러에 닿지 않아 임의 경로로 DB를 조회하지 않는다.
 * </p>
 */
public final class SubjectSlugs {

    public static final String PATTERN = "arch|os|network|ds|algo|db|robot";

    private SubjectSlugs() {
    }
}