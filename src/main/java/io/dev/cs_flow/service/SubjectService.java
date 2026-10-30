package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.dto.SubjectView;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 과목 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 콘텐츠 JSON({@link ContentStore})의 공개된 과목 목록 조회 및 단건 조회 기능을 제공한다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SubjectService {

    private static final String COLOR_ACCENT_PATTERN = "^#[0-9a-fA-F]{3,6}$|^[a-zA-Z]+$";

    private final ContentStore contentStore;

    /**
     * 공개된 모든 과목 목록을 과목 순서대로 조회한다.
     *
     * @return 공개된 과목 목록, 없으면 빈 리스트 반환
     * @throws NotFoundException 강조 색상 형식이 올바르지 않은 과목이 있을 경우
     */
    public List<SubjectView> getPublishedSubjects(){
        log.info("공개된 과목 목록 조회");
        List<SubjectView> subjects = contentStore.subjects();
        subjects.forEach(s -> {
            if(!s.colorAccent().matches(COLOR_ACCENT_PATTERN)){
                log.warn("비정상 colorAccent 감지 - slug: {}", s.slug());
                throw new NotFoundException("과목 정보가 올바르지 않습니다.");
            }
        });

        return subjects;
    }

    /**
     * slug로 공개된 과목 단건을 조회한다.
     *
     * @param slug 과목 영문 식별자
     * @return 공개된 과목
     * @throws NotFoundException 해당 slug의 공개된 과목이 없거나 강조 색상 형식이 올바르지 않을 경우
     */
    public SubjectView getPublishedSubject(String slug){
        log.info("과목 단건 조회 - slug: {}", slug);
        SubjectView subject = contentStore.subject(slug)
                .orElseThrow(() -> new NotFoundException("존재하지 않는 과목입니다. slug: " + slug));

        if(!subject.colorAccent().matches(COLOR_ACCENT_PATTERN)){
            log.warn("비정상 colorAccent 감지 - slug: {}", slug);
            throw new NotFoundException("과목 정보가 올바르지 않습니다.");
        }

        return subject;
    }
}