package com.currencylens.currencylens;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

@RestController
public class ExchangeRateController {

    private final RestClient restClient = RestClient.create();

    @GetMapping("/api/exchange-rates")
    public List<ExchangeRate> getExchangeRates() {
        String url = "https://api.frankfurter.dev/v1/latest"
                + "?base=EUR&symbols=USD,AUD,CNY";

        // 请求外部 API，并把 JSON 转换成 Java 对象
        FrankfurterResponse response = restClient.get()
                .uri(url)
                .retrieve()
                .body(FrankfurterResponse.class);

        if (response == null || response.rates() == null) {
            throw new IllegalStateException("汇率数据为空");
        }

        Map<String, BigDecimal> rates = response.rates();

        BigDecimal usd = rates.get("USD");
        BigDecimal aud = rates.get("AUD");
        BigDecimal cny = rates.get("CNY");

        if (usd == null || aud == null || cny == null) {
            throw new IllegalStateException("缺少所需的货币数据");
        }

        String date = response.date();

        return List.of(
                new ExchangeRate(
                        "USD", "CNY", divide(cny, usd), date
                ),
                new ExchangeRate(
                        "AUD", "CNY", divide(cny, aud), date
                ),
                new ExchangeRate(
                        "AUD", "USD", divide(usd, aud), date
                )
        );
    }

    private BigDecimal divide(BigDecimal numerator, BigDecimal denominator) {
        return numerator.divide(denominator, 6, RoundingMode.HALF_UP);
    }

    // 对应外部 API 返回的 JSON 结构
    private record FrankfurterResponse(
            String date,
            Map<String, BigDecimal> rates
    ) {
    }
}