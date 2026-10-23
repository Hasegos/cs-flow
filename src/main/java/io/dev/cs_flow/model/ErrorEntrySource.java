package io.dev.cs_flow.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(name = "error_entry_source")
@NoArgsConstructor
public class ErrorEntrySource {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "error_source_id")
    private Long errorSourceId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "error_id", nullable = false)
    private ErrorEntry errorEntry;

    @Column(name = "label", nullable = false, length = 200)
    private String label;

    @Column(name = "url", nullable = false, length = 500)
    private String url;
}