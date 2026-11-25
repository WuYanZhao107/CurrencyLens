package com.currencylens.currencylens;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import java.time.YearMonth;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class MarketControllerTest {

    @Test
    void rejectsUnsupportedQuotePair() {
        var controller = new MarketController();
        var ex = assertThrows(ResponseStatusException.class, () -> controller.quote("EUR/USD"));
        assertEquals(400, ex.getStatusCode().value());
    }

    @Test
    void rejectsInvalidCustomHistoryRange() {
        var controller = new MarketController();
        var current = YearMonth.now(ZoneOffset.UTC);
        var tooOld = current.minusMonths(240).toString();
        var nowStr = current.toString();

        assertEquals(400, assertThrows(ResponseStatusException.class, () -> controller.historyRange("bad-date", nowStr)).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> controller.historyRange(nowStr, current.minusMonths(1).toString())).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> controller.historyRange(tooOld, nowStr)).getStatusCode().value());
    }

    @Test
    void usesTwelveDataQuoteWhenAvailable() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.containsString("api.twelvedata.com/exchange_rate?symbol=AUD%2FCNY")))
                .andRespond(withSuccess("{\"rate\":4.5123,\"timestamp\":1764000000}", MediaType.APPLICATION_JSON));

        var controller = new MarketController(builder.build(), () -> "td-key", () -> "fh-key");
        var result = controller.quote("AUD/CNY");

        assertEquals("live", result.mode());
        assertEquals("Twelve Data", result.source());
        assertEquals("4.5123", result.quotes().getFirst().rate().toPlainString());
        server.verify();
    }

    @Test
    void fallsBackToFinnhubWhenTwelveDataFailsAndComputesCrossRates() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.containsString("api.twelvedata.com/exchange_rate?symbol=AUD%2FCNY")))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        server.expect(requestTo(org.hamcrest.Matchers.containsString("finnhub.io/api/v1/forex/rates?base=USD")))
                .andRespond(withSuccess("{\"base\":\"USD\",\"quote\":{\"AUD\":1.5,\"CNY\":6.75}}", MediaType.APPLICATION_JSON));

        var controller = new MarketController(builder.build(), () -> "td-key", () -> "fh-key");
        var audCny = controller.quote("AUD/CNY");

        assertEquals("live", audCny.mode());
        assertEquals("Finnhub", audCny.source());
        assertEquals("4.500000", audCny.quotes().getFirst().rate().toPlainString());
        assertTrue(audCny.message().contains("Finnhub"));
        server.verify();
    }
}
