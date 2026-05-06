package io.dev.cs_flow.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(name = "visualizer")
@NoArgsConstructor
public class Visualizer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "visualizer_id")
    private Long visualizerId;

    @OneToOne(fetch =  FetchType.LAZY)
    @JoinColumn(name = "topic_id", nullable = false, unique = true)
    private Topic topic;

    @Column(name = "js_file_key", nullable = false, length = 200)
    private String jsFileKey;
}