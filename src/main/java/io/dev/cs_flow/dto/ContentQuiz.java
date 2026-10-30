package io.dev.cs_flow.dto;

import java.util.List;

/**
 * 콘텐츠 JSON의 퀴즈 문항 한 건. 토픽 파일의 {@code quizzes}에 들어간다.
 *
 * @param displayOrder  출제 순서 (1부터 빠짐없이)
 * @param prompt        문제
 * @param options       보기 4개 (A, B, C, D 순서)
 * @param correctOption 정답 보기 (A ~ D)
 * @param hint          힌트, 없으면 null
 * @param explanation   해설
 */
public record ContentQuiz(
        Integer displayOrder,
        String prompt,
        List<String> options,
        String correctOption,
        String hint,
        String explanation
) {
}