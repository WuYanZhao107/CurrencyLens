package com.currencylens.currencylens;

import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
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

    @GetMapping("/events")
    public synchronized Events events() {
        if (cache != null && Instant.now().isBefore(expires)) return cache;
        var events = new ArrayList<Event>(); var errors = new ArrayList<String>();
        int currentYear = LocalDate.now(ZoneOffset.UTC).getYear();
        for (int year = currentYear - 2; year <= currentYear; year++) {
            loadRba(year, events, errors);
            loadFed(year, events, errors);
        }
        events.sort(Comparator.comparing(Event::date).reversed());
        cache = new Events(List.copyOf(events), List.copyOf(errors), "澳洲联储媒体公告与美联储 FOMC 公告；只表示公开记录，不代表全部国际新闻。");
        expires = Instant.now().plus(Duration.ofHours(4));
        return cache;
    }
    private String get(String url) throws Exception {
        var req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(15)).header("User-Agent", "CurrencyLens/1.0 (educational research)").GET().build();
        var res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) throw new IllegalStateException("HTTP " + res.statusCode());
        return res.body();
    }
    private void loadRba(int year, List<Event> out, List<String> errors) {
        String base = "https://www.rba.gov.au/media-releases/" + year + "/";
        try {
            int before = out.size();
            for (Element item : Jsoup.parse(get(base), base).select("article.rss-mr-item")) {
                Element link = item.selectFirst("a[itemprop=url]"), time = item.selectFirst("time[datetime]");
                if (link == null || time == null || time.attr("datetime").length() < 10) continue;
                String title = link.text(); String url = link.absUrl("href");
                if (!url.startsWith("https://www.rba.gov.au/")) continue;
                out.add(new Event(time.attr("datetime").substring(0, 10), "澳洲联储", title, url, "AUD"));
            }
            if (out.size() == before) throw new IllegalStateException("no archive items");
        } catch (Exception e) { errors.add("澳洲联储 " + year + " 年公告未能获取"); }
    }
    private void loadFed(int year, List<Event> out, List<String> errors) {
        String base = "https://www.federalreserve.gov/newsevents/pressreleases/" + year + "-press-fomc.htm";
        try {
            int before = out.size();
            for (Element row : Jsoup.parse(get(base), base).select("div.row.eventlist div.row")) {
                Element link = row.selectFirst("a[href*=monetary]"), time = row.selectFirst("time");
                if (link == null || time == null) continue;
                LocalDate date;
                try { date = LocalDate.parse(time.text(), java.time.format.DateTimeFormatter.ofPattern("M/d/uuuu")); } catch (Exception e) { continue; }
                String url = link.absUrl("href"); if (!url.startsWith("https://www.federalreserve.gov/")) continue;
                out.add(new Event(date.toString(), "美联储", link.text(), url, "USD"));
            }
            if (out.size() == before) throw new IllegalStateException("no archive items");
        } catch (Exception e) { errors.add("美联储 " + year + " 年公告未能获取"); }
    }
}
