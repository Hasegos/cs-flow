package io.dev.cs_flow.common.handler;

import io.dev.cs_flow.common.exception.NotFoundException;
import jakarta.servlet.http.HttpServletRequest;
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
     * 요청이 브라우저에서 발생한 것인지 판별한다.
     * <p>
     * {@code Accept} 헤더에 {@code text/html}이 포함된 경우 브라우저 요청으로 간주한다.
     * REST 클라이언트나 API 호출은 보통 해당 헤더를 포함하지 않으므로 이를 기준으로 구분한다.
     * </p>
     *
     * @param request 현재 HTTP 요청
     * @return 브라우저 요청이면 {@code true}, 아니면 {@code false}
     */
    private boolean isBrowserRequest(HttpServletRequest request){
        String accept = request.getHeader("Accept");
        return accept != null && accept.contains("text/html");
    }

    /**
     * favicon.ico, chrome devtools 등 브라우저 자동 요청으로 인한
     * 불필요한 ERROR 로그 오염 방지
     * <p>
     * 브라우저 요청이면 에러 페이지를 렌더링하고,
     * API 요청이면 {@code 404 Not Found} 응답을 반환한다.
     * </p>
     *
     * @param e       발생한 NoResourceFoundException
     * @param request 현재 HTTP 요청
     * @return 브라우저 요청 시 에러 페이지 뷰 이름, API 요청 시 404 ResponseEntity
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public Object handleNoResourceFound(NoResourceFoundException e,
                                                      HttpServletRequest request){
        if (isBrowserRequest(request)) {
            log.warn("[404] URI: {}", request.getRequestURI());
            return "error/error";
        }
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