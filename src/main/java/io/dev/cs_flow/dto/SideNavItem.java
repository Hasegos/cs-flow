package io.dev.cs_flow.dto;

/**
 * 왼쪽 목차 한 줄. 과목의 토픽 목록과 에러 사전의 분류 목록이 같은 조각을 쓴다.
 *
 * @param key      목록에서 이 줄을 가리키는 값 (토픽은 slug, 분류는 분류 slug). 학습 상태를 붙일 때 쓴다
 * @param href     이동할 주소
 * @param label    화면에 보일 이름
 * @param num      앞에 붙일 번호, 번호가 없는 목록이면 null
 * @param count    뒤에 붙일 개수, 개수를 쓰지 않는 목록이면 null
 * @param active   지금 보고 있는 줄이면 true
 * @param nofollow 검색엔진이 따라가지 않아야 하는 주소면 true
 */
public record SideNavItem(
        String key,
        String href,
        String label,
        String num,
        Long count,
        boolean active,
        boolean nofollow
) {

    /**
     * 번호를 붙이는 목록(과목 토픽)의 한 줄을 만든다.
     *
     * @param key    토픽 slug
     * @param href   토픽 주소
     * @param label  토픽 제목
     * @param order  과목 안 순번 (1부터)
     * @param active 지금 보고 있는 토픽이면 true
     * @return 목차 한 줄
     */
    public static SideNavItem numbered(String key, String href, String label, int order, boolean active) {
        return new SideNavItem(key, href, label, String.format("%02d", order), null, active, false);
    }

    /**
     * 개수를 붙이는 목록(에러 분류)의 한 줄을 만든다.
     *
     * @param key      분류 slug
     * @param href     분류 주소
     * @param label    분류 이름
     * @param count    항목 수
     * @param active   지금 보고 있는 분류면 true
     * @param nofollow 색인하지 않는 분류면 true
     * @return 목차 한 줄
     */
    public static SideNavItem counted(String key, String href, String label, long count, boolean active, boolean nofollow) {
        return new SideNavItem(key, href, label, null, count, active, nofollow);
    }
}
