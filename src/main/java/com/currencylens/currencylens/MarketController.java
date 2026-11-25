package com.currencylens.currencylens;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Supplier;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.w3c.dom.Element;

@RestController
@RequestMapping("/api/market")
public class MarketController {
    private final RestClient client;
    private final Supplier<String> twelveKeySupplier;
    private final Supplier<String> finnhubKeySupplier;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final Object historyLock = new Object();
    private final Object rangeLock = new Object();
    private final Object quoteLock = new Object();
    private final Object newsLock = new Object();
    private volatile History cachedHistory;
    private volatile Instant historyExpires = Instant.EPOCH;
    private volatile Quotes cachedQuotes;
    private volatile Instant quoteExpires = Instant.EPOCH;
    private final Map<String, CachedQuote> singleQuoteCache = new HashMap<>();
    private final Map<String, CachedHistory> rangeHistoryCache = new LinkedHashMap<>();
    private volatile News cachedNews;
    private volatile Instant newsExpires = Instant.EPOCH;

    private static RestClient defaultRestClient() {
        var httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
        var factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(12));
        return RestClient.builder().requestFactory(factory).build();
    }

    @Autowired
    public MarketController(
            @Value("${currencylens.twelve-data-api-key:}") String twelveKey,
            @Value("${currencylens.finnhub-api-key:}") String finnhubKey) {
        this(
                defaultRestClient(),
                () -> firstNonBlank(twelveKey, System.getenv("TWELVE_DATA_API_KEY")),
                () -> firstNonBlank(finnhubKey, System.getenv("FINNHUB_API_KEY"))
        );
    }

    MarketController() {
        this(
                defaultRestClient(),
                () -> System.getenv("TWELVE_DATA_API_KEY"),
                () -> System.getenv("FINNHUB_API_KEY")
        );
    }

    MarketController(RestClient client, Supplier<String> twelveKeySupplier, Supplier<String> finnhubKeySupplier) {
        this.client = client;
        this.twelveKeySupplier = twelveKeySupplier;
        this.finnhubKeySupplier = finnhubKeySupplier;
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) return a.trim();
        if (b != null && !b.isBlank()) return b.trim();
        return null;
    }

    record Frankfurter(Map<String, Map<String, BigDecimal>> rates) {}
    record Point(String date, BigDecimal usdCny, BigDecimal audCny, BigDecimal audUsd) {}
    record History(List<Point> points, String source) {}
    record CachedHistory(History history, Instant expires) {}
    record Quote(String pair, BigDecimal rate, String time) {}
    record Quotes(String mode, String source, List<Quote> quotes, String message) {}
    record CachedQuote(Quotes quotes, Instant expires) {}
    record Story(String source, String title, String url, String published) {}
    record News(List<Story> stories, List<String> errors) {}

    @GetMapping("/history/range")
    public History historyRange(@RequestParam String from, @RequestParam String to) {
        java.time.YearMonth first, last;
        try {
            first = java.time.YearMonth.parse(from);
            last = java.time.YearMonth.parse(to);
        } catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "月份格式应为 YYYY-MM"); }
        var current = java.time.YearMonth.now(java.time.ZoneOffset.UTC);
        if (first.isAfter(last) || last.isAfter(current) || first.isBefore(current.minusMonths(239)) || java.time.temporal.ChronoUnit.MONTHS.between(first, last) >= 240)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择过去 20 年内的月份，且开始月份不晚于结束月份");
        String cacheKey = first + ":" + last;
        synchronized (rangeLock) {
            CachedHistory cached = rangeHistoryCache.get(cacheKey);
            if (cached != null && Instant.now().isBefore(cached.expires())) return cached.history();
        }
        var end = last.atEndOfMonth();
        var today = LocalDate.now(java.time.ZoneOffset.UTC);
        if (end.isAfter(today)) end = today;
        try {
            String url = "https://api.frankfurter.dev/v1/" + first.atDay(1) + ".." + end + "?base=EUR&symbols=USD,AUD,CNY";
            Frankfurter response = client.get().uri(url).retrieve().body(Frankfurter.class);
            if (response == null || response.rates() == null) throw new IllegalStateException("empty data");
            String firstDate = first.atDay(1).toString(), lastDate = end.toString();
            List<Point> result = response.rates().entrySet().stream()
                    .filter(e -> e.getKey().compareTo(firstDate) >= 0 && e.getKey().compareTo(lastDate) <= 0)
                    .sorted(Map.Entry.comparingByKey()).map(e -> {
                var r = e.getValue();
                return new Point(e.getKey(), cross(r.get("CNY"), r.get("USD")), cross(r.get("CNY"), r.get("AUD")), cross(r.get("USD"), r.get("AUD")));
            }).toList();
            History history = new History(result, "Frankfurter v1 / ECB reference rates");
            synchronized (rangeLock) {
                if (rangeHistoryCache.size() >= 16) rangeHistoryCache.remove(rangeHistoryCache.keySet().iterator().next());
                rangeHistoryCache.put(cacheKey, new CachedHistory(history, Instant.now().plus(Duration.ofMinutes(15))));
            }
            return history;
        } catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "历史汇率暂时不可用，请稍后重试"); }
    }

    @GetMapping("/history")
    public History history() {
        synchronized (historyLock) {
            if (cachedHistory != null && Instant.now().isBefore(historyExpires)) return cachedHistory;
            try {
                LocalDate end = LocalDate.now(java.time.ZoneOffset.UTC);
                String url = "https://api.frankfurter.dev/v1/" + end.minusDays(400) + ".." + end + "?base=EUR&symbols=USD,AUD,CNY";
                Frankfurter response = client.get().uri(url).retrieve().body(Frankfurter.class);
                if (response == null || response.rates() == null) throw new IllegalStateException("empty data");
                List<Point> points = response.rates().entrySet().stream().sorted(Map.Entry.comparingByKey()).map(e -> {
                    var r = e.getValue();
                    return new Point(e.getKey(), cross(r.get("CNY"), r.get("USD")), cross(r.get("CNY"), r.get("AUD")), cross(r.get("USD"), r.get("AUD")));
                }).toList();
                if (points.size() < 2) throw new IllegalStateException("insufficient data");
                cachedHistory = new History(points, "Frankfurter v1 / ECB reference rates");
                historyExpires = Instant.now().plus(Duration.ofMinutes(15));
                return cachedHistory;
            } catch (Exception e) {
                if (cachedHistory != null) return cachedHistory;
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "历史汇率暂时不可用，请稍后重试");
            }
        }
    }
    private BigDecimal cross(BigDecimal a, BigDecimal b) { return a.divide(b, 6, RoundingMode.HALF_UP); }

    @GetMapping("/quote")
    public Quotes quote(@RequestParam String pair) {
        if (!List.of("USD/CNY", "AUD/CNY", "AUD/USD").contains(pair))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不支持的货币对");
        synchronized (quoteLock) {
            CachedQuote entry = singleQuoteCache.get(pair);
            if (entry != null && Instant.now().isBefore(entry.expires())) return entry.quotes();

            String twelveKey = twelveKeySupplier.get();
            String finnhubKey = finnhubKeySupplier.get();
            boolean hasTwelve = twelveKey != null && !twelveKey.isBlank();
            boolean hasFinnhub = finnhubKey != null && !finnhubKey.isBlank();
            boolean twelveFailed = false;
            Quotes result = null;

            if (hasTwelve) {
                try {
                    result = fetchTwelveQuote(pair, twelveKey);
                } catch (Exception e) {
                    twelveFailed = true;
                }
            }
            if (result == null && hasFinnhub) {
                try {
                    String msg = twelveFailed
                            ? "Twelve Data 暂不可用，已切换为 Finnhub 备选实时报价。"
                            : "Finnhub 实时报价；历史日线由 Frankfurter / ECB 提供。";
                    result = fetchFinnhubQuote(pair, finnhubKey, msg);
                } catch (Exception ignored) {
                }
            }
            if (result == null) {
                String msg = (hasTwelve || hasFinnhub)
                        ? "外部报价获取失败或额度不足，已切换为每日参考汇率。"
                        : "未配置 Twelve Data / Finnhub Key，当前为每日参考汇率。";
                result = referenceQuote(pair, msg);
            }

            Duration ttl = "live".equals(result.mode()) ? Duration.ofSeconds(30) : Duration.ofSeconds(5);
            singleQuoteCache.put(pair, new CachedQuote(result, Instant.now().plus(ttl)));
            return result;
        }
    }

    private Quotes fetchTwelveQuote(String pair, String key) {
        @SuppressWarnings("unchecked") Map<String, Object> data = client.get()
                .uri("https://api.twelvedata.com/exchange_rate?symbol={pair}&apikey={key}", pair, key)
                .retrieve().body(Map.class);
        if (data == null || data.get("rate") == null || data.get("timestamp") == null)
            throw new IllegalStateException("provider response unavailable");
        String time = Instant.ofEpochSecond(Long.parseLong(data.get("timestamp").toString())).toString();
        Quote quote = new Quote(pair, new BigDecimal(data.get("rate").toString()), time);
        return new Quotes("live", "Twelve Data", List.of(quote), "报价时间由数据源提供，时效取决于账户与市场。");
    }

    private Quotes fetchFinnhubQuote(String pair, String key, String message) {
        @SuppressWarnings("unchecked") Map<String, Object> data = client.get()
                .uri("https://finnhub.io/api/v1/forex/rates?base=USD&token={key}", key)
                .retrieve().body(Map.class);
        if (data == null || !(data.get("quote") instanceof Map<?, ?> quotesMap))
            throw new IllegalStateException("finnhub response unavailable");
        Object cnyObj = quotesMap.get("CNY");
        Object audObj = quotesMap.get("AUD");
        if (cnyObj == null || audObj == null)
            throw new IllegalStateException("finnhub missing currencies");
        BigDecimal cny = new BigDecimal(cnyObj.toString());
        BigDecimal aud = new BigDecimal(audObj.toString());
        if (aud.compareTo(BigDecimal.ZERO) <= 0)
            throw new IllegalStateException("invalid aud rate");
        BigDecimal rate = switch (pair) {
            case "USD/CNY" -> cny.setScale(6, RoundingMode.HALF_UP);
            case "AUD/USD" -> BigDecimal.ONE.divide(aud, 6, RoundingMode.HALF_UP);
            case "AUD/CNY" -> cny.divide(aud, 6, RoundingMode.HALF_UP);
            default -> throw new IllegalArgumentException("unsupported pair");
        };
        return new Quotes("live", "Finnhub", List.of(new Quote(pair, rate, Instant.now().toString())), message);
    }

    private Quotes referenceQuote(String pair, String message) {
        Point p = history().points().getLast();
        BigDecimal rate = switch (pair) {
            case "USD/CNY" -> p.usdCny();
            case "AUD/CNY" -> p.audCny();
            case "AUD/USD" -> p.audUsd();
            default -> throw new IllegalArgumentException("unsupported pair");
        };
        return new Quotes("daily", "Frankfurter / ECB", List.of(new Quote(pair, rate, p.date())), message);
    }

    @GetMapping("/quotes")
    public Quotes quotes() {
        synchronized (quoteLock) {
            if (cachedQuotes != null && Instant.now().isBefore(quoteExpires)) return cachedQuotes;
            String key = twelveKeySupplier.get();
            if (key != null && !key.isBlank()) {
                try {
                    List<Quote> quotes = new ArrayList<>();
                    for (String pair : List.of("USD/CNY", "AUD/CNY", "AUD/USD")) {
                        @SuppressWarnings("unchecked") Map<String, Object> data = client.get().uri("https://api.twelvedata.com/exchange_rate?symbol={pair}&apikey={key}", pair, key).retrieve().body(Map.class);
                        if (data == null || data.get("rate") == null || data.get("timestamp") == null) throw new IllegalStateException("provider response unavailable");
                        String time = Instant.ofEpochSecond(Long.parseLong(data.get("timestamp").toString())).toString();
                        quotes.add(new Quote(pair, new BigDecimal(data.get("rate").toString()), time));
                    }
                    cachedQuotes = new Quotes("live", "Twelve Data", quotes, "报价时间由数据源提供；实时权限与延迟取决于账户和市场。持续刷新会消耗大量 API 额度。");
                } catch (Exception e) { cachedQuotes = referenceQuotes("实时数据获取失败或额度不足，已切换至每日参考汇率。请检查 API Key 和账户额度。"); }
            } else cachedQuotes = referenceQuotes("每日参考汇率；配置 Twelve Data API Key 后可尝试近实时报价。");
            quoteExpires = Instant.now().plusSeconds(30);
            return cachedQuotes;
        }
    }
    private Quotes referenceQuotes(String message) {
        List<Point> ps = history().points(); Point p = ps.getLast();
        return new Quotes("daily", "Frankfurter / ECB", List.of(new Quote("USD/CNY", p.usdCny(), p.date()), new Quote("AUD/CNY", p.audCny(), p.date()), new Quote("AUD/USD", p.audUsd(), p.date())), message);
    }
    @GetMapping("/news")
    public News news() {
        synchronized (newsLock) {
            if (cachedNews != null && Instant.now().isBefore(newsExpires)) return cachedNews;
            List<Story> stories = new ArrayList<>(); List<String> errors = new ArrayList<>();
            feed(stories, errors, "美联储", "https://www.federalreserve.gov/feeds/press_monetary.xml");
            feed(stories, errors, "澳洲联储", "https://www.rba.gov.au/rss/rss-cb-media-releases.xml");
            stories.sort(Comparator.comparing(Story::published).reversed());
            cachedNews = new News(stories.stream().limit(12).toList(), errors);
            newsExpires = Instant.now().plus(Duration.ofMinutes(15));
            return cachedNews;
        }
    }
    private void feed(List<Story> stories, List<String> errors, String source, String url) {
        try {
            var request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(12)).header("User-Agent", "CurrencyLens/1.0").GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (var body = response.body()) {
                if (response.statusCode() != 200) throw new IllegalStateException("HTTP " + response.statusCode());
                var factory = DocumentBuilderFactory.newInstance();
                factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
                factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, ""); factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
                var items = factory.newDocumentBuilder().parse(body).getElementsByTagName("item");
                for (int i = 0; i < Math.min(items.getLength(), 10); i++) {
                    Element item = (Element) items.item(i); String link = value(item, "link");
                    if (!link.startsWith("https://")) continue;
                    String date;
                    try {
                        String pubDate = value(item, "pubDate");
                        date = pubDate.isBlank()
                                ? java.time.OffsetDateTime.parse(value(item, "dc:date")).toInstant().toString()
                                : java.time.ZonedDateTime.parse(pubDate, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toString();
                    } catch (Exception e) { date = ""; }
                    stories.add(new Story(source, value(item, "title"), link, date));
                }
            }
        } catch (Exception e) { errors.add(source + "资讯暂时不可用"); }
    }
    private String value(Element e, String tag) { var nodes = e.getElementsByTagName(tag); return nodes.getLength() == 0 ? "" : nodes.item(0).getTextContent().trim(); }
}
