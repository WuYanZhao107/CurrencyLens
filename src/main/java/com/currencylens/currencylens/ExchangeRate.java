package com.currencylens.currencylens;

import java.math.BigDecimal;

public record ExchangeRate(
        String baseCurrency,
        String quoteCurrency,
        BigDecimal rate,
        String date
) {
}