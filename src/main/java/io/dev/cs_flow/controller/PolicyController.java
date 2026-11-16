package io.dev.cs_flow.controller;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 소개, 이용 가이드, 개인정보처리방침, 이용약관 등 정적 안내 페이지 요청을 처리하는 컨트롤러.
 */
@Controller
public class PolicyController {

    /**
     * 사이트 소개 및 문의 페이지를 반환한다.
     *
     * @param model 뷰에 전달할 데이터 모델
     * @return {@code about/about} 뷰 이름
     */
    @GetMapping("/about")
    public String about(Model model) {
        model.addAttribute("canonicalUrl", "https://csflow.kr/about");
        return "about/about";
    }

    /**
     * 사이트 이용 가이드 페이지를 반환한다.
     *
     * @param model 뷰에 전달할 데이터 모델
     * @return {@code guide/guide} 뷰 이름
     */
    @GetMapping("/guide")
    public String guide(Model model) {
        model.addAttribute("canonicalUrl", "https://csflow.kr/guide");
        model.addAttribute("pageTitle", "이용 가이드 | CS Flow");
        model.addAttribute("pageDescription",
                "CS Flow 사용법. 토픽 화면 구성, 시각화 조작과 키보드 단축키, 3D 보기, 학습 기록과 목차 · 검색을 안내합니다.");
        return "guide/guide";
    }

    /**
     * 개인정보처리방침 페이지를 반환한다.
     *
     * @param model 뷰에 전달할 데이터 모델
     * @return {@code privacy/privacy} 뷰 이름
     */
    @GetMapping("/privacy")
    public String privacy(Model model) {
        model.addAttribute("canonicalUrl", "https://csflow.kr/privacy");
        return "privacy/privacy";
    }

    /**
     * 이용약관 페이지를 반환한다.
     *
     * @param model 뷰에 전달할 데이터 모델
     * @return {@code terms/terms} 뷰 이름
     */
    @GetMapping("/terms")
    public String terms(Model model) {
        model.addAttribute("canonicalUrl", "https://csflow.kr/terms");
        return "terms/terms";
    }
}