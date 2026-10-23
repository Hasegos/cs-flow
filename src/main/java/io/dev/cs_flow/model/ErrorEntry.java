package io.dev.cs_flow.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.Set;

@Entity
@Getter
@Table(name = "error_entry")
@NoArgsConstructor
public class ErrorEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "error_id")
    private Long errorId;

    @Column(name = "slug", nullable = false, length = 100, unique = true)
    private String slug;

    @Column(name = "category", nullable = false, length = 50)
    private String category;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "error_message", nullable = false, columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "env_os", length = 100)
    private String envOs;

    @Column(name = "env_distro", length = 100)
    private String envDistro;

    @Column(name = "env_version", length = 100)
    private String envVersion;

    @Column(name = "cause", columnDefinition = "TEXT")
    private String cause;

    @Column(name = "solution", columnDefinition = "TEXT")
    private String solution;

    @Column(name = "reproduction", columnDefinition = "TEXT")
    private String reproduction;

    @Column(name = "created_on", nullable = false)
    private LocalDate createdOn;

    @Column(name = "verified_on")
    private LocalDate verifiedOn;

    @Column(name = "is_verified", nullable = false)
    private boolean verified = false;

    @OneToMany(mappedBy = "errorEntry", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("errorSourceId ASC")
    private Set<ErrorEntrySource> sources = new LinkedHashSet<>();

    @ManyToMany
    @JoinTable(name = "error_entry_topic",
            joinColumns = @JoinColumn(name = "error_id"),
            inverseJoinColumns = @JoinColumn(name = "topic_id"))
    @OrderBy("topicId ASC")
    private Set<Topic> topics = new LinkedHashSet<>();
}