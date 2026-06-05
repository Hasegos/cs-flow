package io.dev.cs_flow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@EnableCaching
@SpringBootApplication
public class CsFlowApplication {

	public static void main(String[] args) {
		SpringApplication.run(CsFlowApplication.class, args);
	}
}