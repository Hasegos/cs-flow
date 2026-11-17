package io.dev.cs_flow.controller;

import io.dev.cs_flow.service.SitemapService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * 사이트맵 요청을 처리하는 컨트롤러.
 * <p>
 * Google Search Console 등 검색 엔진에 제출할 sitemap.xml을 동적으로 생성한다.
 * 본문은 {@link SitemapService}가 만들고 컨트롤러는 응답만 맡는다.
 * </p>
 */
@Controller
@RequiredArgsConstructor
public class SitemapController {

    private final SitemapService sitemapService;

    /**
     * sitemap.xml을 생성하여 반환한다.
     *
     * @return XML 형식의 사이트맵 문자열
     */
    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    @ResponseBody
    public String sitemap() {
        return sitemapService.buildXml();
    }
}
