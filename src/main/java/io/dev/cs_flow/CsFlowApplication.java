package io.dev.cs_flow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

/**
 * CS Flow 애플리케이션 진입점. 캐시를 켠다.
 */
@EnableCaching
@SpringBootApplication
public class CsFlowApplication {

	/**
	 * 애플리케이션을 시작한다.
	 *
	 * @param args 실행 인자
	 */
	public static void main(String[] args) {
		SpringApplication.run(CsFlowApplication.class, args);
	}
}