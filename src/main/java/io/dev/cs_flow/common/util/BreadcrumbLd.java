package io.dev.cs_flow.common.util;

import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 화면의 이동 경로(홈 / 과목 / 토픽)를 schema.org BreadcrumbList JSON-LD로 바꾸는 유틸.
 */
@Slf4j
public final class BreadcrumbLd {

    private static final ObjectMapper MAPPER = JsonMapper.builder().build();
    private static final String HOME_URL = "https://csflow.kr/";

    /**
     * 인스턴스 생성을 막는다.
     */
    private BreadcrumbLd() {
    }

    /**
     * 이동 경로 한 칸.
     *
     * @param name 화면에 보이는 이름
     * @param url  절대 URL
     */
    public record Crumb(String name, String url) {
    }

    /**
     * 홈을 맨 앞에 붙여 BreadcrumbList JSON-LD를 만든다. 마지막 칸은 현재 페이지다.
     *
     * @param crumbs 홈 다음부터의 이동 경로, 현재 페이지가 마지막
     * @return JSON-LD 문자열, 직렬화 실패 시 null
     */
    public static String build(List<Crumb> crumbs) {
        List<Crumb> all = new ArrayList<>();
        all.add(new Crumb("홈", HOME_URL));
        all.addAll(crumbs);

        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < all.size(); i++) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("@type", "ListItem");
            item.put("position", i + 1);
            item.put("name", all.get(i).name());
            item.put("item", all.get(i).url());
            items.add(item);
        }

        Map<String, Object> ld = new LinkedHashMap<>();
        ld.put("@context", "https://schema.org");
        ld.put("@type", "BreadcrumbList");
        ld.put("itemListElement", items);
        try {
            return MAPPER.writeValueAsString(ld).replace("<", "\\u003c");
        } catch (Exception e) {
            log.warn("BreadcrumbList JSON-LD 직렬화 실패", e);
            return null;
        }
    }
}