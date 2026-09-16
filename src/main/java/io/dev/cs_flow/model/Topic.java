package io.dev.cs_flow.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Getter
@Table(name = "topic")
@NoArgsConstructor
public class Topic {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "topic_id")
    private Long topicId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subject_id", nullable = false)
    private Subject subject;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "slug", nullable = false, length = 100, unique = true)
    private String slug;

    @Column(name = "template_name", nullable = false, length = 200)
    private String templateName;

    @Column(name = "meta_description", length = 300)
    private String metaDescription;

    @Column(name = "is_published", nullable = false)
    private boolean isPublished = false;

    @Column(name = "view_count", nullable = false)
    private long viewCount = 0;

    @Column(name = "view_count_updated_at")
    private LocalDateTime viewCountUpdatedAt;

    @Column(name = "like_count", nullable = false)
    private long likeCount = 0;

    @Column(name = "like_count_updated_at")
    private LocalDateTime likeCountUpdatedAt;

    @OneToMany(mappedBy = "topic", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<TopicTag> tags = new ArrayList<>();

    @OneToOne(mappedBy = "topic", cascade = CascadeType.ALL, orphanRemoval = true)
    private Visualizer visualizer;
}