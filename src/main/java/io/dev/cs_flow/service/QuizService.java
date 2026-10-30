package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.dto.QuizQuestionView;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 토픽별 퀴즈 관련 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 문항 목록 조회와 정답 판정을 담당한다. 정답은 {@link ContentStore} 안에서만 비교하며 화면용 객체에는 담지 않는다.
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class QuizService {

    private final ContentStore contentStore;

    /**
     * 토픽 slug에 해당하는 퀴즈 문항 목록(정답 제외)을 출제 순서대로 조회한다.
     *
     * @param topicSlug 토픽 영문 식별자
     * @return 출제 순서로 정렬된 문항 목록, 없으면 빈 리스트 반환
     */
    public List<QuizQuestionView> getQuestions(String topicSlug){
        log.info("퀴즈 문항 목록 조회 - topicSlug: {}", topicSlug);
        return contentStore.quizzes(topicSlug);
    }

    /**
     * 문항 ID와 선택한 보기를 받아 정답 여부를 판정한다.
     *
     * @param questionId 문항 ID ({과목}.{slug}.quiz{순서})
     * @param selected   선택한 보기 ("A" ~ "D")
     * @return 정답이면 {@code true}
     * @throws NotFoundException 해당 ID의 문항이 없을 경우
     */
    public boolean checkAnswer(String questionId, String selected){
        String correct = contentStore.correctOption(questionId)
                .orElseThrow(() -> new NotFoundException("존재하지 않는 문제입니다. questionId: " + questionId));
        return correct.equalsIgnoreCase(selected);
    }
}