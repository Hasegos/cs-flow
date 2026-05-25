package io.dev.cs_flow.common.handler;

import io.dev.cs_flow.common.exception.NotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * 애플리케이션 전역 예외를 처리하는 핸들러.
 * <p>
 * 예외 종류에 따라 로그 레벨을 구분하여 기록하고,
 * 사용자에게는 단일 에러 페이지({@code error.html})를 렌더링한다.
 * </p>
 */
@Slf4j
@ControllerAdvice
public class GlobalExceptionHandler {

    /**
     * favicon.ico, chrome devtools 등 브라우저 자동 요청으로 인한
     * 불필요한 ERROR 로그 오염 방지
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Void> handleNoResourceFound(NoResourceFoundException e){
        return ResponseEntity.notFound().build();
    }

    /**
     * 리소스를 찾을 수 없을 때 발생하는 예외를 처리한다. (404)
     * <p>
     * 잘못된 URL 접근 등 클라이언트 요청 오류이므로 {@code warn} 레벨로 기록한다.
     * </p>
     *
     * @param e     발생한 NotFoundException
     * @param model 에러 메시지를 뷰에 전달하기 위한 모델
     * @return 에러 페이지 뷰 이름
     */
    @ExceptionHandler(NotFoundException.class)
    public String handleNotFoundException(NotFoundException e, Model model){
        log.warn("[404] NotFoundException 발생: {}", e.getMessage());
        model.addAttribute("message", "찾을 수 없는 페이지예요");
        return "error/error";
    }

    /**
     * 처리되지 않은 모든 예외를 처리한다. (500)
     * <p>
     * 예상치 못한 서버 오류이므로 {@code error} 레벨로 스택 트레이스와 함께 기록한다.
     * </p>
     *
     * @param e     발생한 Exception
     * @param model 에러 메시지를 뷰에 전달하기 위한 모델
     * @return 에러 페이지 뷰 이름
     */
    @ExceptionHandler(Exception.class)
    public String handleException(Exception e, Model model){
        log.error("[500] 예상치 못한 예외 발생: {}", e.getMessage(), e);
        model.addAttribute("message", "서버 오류가 발생했어요. 잠시후 다시 시도해주세요.");
        return "error/error";
    }
}