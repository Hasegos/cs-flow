package io.dev.cs_flow.controller;

import io.dev.cs_flow.dto.InterviewQuestionData;
import io.dev.cs_flow.service.InterviewDataService;
import io.dev.cs_flow.service.SubjectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import java.time.Duration;
import java.util.List;

/**
 * 면접 대비 계획 페이지 요청을 처리하는 컨트롤러.
 * <p>
 * 일정 계산과 보관은 브라우저가 한다. 계획 조건은 주소 해시와 localStorage에 두고,
 * 답변 기록은 그 기기에만 남는다. 서버는 화면 뼈대와 질문 목록({@code /data/interview.json})만 준다.
 * </p>
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class InterviewController {

    private final SubjectService subjectService;
    private final InterviewDataService interviewDataService;

    /**
     * 면접 대비 계획 페이지를 렌더링한다. 사람마다 내용이 달라 검색엔진 색인에서 제외한다.
     *
     * @param model 뷰에 전달할 데이터 모델
     * @return 면접 대비 계획 페이지 뷰 이름
     */
    @GetMapping("/interview")
    public String interview(Model model) {
        log.info("면접 대비 페이지 요청");
        model.addAttribute("subjects", subjectService.getPublishedSubjects());
        model.addAttribute("currentPage", "interview");
        model.addAttribute("noindex", true);
        model.addAttribute("pageTitle", "면접 대비 계획 | CS Flow");
        model.addAttribute("pageDescription", "면접일까지 매일 풀 CS 면접 질문을 직무와 학습 시간에 맞춰 짜 주는 계획입니다.");
        model.addAttribute("canonicalUrl", "https://csflow.kr/interview");
        model.addAttribute("interviewDataVersion", interviewDataService.version());
        return "interview/interview";
    }

    /**
     * 면접 질문 전체를 JSON으로 돌려준다. 브라우저가 계획을 계산할 때 쓴다.
     * <p>
     * 질문과 모범답안은 토픽 화면에 이미 보이는 공개 콘텐츠다. 다만 검색 결과에 JSON이 뜰 이유는
     * 없으므로 {@code X-Robots-Tag}로 색인을 막는다. 콘텐츠는 배포할 때만 바뀌므로 길게 캐시한다.
     * </p>
     *
     * @return 면접 질문 목록
     */
    @GetMapping(value = "/data/interview.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<InterviewQuestionData>> questions() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic())
                .header("X-Robots-Tag", "noindex")
                .body(interviewDataService.questions());
    }
}