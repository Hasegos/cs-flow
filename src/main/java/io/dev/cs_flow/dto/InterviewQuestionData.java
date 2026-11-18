package io.dev.cs_flow.dto;

import java.util.List;

/**
 * 브라우저로 내려보내는 면접 질문 한 건.
 * <p>
 * 일정 계산에 쓰는 값(과목, 필수 여부, 난이도, 꼬리 질문)과 화면에 그릴 값(질문, 모범답안, 키워드)을
 * 한 기록에 담는다. 계획은 브라우저에서 계산하므로 두 쪽을 따로 내려보낼 이유가 없다.
 * </p>
 *
 * @param id        질문 영문 식별자
 * @param subject   과목 slug
 * @param topicSlug 토픽 slug (질문을 토픽 화면으로 이어 준다)
 * @param question  질문
 * @param answer    모범답안
 * @param keywords  답에 들어가야 할 말들, 없으면 빈 목록
 * @param followUps 꼬리 질문 식별자 목록, 없으면 빈 목록
 * @param level     난이도
 * @param core      필수 질문인지
 */
public record InterviewQuestionData(
        String id,
        String subject,
        String topicSlug,
        String question,
        String answer,
        List<String> keywords,
        List<String> followUps,
        int level,
        boolean core
) {
}
