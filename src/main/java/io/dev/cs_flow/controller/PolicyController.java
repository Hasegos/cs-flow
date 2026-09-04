package io.dev.cs_flow.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 개인정보처리방침 및 이용약관 등 정적 정책 페이지 요청을 처리하는 컨트롤러.
 */
@Controller
public class PolicyController {

    /**
     * 개인정보처리방침 페이지를 반환한다.
     *
     * @return {@code privacy/privacy} 뷰 이름
     */
    @GetMapping("/privacy")
    public String privacy() {
        return "privacy/privacy";
    }

    /**
     * 이용약관 페이지를 반환한다.
     *
     * @return {@code terms/terms} 뷰 이름
     */
    @GetMapping("/terms")
    public String terms() {
        return "terms/terms";
    }
}