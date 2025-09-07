package com.example.demo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthzController {
    @GetMapping({"/", "/healthz"})
    public String ok() {
        return "ok";
    }
}
