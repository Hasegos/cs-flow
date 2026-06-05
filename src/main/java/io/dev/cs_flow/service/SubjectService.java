package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.model.Subject;
import io.dev.cs_flow.repository.SubjectRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 과목(Subject) 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 공개된 과목 목록 조회 및 단건 조회 기능을 제공한다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SubjectService {

    private final SubjectRepository subjectRepository;
    private static final String COLOR_ACCENT_PATTERN = "^#[0-9a-fA-F]{3,6}$|^[a-zA-Z]+$";

    /**
     * 공개된 모든 과목 목록을 조회한다.
     *
     * @return 공개된 과목 목록, 없으면 빈 리스트 반환
     */
    @Cacheable("subjects")
    @Transactional(readOnly = true)
    public List<Subject> getPublishedSubjects(){
        log.info("공개된 과목 목록 조회");
        List<Subject> subjects = subjectRepository.findAllByIsPublishedTrue();
        subjects.forEach(s -> {
            if(!s.getColorAccent().matches(COLOR_ACCENT_PATTERN)){
                log.warn("비정상 colorAccent 감지 - slug: {}", s.getSlug());
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
     * @throws NotFoundException 해당 slug의 공개된 과목이 없을 경우
     */
    @Cacheable(value = "subject", key = "#slug")
    @Transactional(readOnly = true)
    public Subject getPublishedSubject(String slug){
        log.info("과목 단건 조회 - slug: {}", slug);
        Subject subject = subjectRepository.findBySlugAndIsPublishedTrue(slug)
                .orElseThrow(() -> new NotFoundException("존재하지 않는 과목입니다. slug: " + slug));

        if(!subject.getColorAccent().matches(COLOR_ACCENT_PATTERN)){
            log.warn("비정상 colorAccent 감지 - slug: {}", slug);
            throw new NotFoundException("과목 정보가 올바르지 않습니다.");
        }

        return subject;
    }
}