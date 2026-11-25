package com.currencylens.currencylens;

import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/market")
public class HistoricalEventsController {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NORMAL).build();
    private Events cache;
    private Instant expires = Instant.EPOCH;

    public record Event(String date, String source, String title, String url, String category) {}
    public record Events(List<Event> events, List<String> errors, String coverage) {}
    private record FetchOutcome(List<Event> events, String error) {}

    @GetMapping("/events")
    public synchronized Events events() {
        if (cache != null && Instant.now().isBefore(expires)) return cache;
        int currentYear = LocalDate.now(ZoneOffset.UTC).getYear();
        int minYear = currentYear - 2;
        List<CompletableFuture<FetchOutcome>> futures = new ArrayList<>();
        for (int year = minYear; year <= currentYear; year++) {
            final int targetYear = year;
            futures.add(CompletableFuture.supplyAsync(() -> loadRba(targetYear)));
            futures.add(CompletableFuture.supplyAsync(() -> loadFed(targetYear)));
        }
        futures.add(CompletableFuture.supplyAsync(() -> loadPbc(minYear)));
        futures.add(CompletableFuture.supplyAsync(() -> loadSafe(minYear)));

        var events = new ArrayList<Event>();
        var errors = new ArrayList<String>();
        for (CompletableFuture<FetchOutcome> future : futures) {
            FetchOutcome outcome = future.join();
            events.addAll(outcome.events());
            if (outcome.error() != null) errors.add(outcome.error());
        }
        events.sort(Comparator.comparing(Event::date).reversed());
        cache = new Events(
                List.copyOf(events),
                List.copyOf(errors),
                "已覆盖澳洲联储、美联储 FOMC、中国人民银行及国家外汇管理局公开公告；只表示公开记录，不代表全部国际新闻。"
        );
        expires = Instant.now().plus(events.isEmpty() ? Duration.ofMinutes(2) : Duration.ofHours(4));
        return cache;
    }

    private String get(String url) throws Exception {
        var req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("User-Agent", "CurrencyLens/1.0 (educational research)")
                .GET()
                .build();
        var res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) throw new IllegalStateException("HTTP " + res.statusCode());
        return res.body();
    }

    private FetchOutcome loadRba(int year) {
        String base = "https://www.rba.gov.au/media-releases/" + year + "/";
        var out = new ArrayList<Event>();
        try {
            for (Element item : Jsoup.parse(get(base), base).select("article.rss-mr-item")) {
                Element link = item.selectFirst("a[itemprop=url]"), time = item.selectFirst("time[datetime]");
                if (link == null || time == null || time.attr("datetime").length() < 10) continue;
                String title = link.text();
                String url = link.absUrl("href");
                if (!url.startsWith("https://www.rba.gov.au/")) continue;
                out.add(new Event(time.attr("datetime").substring(0, 10), "澳洲联储", title, url, "AUD"));
            }
            if (out.isEmpty()) throw new IllegalStateException("no archive items");
            return new FetchOutcome(out, null);
        } catch (Exception e) {
            return new FetchOutcome(List.of(), "澳洲联储 " + year + " 年公告未能获取");
        }
    }

    private FetchOutcome loadFed(int year) {
        String base = "https://www.federalreserve.gov/newsevents/pressreleases/" + year + "-press-fomc.htm";
        var out = new ArrayList<Event>();
        try {
            for (Element row : Jsoup.parse(get(base), base).select("div.row.eventlist div.row")) {
                Element link = row.selectFirst("a[href*=monetary]"), time = row.selectFirst("time");
                if (link == null || time == null) continue;
                LocalDate date;
                try {
                    date = LocalDate.parse(time.text(), java.time.format.DateTimeFormatter.ofPattern("M/d/uuuu"));
                } catch (Exception e) {
                    continue;
                }
                String url = link.absUrl("href");
                if (!url.startsWith("https://www.federalreserve.gov/")) continue;
                out.add(new Event(date.toString(), "美联储", link.text(), url, "USD"));
            }
            if (out.isEmpty()) throw new IllegalStateException("no archive items");
            return new FetchOutcome(out, null);
        } catch (Exception e) {
            return new FetchOutcome(List.of(), "美联储 " + year + " 年公告未能获取");
        }
    }

    private FetchOutcome loadPbc(int minYear) {
        List<String> urls = List.of(
                "https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/index.html",
                "https://www.pbc.gov.cn/zhengcehuobisi/125207/125227/index.html"
        );
        String cutoff = minYear + "-01-01";
        Map<String, Event> deduped = new LinkedHashMap<>();
        int succeeded = 0;
        for (String base : urls) {
            try {
                for (Element row : Jsoup.parse(get(base), base).select("tr")) {
                    Element link = row.selectFirst("a[href]"), time = row.selectFirst("span.hui12");
                    if (link == null || time == null) continue;
                    String date = time.text().trim();
                    if (!date.matches("\\d{4}-\\d{2}-\\d{2}") || date.compareTo(cutoff) < 0) continue;
                    String url = link.absUrl("href");
                    if (!url.startsWith("https://www.pbc.gov.cn/") || url.contains("#")) continue;
                    String text = link.text().trim();
                    String attrTitle = link.attr("title").trim();
                    String title = (!attrTitle.isEmpty() && !"true".equalsIgnoreCase(attrTitle) && text.endsWith("..."))
                            ? attrTitle
                            : text;
                    if (title.isEmpty()) continue;
                    deduped.putIfAbsent(url, new Event(date, "中国人民银行", title, url, "CNY"));
                }
                succeeded++;
            } catch (Exception ignored) {
            }
        }
        if (succeeded == 0 || deduped.isEmpty()) {
            return new FetchOutcome(List.of(), "中国人民银行近期公告未能获取");
        }
        return new FetchOutcome(List.copyOf(deduped.values()), null);
    }

    private FetchOutcome loadSafe(int minYear) {
        String cutoff = minYear + "-01-01";
        List<Event> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int maxPages = 25;
        int batchSize = 5;
        boolean reachedCutoff = false;
        int succeededPages = 0;

        for (int start = 1; start <= maxPages && !reachedCutoff; start += batchSize) {
            List<CompletableFuture<List<Event>>> batch = new ArrayList<>();
            for (int page = start; page < start + batchSize && page <= maxPages; page++) {
                final int pageNum = page;
                batch.add(CompletableFuture.supplyAsync(() -> fetchSafePage(pageNum)));
            }
            for (CompletableFuture<List<Event>> future : batch) {
                List<Event> pageItems = future.join();
                if (pageItems == null) continue;
                succeededPages++;
                for (Event ev : pageItems) {
                    if (ev.date().compareTo(cutoff) < 0) {
                        reachedCutoff = true;
                        continue;
                    }
                    if (seen.add(ev.url())) {
                        out.add(ev);
                    }
                }
            }
        }
        if (succeededPages == 0 || out.isEmpty()) {
            return new FetchOutcome(List.of(), "国家外汇管理局公告未能获取");
        }
        return new FetchOutcome(out, null);
    }

    private List<Event> fetchSafePage(int pageNum) {
        String base = pageNum == 1
                ? "https://www.safe.gov.cn/safe/whxw/index.html"
                : "https://www.safe.gov.cn/safe/whxw/index_" + pageNum + ".html";
        try {
            List<Event> pageOut = new ArrayList<>();
            for (Element li : Jsoup.parse(get(base), base).select("li")) {
                Element link = li.selectFirst("dt a[href]"), time = li.selectFirst("dd");
                if (link == null || time == null) continue;
                String date = time.text().trim();
                if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) continue;
                String url = link.absUrl("href");
                if (!url.startsWith("https://www.safe.gov.cn/")) continue;
                String title = link.attr("title").trim();
                if (title.isEmpty()) title = link.text().trim();
                if (title.isEmpty()) continue;
                pageOut.add(new Event(date, "国家外汇管理局", title, url, "CNY"));
            }
            return pageOut;
        } catch (Exception e) {
            return null;
        }
    }
}
