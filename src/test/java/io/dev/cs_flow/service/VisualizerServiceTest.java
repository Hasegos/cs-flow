package io.dev.cs_flow.service;

import io.dev.cs_flow.common.exception.NotFoundException;
import io.dev.cs_flow.dto.ContentVisual;
import io.dev.cs_flow.dto.SubjectView;
import io.dev.cs_flow.dto.TopicInfo;
import io.dev.cs_flow.dto.TopicViewPath;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class VisualizerServiceTest {

    private TopicViewPath resolve(String jsFileKey, String subject) {
        TopicInfo topic = new TopicInfo("branch-prediction", "분기 예측", "branch-prediction", null,
                new SubjectView("arch", "컴퓨터 구조", "#6c63ff"), List.of(),
                new ContentVisual(jsFileKey, false), 1, 1, 0, 0);
        return new VisualizerService().resolveTopicView(topic, subject);
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