package io.dev.cs_flow.common.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BotDetectorTest {

    @Test
    void 봇과_도구_호출은_봇으로_판정한다() {
        assertTrue(BotDetector.isBot(null));
        assertTrue(BotDetector.isBot(""));
        assertTrue(BotDetector.isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"));
        assertTrue(BotDetector.isBot("curl/8.17.0"));
        assertTrue(BotDetector.isBot("python-requests/2.32.0"));
        assertTrue(BotDetector.isBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36"));
    }

    @Test
    void 일반_브라우저는_봇이_아니다() {
        assertFalse(BotDetector.isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"));
        assertFalse(BotDetector.isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0"));
        assertFalse(BotDetector.isBot("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 KAKAOTALK 10.0"));
    }
}