package io.dev.cs_flow.common.util;

import java.util.Map;

/**
 * 에러 사전 분류(slug)를 화면에 보일 이름으로 바꾸는 유틸.
 */
public final class ErrorCategories {

    private static final Map<String, String> LABELS = Map.ofEntries(
            Map.entry("python", "Python"),
            Map.entry("java", "Java"),
            Map.entry("algorithm", "알고리즘"),
            Map.entry("network", "네트워크"),
            Map.entry("git", "Git"),
            Map.entry("web", "웹"),
            Map.entry("ros2", "ROS 2"),
            Map.entry("spring", "Spring Boot"),
            Map.entry("postgresql", "PostgreSQL"),
            Map.entry("sqlite", "SQLite"),
            Map.entry("docker", "Docker"),
            Map.entry("ssh", "SSH")
    );

    private ErrorCategories() {
    }

    /**
     * 분류 slug에 대응하는 표시 이름을 반환한다. 등록되지 않은 분류는 slug를 그대로 돌려준다.
     *
     * @param category 분류 slug
     * @return 표시 이름
     */
    public static String label(String category) {
        return LABELS.getOrDefault(category, category);
    }
}