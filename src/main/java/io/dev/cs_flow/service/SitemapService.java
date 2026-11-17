package io.dev.cs_flow.service;

import io.dev.cs_flow.dto.ErrorEntryView;
import io.dev.cs_flow.dto.TopicInfo;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

/**
 * 사이트맵 생성에 필요한 비즈니스 로직을 처리하는 서비스.
 * <p>
 * 콘텐츠 JSON({@link ContentStore})의 공개된 토픽과 검증된 에러 항목으로 sitemap.xml 본문을 만든다.
 * 메모리에 이미 있으므로 따로 캐시하지 않는다.
 * </p>
 */
@Service
@RequiredArgsConstructor
public class SitemapService {

    private static final String BASE_URL = "https://csflow.kr";

    private static final String CHANGE_FREQ_WEEKLY  = "weekly";
    private static final String CHANGE_FREQ_MONTHLY = "monthly";
    private static final String CHANGE_FREQ_YEARLY  = "yearly";

    private static final String SLUG_PATTERN = "^[a-z0-9\\-]+$";

    private final ContentStore contentStore;
    private final ErrorEntryService errorEntryService;

    /**
     * 공개된 모든 토픽 목록을 전체 순서대로 조회한다.
     *
     * @return 공개된 토픽 목록, 없으면 빈 리스트 반환
     */
    public List<TopicInfo> getPublishedTopics() {
        return contentStore.topics();
    }

    /**
     * sitemap.xml 본문을 만든다.
     * <p>
     * 홈, 정적 정책 페이지(개인정보처리방침·이용약관), 공개된 과목 홈 페이지, 공개된 토픽 개별 페이지 URL을 담는다.
     * 에러 사전은 검증된 항목이 있을 때만 목록 페이지, 색인 가능한 분류 페이지, 검증된 항목 URL을 담는다.
     * </p>
     *
     * @return XML 형식의 사이트맵 문자열
     */
    public String buildXml() {
        List<TopicInfo> topics = getPublishedTopics();

        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        sb.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");

        sb.append(url(BASE_URL + "/", newestOf(topics), CHANGE_FREQ_WEEKLY, "1.0"));

        sb.append(url(BASE_URL + "/about",   null, CHANGE_FREQ_YEARLY, "0.5"));
        sb.append(url(BASE_URL + "/guide",   null, CHANGE_FREQ_YEARLY, "0.5"));
        sb.append(url(BASE_URL + "/privacy", null, CHANGE_FREQ_YEARLY, "0.3"));
        sb.append(url(BASE_URL + "/terms",   null, CHANGE_FREQ_YEARLY, "0.3"));

        topics.stream()
                .map(t -> t.subject().slug())
                .distinct()
                .filter(slug -> slug.matches(SLUG_PATTERN))
                .forEach(slug -> sb.append(url(BASE_URL + "/" + slug, subjectUpdatedOn(topics, slug),
                        CHANGE_FREQ_WEEKLY, "0.8")));

        topics.stream()
                .filter(t -> t.subject().slug().matches(SLUG_PATTERN)
                        && t.slug().matches(SLUG_PATTERN))
                .forEach(t -> sb.append(url(
                        BASE_URL + "/" + t.subject().slug() + "/" + t.slug(),
                        t.updatedOn(), CHANGE_FREQ_MONTHLY, "0.7")));

        appendErrorEntries(sb);

        sb.append("</urlset>");
        return sb.toString();
    }

    /**
     * 검증된 에러 사전 URL을 사이트맵에 덧붙인다. 검증된 항목이 없으면 아무것도 덧붙이지 않는다.
     *
     * @param sb 사이트맵 본문
     */
    private void appendErrorEntries(StringBuilder sb) {
        List<ErrorEntryView> entries = errorEntryService.getVerifiedEntries().stream()
                .filter(e -> e.slug().matches(SLUG_PATTERN))
                .toList();
        if (entries.isEmpty()) {
            return;
        }

        sb.append(url(BASE_URL + "/errors", newestErrorOf(entries), CHANGE_FREQ_WEEKLY, "0.6"));

        errorEntryService.getCategories().stream()
                .filter(c -> c.indexable() && c.category().matches(SLUG_PATTERN))
                .forEach(c -> sb.append(url(BASE_URL + "/errors/category/" + c.category(),
                        categoryUpdatedOn(entries, c.category()), CHANGE_FREQ_WEEKLY, "0.6")));

        entries.forEach(e -> sb.append(url(BASE_URL + "/errors/" + e.slug(),
                errorUpdatedOn(e), CHANGE_FREQ_MONTHLY, "0.6")));
    }

    /**
     * 토픽 목록에서 가장 늦게 고친 날을 돌려준다.
     *
     * @param topics 토픽 목록
     * @return 가장 늦은 수정일, 목록이 비면 null
     */
    private LocalDate newestOf(List<TopicInfo> topics) {
        return topics.stream()
                .map(TopicInfo::updatedOn)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }

    /**
     * 한 과목에 속한 토픽 중 가장 늦게 고친 날을 돌려준다.
     *
     * @param topics 공개된 토픽 전체
     * @param slug   과목 slug
     * @return 가장 늦은 수정일, 토픽이 없으면 null
     */
    private LocalDate subjectUpdatedOn(List<TopicInfo> topics, String slug) {
        return topics.stream()
                .filter(t -> t.subject().slug().equals(slug))
                .map(TopicInfo::updatedOn)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }

    /**
     * 에러 항목 목록에서 가장 늦게 고친 날을 돌려준다.
     *
     * @param entries 에러 항목 목록
     * @return 가장 늦은 수정일, 목록이 비면 null
     */
    private LocalDate newestErrorOf(List<ErrorEntryView> entries) {
        return entries.stream()
                .map(SitemapService::errorUpdatedOn)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }

    /**
     * 한 분류에 속한 에러 항목 중 가장 늦게 고친 날을 돌려준다.
     *
     * @param entries  검증된 에러 항목 전체
     * @param category 분류 이름
     * @return 가장 늦은 수정일, 항목이 없으면 null
     */
    private LocalDate categoryUpdatedOn(List<ErrorEntryView> entries, String category) {
        return entries.stream()
                .filter(e -> category.equals(e.category()))
                .map(SitemapService::errorUpdatedOn)
                .max(Comparator.naturalOrder())
                .orElse(null);
    }

    /**
     * 에러 항목의 수정일을 돌려준다. 재현 확인일이 있으면 그것을, 없으면 작성일을 쓴다.
     *
     * @param entry 에러 항목
     * @return 수정일
     */
    private static LocalDate errorUpdatedOn(ErrorEntryView entry) {
        return entry.verifiedOn() == null ? entry.createdOn() : entry.verifiedOn();
    }

    /**
     * 단일 {@code <url>} XML 블록을 만든다.
     *
     * @param loc        페이지 URL
     * @param lastmod    마지막 수정일, 없으면 null (태그를 빼고 만든다)
     * @param changefreq 변경 빈도 (daily / weekly / monthly / yearly 등)
     * @param priority   우선순위 (0.0 ~ 1.0)
     * @return XML 형식의 url 블록 문자열
     */
    private String url(String loc, LocalDate lastmod, String changefreq, String priority) {
        return "<url>"
                + "<loc>" + escapeXml(loc) + "</loc>"
                + (lastmod == null ? "" : "<lastmod>" + lastmod + "</lastmod>")
                + "<changefreq>" + changefreq + "</changefreq>"
                + "<priority>" + priority + "</priority>"
                + "</url>";
    }

    /**
     * XML 특수문자를 이스케이프 처리한다.
     * <p>
     * slug에 예기치 않은 특수문자가 포함될 경우 XML 파싱 오류를 방지한다.
     * </p>
     *
     * @param value 이스케이프할 문자열
     * @return 이스케이프 처리된 문자열
     */
    private String escapeXml(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }
}
