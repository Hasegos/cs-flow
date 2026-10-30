package io.dev.cs_flow.dto;

/**
 * 화면에 보여 줄 퀴즈 문항. 정답은 담지 않는다.
 *
 * @param id          문항 ID ({과목}.{slug}.quiz{순서})
 * @param prompt      문제
 * @param optionA     보기 A
 * @param optionB     보기 B
 * @param optionC     보기 C
 * @param optionD     보기 D
 * @param hint        힌트, 없으면 null
 * @param explanation 해설
 */
public record QuizQuestionView(
        String id,
        String prompt,
        String optionA,
        String optionB,
        String optionC,
        String optionD,
        String hint,
        String explanation
) {
}