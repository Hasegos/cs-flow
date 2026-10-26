package io.dev.cs_flow.common.util;

import java.util.List;
import java.util.Locale;

/**
 * User-Agent로 봇 요청을 가려내는 유틸. 조회수 집계에서 크롤러와 도구 호출을 빼는 데 쓴다.
 * <p>
 * UA를 속이는 봇은 걸러내지 못한다. 실제 사용자 지표는 Cloudflare Web Analytics가 따로 보여 준다.
 * </p>
 */
public final class BotDetector {

    private static final List<String> BOT_MARKERS = List.of(
            "bot", "crawl", "spider", "slurp", "curl/", "wget", "python-", "java/",
            "headless", "lighthouse", "monitor", "uptime", "preview", "facebookexternalhit"
    );

    private BotDetector() {
    }

    /**
     * User-Agent가 봇이나 도구 호출로 보이는지 판단한다. UA가 없으면 봇으로 본다.
     *
     * @param userAgent User-Agent 헤더 값
     * @return 봇이면 true
     */
    public static boolean isBot(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return true;
        }
        String ua = userAgent.toLowerCase(Locale.ROOT);
        return BOT_MARKERS.stream().anyMatch(ua::contains);
    }
}