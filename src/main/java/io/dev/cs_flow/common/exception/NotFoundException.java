package io.dev.cs_flow.common.exception;

/**
 * 요청한 리소스를 찾을 수 없을 때 발생하는 예외.
 * <p>
 * 존재하지 않는 과목, 토픽, 시각화 정보 조회 시 사용된다.
 * HTTP 404 응답에 매핑된다.
 * </p>
 */
public class NotFoundException extends RuntimeException{

    public NotFoundException(String message){
        super(message);
    }
}