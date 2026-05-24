package io.dev.cs_flow.controller;

import io.dev.cs_flow.model.Topic;
import io.dev.cs_flow.service.SitemapService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.List;

/**
 * 사이트맵 요청을 처리하는 컨트롤러.
 * <p>
 * Google Search Console 등 검색 엔진에 제출할 sitemap.xml을 동적으로 생성한다.
 * 공개된 토픽 목록을 기반으로 과목 홈 페이지와 토픽 개별 페이지 URL을 포함한다.
 * </p>
 */
@Controller
@RequiredArgsConstructor
public class SitemapController {

    private static final String CHANGE_FREQ_WEEKLY = "weekly";
    private static final String CHANGE_FREQ_MONTHLY = "monthly";

    @Value("${app.base-url}")
    private String baseUrl;

    private final SitemapService sitemapService;

    /**
     * sitemap.xml을 생성하여 반환한다.
     * <p>
     * 홈, 공개된 과목 홈 페이지, 공개된 토픽 개별 페이지 URL을 포함한다.
     * 토픽 목록은 {@link SitemapService}를 통해 캐시된 데이터를 사용한다.
     * </p>
     *
     * @return XML 형식의 사이트맵 문자열
     */
    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    @ResponseBody
    public String sitemap() {
        List<Topic> topics = sitemapService.getPublishedTopics();

        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        sb.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");

        sb.append(url(baseUrl + "/", CHANGE_FREQ_WEEKLY, "1.0"));

        topics.stream()
                .map(t -> t.getSubject().getSlug())
                .distinct()
                .forEach(slug -> sb.append(url(baseUrl + "/" + slug, CHANGE_FREQ_WEEKLY, "0.8")));

        topics.forEach(t -> sb.append(url(
                baseUrl + "/" + t.getSubject().getSlug() + "/" + t.getSlug(),
                CHANGE_FREQ_MONTHLY, "0.7")));

        sb.append("</urlset>");
        return sb.toString();
    }

    /**
     * 단일 {@code <url>} XML 블록을 생성한다.
     *
     * @param loc        페이지 URL
     * @param changefreq 변경 빈도 (daily / weekly / monthly 등)
     * @param priority   우선순위 (0.0 ~ 1.0)
     * @return XML 형식의 url 블록 문자열
     */
    private String url(String loc, String changefreq, String priority) {
        return "<url>"
                + "<loc>" + escapeXml(loc) + "</loc>"
                + "<changefreq>" + changefreq + "</changefreq>"
                + "<priority>" + priority + "</priority>"
                + "</url>";
    }

    /**
     * XML 특수문자를 이스케이프 처리한다.
     * <p>
     * slug에 예기치 않은 특수문자가 포함될 경우 XML 파싱 오류를 방지한다.
     * </p>
     *
     * @param value 이스케이프할 문자열
     * @return 이스케이프 처리된 문자열
     */
    private String escapeXml(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }
}