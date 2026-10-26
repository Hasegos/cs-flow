package io.dev.cs_flow.common.util;

import org.springframework.core.io.ClassPathResource;

/**
 * 링크 미리보기(OG) 카드 이미지의 URL을 구하는 유틸. 이미지는 {@code scripts/gen_og_images.py}가 만든다.
 */
public final class OgImages {

    private static final String SITE_URL = "https://csflow.kr";

    private OgImages() {
    }

    /**
     * 토픽이나 에러 항목의 카드 이미지 URL을 돌려준다.
     *
     * @param group 과목 slug, 에러 사전이면 {@code errors}
     * @param slug  토픽 또는 에러 항목 slug
     * @return 절대 URL, 이미지 파일이 아직 없으면 null (head 조각이 기본 이미지로 대체한다)
     */
    public static String url(String group, String slug) {
        String path = "/img/og/" + group + "/" + slug + ".png";
        return new ClassPathResource("static" + path).exists() ? SITE_URL + path : null;
    }
}