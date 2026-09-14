package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.model.QuizQuestion;
import io.dev.cs_flow.repository.QuizQuestionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 토픽별 퀴즈(QuizQuestion) 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 문항 목록 조회와 정답 판정을 담당한다. 정답({@code correctOption})은
 * {@link #checkAnswer(Long, String)} 내부에서만 사용되며 뷰로 노출되지 않는다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class QuizService {

    private final QuizQuestionRepository quizQuestionRepository;

    /**
     * 토픽 ID에 해당하는 퀴즈 문항 목록을 출제 순서대로 조회한다.
     *
     * @param topicId 기준 토픽 ID
     * @return 출제 순서로 정렬된 문항 목록, 없으면 빈 리스트 반환
     */
    @Transactional(readOnly = true)
    public List<QuizQuestion> getQuestions(Long topicId){
        log.info("퀴즈 문항 목록 조회 - topicId: {}", topicId);
        return quizQuestionRepository.findByTopicIdOrderByDisplayOrder(topicId);
    }

    /**
     * 문항 ID와 선택한 보기를 받아 정답 여부를 판정한다.
     *
     * @param questionId 문항 ID
     * @param selected   선택한 보기 ("A" ~ "D")
     * @return 정답이면 {@code true}
     * @throws NotFoundException 해당 ID의 문항이 없을 경우
     */
    @Transactional(readOnly = true)
    public boolean checkAnswer(Long questionId, String selected){
        QuizQuestion question = quizQuestionRepository.findById(questionId)
                .orElseThrow(() -> new NotFoundException("존재하지 않는 문제입니다. questionId: " + questionId));
        return question.getCorrectOption().equalsIgnoreCase(selected);
    }
}
