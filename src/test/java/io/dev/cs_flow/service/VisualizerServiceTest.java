package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.dto.TopicViewPath;
import io.dev.cs_flow.model.Topic;
import io.dev.cs_flow.model.Visualizer;
import io.dev.cs_flow.repository.VisualizerRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class VisualizerServiceTest {

    private TopicViewPath resolve(String jsFileKey, String subject) {
        Topic topic = mock(Topic.class);
        when(topic.getTopicId()).thenReturn(1L);
        when(topic.getTemplateName()).thenReturn("branch-prediction");
        Visualizer visualizer = mock(Visualizer.class);
        when(visualizer.getJsFileKey()).thenReturn(jsFileKey);
        VisualizerRepository repository = mock(VisualizerRepository.class);
        when(repository.findByTopicId(1L)).thenReturn(Optional.of(visualizer));
        return new VisualizerService(repository).resolveTopicView(topic, subject);
    }

    @Test
    void keyWithoutFolderIsNormalizedTo2d() {
        TopicViewPath path = resolve("arch/11-20/branch-prediction", "arch");
        assertEquals("arch/11-20/2d/branch-prediction", path.jsFileKey());
        assertEquals("topics/arch/11-20/branch-prediction", path.viewName());
    }

    @Test
    void keyWith2dFolderIsKept() {
        assertEquals("arch/11-20/2d/branch-prediction", resolve("arch/11-20/2d/branch-prediction", "arch").jsFileKey());
    }

    @Test
    void otherSubjectOrFolderIsRejected() {
        assertThrows(NotFoundException.class, () -> resolve("os/11-20/branch-prediction", "arch"));
        assertThrows(NotFoundException.class, () -> resolve("arch/11-20/3d/branch-prediction", "arch"));
        assertThrows(NotFoundException.class, () -> resolve("arch/11-20/2d/../branch-prediction", "arch"));
    }
}