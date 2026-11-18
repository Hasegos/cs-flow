package io.dev.cs_flow.service;

import io.dev.cs_flow.dto.InterviewQuestionData;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 브라우저가 쓸 면접 질문 데이터를 돌려주는 서비스.
 * <p>
 * 면접 계획은 브라우저에서 계산한다. 그래서 질문 전체를 한 번 내려보내고, 그 뒤로는 서버를 부르지 않는다.
 * 콘텐츠 JSON({@link ContentStore})에서 기동 때 만들어 둔 목록을 그대로 쓴다.
 * </p>
 */
@Service
@RequiredArgsConstructor
public class InterviewDataService {

    private final ContentStore contentStore;

    /**
     * 면접 질문 전체를 돌려준다.
     *
     * @return 면접 질문 목록(수정할 수 없다)
     */
    public List<InterviewQuestionData> questions() {
        return contentStore.interviewData();
    }

    /**
     * 질문 데이터가 바뀌었는지 가리는 값을 돌려준다. 브라우저 캐시를 깨는 데 쓴다.
     * <p>
     * 콘텐츠는 배포할 때만 바뀌므로 질문 수와 마지막 질문 ID면 충분하다.
     * </p>
     *
     * @return 데이터 판 이름
     */
    public String version() {
        List<InterviewQuestionData> all = questions();
        if (all.isEmpty()) {
            return "0";
        }
        return all.size() + "-" + all.get(all.size() - 1).id();
    }
}
