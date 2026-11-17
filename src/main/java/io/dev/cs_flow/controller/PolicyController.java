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
        model.addAttribute("pageTitle", "소개 | CS Flow");
        model.addAttribute("pageDescription",
                "CS Flow 를 만든 이유와 만드는 방식. 글로만 읽으면 그려지지 않는 CS 개념을 "
                        + "Canvas 시각화로 직접 돌려 보게 만든다. 본문은 공식 문서 · 논문 · 교재로 확인한 사실만 쓴다.");
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
        model.addAttribute("pageTitle", "개인정보처리방침 | CS Flow");
        model.addAttribute("pageDescription",
                "CS Flow 개인정보처리방침. 수집하는 항목과 보관 기간, 쿠키와 로컬 저장소 사용, "
                        + "구글 애드센스를 포함한 제3자 광고 쿠키, 이용자 권리와 문의 방법을 적는다.");
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
        model.addAttribute("pageTitle", "이용약관 | CS Flow");
        model.addAttribute("pageDescription",
                "CS Flow 이용약관. 서비스 제공 범위와 중단, 콘텐츠 저작권과 인용 기준, "
                        + "이용자가 지켜야 할 것, 책임의 한계와 문의처를 적는다.");
        return "terms/terms";
    }
}