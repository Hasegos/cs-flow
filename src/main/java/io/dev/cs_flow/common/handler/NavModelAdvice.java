package io.dev.cs_flow.common.handler;

import io.dev.cs_flow.dto.SubjectView;
import io.dev.cs_flow.service.SubjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

import java.util.List;

/**
 * 모든 화면이 쓰는 내비게이션 데이터를 모델에 넣는다.
 * <p>
 * 헤더 메뉴와 모바일 하단 탭의 과목 시트가 같은 목록을 쓴다.
 * 콘텐츠는 메모리 저장소에 있어 DB를 조회하지 않는다.
 * </p>
 */
@ControllerAdvice(basePackages = "io.dev.cs_flow.controller")
@RequiredArgsConstructor
public class NavModelAdvice {

    private final SubjectService subjectService;

    /**
     * 공개된 과목 목록을 돌려준다.
     *
     * @return 과목 목록, 없으면 빈 리스트 반환
     */
    @ModelAttribute("navSubjects")
    public List<SubjectView> navSubjects() {
        return subjectService.getPublishedSubjects();
    }
}
