package com.currencylens.currencylens;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class SeriesControllerTest {
    @Test
    void sortsAndCachesTheSelectedPairsHistoricalData() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var today = LocalDate.now(ZoneOffset.UTC);
        var before = today.minusDays(1);
        server.expect(requestTo(org.hamcrest.Matchers.containsString("symbol=AUD%2FCNY")))
                .andRespond(withSuccess("{\"values\":[{\"datetime\":\"" + today + "\",\"close\":\"4.23\"},{\"datetime\":\"" + before + "\",\"close\":\"4.12\"}]}", MediaType.APPLICATION_JSON));
        var controller = new SeriesController(builder.build(), () -> "test-key");
        var result = controller.series("AUD/CNY", before.toString(), today.toString());
        assertEquals(2, result.points().size());
        assertEquals(before.toString(), result.points().getFirst().date());
        assertEquals("4.23", result.points().getLast().rate().toPlainString());
        assertSame(result, controller.series("AUD/CNY", before.toString(), today.toString()));
        server.verify();
    }

    @Test
    void rejectsUnsupportedPairBeforeContactingProvider() {
        var controller = new SeriesController(RestClient.create(), () -> "test-key");
        var today = LocalDate.now(ZoneOffset.UTC).toString();
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> controller.series("EUR/USD", today, today)).getStatusCode().value());
    }
}
