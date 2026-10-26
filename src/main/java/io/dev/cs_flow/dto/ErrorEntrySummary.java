package io.dev.cs_flow.dto;

/**
 * 토픽 페이지에 보여 줄 에러 사전 항목 요약.
 *
 * @param slug         항목 영문 식별자
 * @param title        항목 제목
 * @param errorMessage 에러 메시지 원문
 */
public record ErrorEntrySummary(String slug, String title, String errorMessage) {
}