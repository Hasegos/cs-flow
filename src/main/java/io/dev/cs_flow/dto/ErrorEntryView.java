package io.dev.cs_flow.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 화면에 보여 줄 에러 사전 항목. 콘텐츠 JSON에서 만들고, 관련 토픽 slug는 토픽 정보로 바꿔 담는다.
 *
 * @param slug         항목 영문 식별자
 * @param order        목록 순서
 * @param category     분류
 * @param title        제목
 * @param errorMessage 에러 메시지 원문
 * @param envOs        재현 환경 OS, 없으면 null
 * @param envDistro    재현 환경 배포판, 없으면 null
 * @param envVersion   재현 환경 버전, 없으면 null
 * @param cause        원인, 없으면 null
 * @param solution     해결 방법, 없으면 null
 * @param reproduction 재현 기록, 없으면 null
 * @param createdOn    작성일
 * @param verifiedOn   재현 확인일, 없으면 null
 * @param verified     직접 재현해 검증했는지
 * @param sources      근거 링크 목록
 * @param topics       관련 토픽 목록 (공개된 토픽만)
 */
public record ErrorEntryView(
        String slug,
        int order,
        String category,
        String title,
        String errorMessage,
        String envOs,
        String envDistro,
        String envVersion,
        String cause,
        String solution,
        String reproduction,
        LocalDate createdOn,
        LocalDate verifiedOn,
        boolean verified,
        List<ContentError.Source> sources,
        List<TopicInfo> topics
) {
}