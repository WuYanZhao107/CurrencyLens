package com.currencylens.currencylens;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

class HistoricalEventsControllerTest {

    @Test
    void parsesRbaReleasesAndFiltersForeignLinks() {
        String html = """
                <html><body>
                  <article class="rss-mr-item">
                    <a itemprop="url" href="/media-releases/2026/mr-26-10.html">Statement by the Monetary Policy Board</a>
                    <time datetime="2026-11-19T14:30:00+11:00">19 November 2026</time>
                  </article>
                  <article class="rss-mr-item">
                    <a itemprop="url" href="https://evil.example.com/phish">Ignored</a>
                    <time datetime="2026-11-18">18 November 2026</time>
                  </article>
                </body></html>
                """;
        List<HistoricalEventsController.Event> events = HistoricalEventsController.parseRba(html, "https://www.rba.gov.au/media-releases/2026/");
        assertEquals(1, events.size());
        assertEquals("2026-11-19", events.getFirst().date());
        assertEquals("澳洲联储", events.getFirst().source());
        assertEquals("AUD", events.getFirst().category());
        assertEquals("https://www.rba.gov.au/media-releases/2026/mr-26-10.html", events.getFirst().url());
    }

    @Test
    void parsesFedFomcStatements() {
        String html = """
                <div class="row eventlist">
                  <div class="row">
                    <time>11/7/2026</time>
                    <a href="/newsevents/pressreleases/monetary20261107a.htm">Federal Reserve issues FOMC statement</a>
                  </div>
                  <div class="row">
                    <time>invalid-date</time>
                    <a href="/newsevents/pressreleases/monetary20261101a.htm">Skip</a>
                  </div>
                </div>
                """;
        List<HistoricalEventsController.Event> events = HistoricalEventsController.parseFed(html, "https://www.federalreserve.gov/newsevents/pressreleases/2026-press-fomc.htm");
        assertEquals(1, events.size());
        assertEquals("2026-11-07", events.getFirst().date());
        assertEquals("美联储", events.getFirst().source());
        assertEquals("USD", events.getFirst().category());
    }

    @Test
    void parsesPbcHandlesTruncatedTextAndIgnoresBooleanTitleTrap() {
        String html = """
                <table>
                  <tr>
                    <td><a href="/goutongjiaoliu/113456/113469/20261118/index.html" title="完整标题说明公告">完整标题...</a><span class="hui12">2026-11-18</span></td>
                  </tr>
                  <tr>
                    <td><a href="/zhengcehuobisi/125207/125227/20260812/index.html" title="true">2026年上半年中国货币政策大事记</a><span class="hui12">2026-08-12</span></td>
                  </tr>
                  <tr>
                    <td><a href="/goutongjiaoliu/113456/113469/20230101/index.html">太早的公告</a><span class="hui12">2023-01-01</span></td>
                  </tr>
                </table>
                """;
        List<HistoricalEventsController.Event> events = HistoricalEventsController.parsePbc(html, "https://www.pbc.gov.cn/goutongjiaoliu/113456/113469/index.html", "2024-01-01");
        assertEquals(2, events.size());
        assertEquals("完整标题说明公告", events.get(0).title());
        assertEquals("2026年上半年中国货币政策大事记", events.get(1).title());
        assertEquals("CNY", events.get(0).category());
    }

    @Test
    void parsesSafeForeignExchangeNews() {
        String html = """
                <ul>
                  <li>
                    <dt><a href="/safe/2026/1116/28098.html" title="国家外汇管理局新闻发言人就2026年10月外汇市场形势答记者问">国家外汇管理局新闻发言人...</a></dt>
                    <dd>2026-11-16</dd>
                  </li>
                </ul>
                """;
        List<HistoricalEventsController.Event> events = HistoricalEventsController.parseSafe(html, "https://www.safe.gov.cn/safe/whxw/index.html");
        assertEquals(1, events.size());
        assertEquals("2026-11-16", events.getFirst().date());
        assertEquals("国家外汇管理局", events.getFirst().source());
        assertEquals("CNY", events.getFirst().category());
    }
}
