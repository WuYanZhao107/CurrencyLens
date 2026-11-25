package com.currencylens.currencylens;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/market")
public class SeriesController {
    private final RestClient client;
    private final Supplier<String> keySupplier;
    private final Map<String, CachedSeries> cache = new LinkedHashMap<>();
    record SeriesPoint(String date, BigDecimal rate) {}
    record Series(String pair, String source, List<SeriesPoint> points) {}
    record CachedSeries(Series data, Instant expires) {}

    @Autowired
    public SeriesController() { this(RestClient.create(), () -> System.getenv("TWELVE_DATA_API_KEY")); }
    SeriesController(RestClient client, Supplier<String> keySupplier) { this.client = client; this.keySupplier = keySupplier; }

    @GetMapping("/series")
    public synchronized Series series(@RequestParam String pair, @RequestParam String from, @RequestParam String to) {
        if (!List.of("AUD/CNY", "USD/CNY", "AUD/USD").contains(pair))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不支持的货币对");
        LocalDate first, last;
        try { first = LocalDate.parse(from); last = LocalDate.parse(to); }
        catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "日期格式无效"); }
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        if (first.isAfter(last) || last.isAfter(today) || first.isBefore(today.minusYears(20).minusMonths(1)))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "日期范围无效");
        String key = keySupplier.get();
        if (key == null || key.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "未配置报价数据源");
        String cacheKey = pair + ":" + first + ":" + last;
        CachedSeries stored = cache.get(cacheKey);
        if (stored != null && Instant.now().isBefore(stored.expires())) return stored.data();
        try {
            Map<LocalDate, BigDecimal> rates = new TreeMap<>();
            LocalDate start = first;
            while (!start.isAfter(last)) {
                LocalDate end = start.plusYears(8).minusDays(1);
                if (end.isAfter(last)) end = last;
                // end_date is exclusive; include the final requested day.
                @SuppressWarnings("unchecked") Map<String, Object> body = client.get()
                        .uri("https://api.twelvedata.com/time_series?symbol={pair}&interval=1day&start_date={start}&end_date={end}&apikey={key}", pair, start, end.plusDays(1), key)
                        .retrieve().body(Map.class);
                if (body == null || !(body.get("values") instanceof List<?> values)) throw new IllegalStateException("provider response unavailable");
                for (Object item : values) {
                    if (!(item instanceof Map<?, ?> row) || row.get("datetime") == null || row.get("close") == null) continue;
                    LocalDate date = LocalDate.parse(row.get("datetime").toString().substring(0, 10));
                    if (!date.isBefore(first) && !date.isAfter(last)) rates.put(date, new BigDecimal(row.get("close").toString()));
                }
                start = end.plusDays(1);
            }
            if (rates.isEmpty()) throw new IllegalStateException("no data");
            Series result = new Series(pair, "Twelve Data · 日线收盘价", rates.entrySet().stream().map(e -> new SeriesPoint(e.getKey().toString(), e.getValue())).toList());
            if (cache.size() >= 24) cache.remove(cache.keySet().iterator().next());
            cache.put(cacheKey, new CachedSeries(result, Instant.now().plus(Duration.ofMinutes(15))));
            return result;
        } catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Twelve Data 历史数据暂时不可用"); }
    }
}
