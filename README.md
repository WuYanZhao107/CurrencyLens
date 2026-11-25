# CurrencyLens

**A currency research dashboard connecting exchange-rate history with central-bank events.**

[简体中文](README.zh-CN.md) · English

CurrencyLens is a Java and Spring Boot learning project for exploring USD/CNY, AUD/CNY, and AUD/USD. It combines labeled exchange-rate sources, interactive charts, links to historical central-bank announcements, and an experimental event-based baseline.

> **Research prototype:** Historical rates and announcements can be delayed or incomplete. Related events are leads for further reading, not proof of causation. The experiment does not interpret news content or establish forecasting ability. Do not use it as investment advice.

## Features

- **Three currency pairs:** USD/CNY, AUD/CNY, and AUD/USD, with a source and timestamp for each quote.
- **Interactive history:** hover for values, click a date, view the highest and lowest points, and select a range of up to 20 years by month.
- **On-demand updates:** the page loads quotes when opened; the refresh button updates only the selected pair. It does not poll in the background.
- **Historical context:** browse Australian Reserve Bank media releases and US Federal Reserve FOMC announcements near a selected date, with links to the original sources.
- **Experimental comparison:** compare a simple event-presence model with a previous-direction baseline using a rolling historical evaluation.

## Getting started

Requirements: Java 21, an internet connection, and Windows, macOS, or Linux. The included Maven wrapper downloads Maven on first use.

```powershell
# Windows PowerShell, from the project directory
.\mvnw.cmd spring-boot:run
```

```bash
# macOS / Linux
./mvnw spring-boot:run
```

Open [http://localhost:8080](http://localhost:8080). Alternatively, run `CurrencylensApplication` from your Java IDE.

### Optional: Twelve Data quotes

Without an API key, CurrencyLens displays daily ECB reference rates via [Frankfurter](https://frankfurter.dev/). To use [Twelve Data](https://twelvedata.com/) quotes and historical daily prices, obtain a personal API key and set it **in the environment of the process that starts the app**:

```powershell
# Windows PowerShell — replace the placeholder locally
$env:TWELVE_DATA_API_KEY = 'YOUR_API_KEY'
.\mvnw.cmd spring-boot:run
```

```bash
# macOS / Linux
export TWELVE_DATA_API_KEY='YOUR_API_KEY'
./mvnw spring-boot:run
```

Never commit a real key. Availability, market coverage, delay, credit limits, and display rights depend on the provider and your plan. Check the provider's terms before deploying or redistributing data.

The application requests up to three quotes and the selected pair's historical series at page load. Changing the pair or range may trigger additional historical-data requests; long ranges are split into multiple requests. Quotes are cached for 30 seconds and series for 15 minutes per app instance. Manual refresh requests only the selected quote. No background polling is performed.

## Data and limitations

| Item | Source and interpretation |
| --- | --- |
| Default rates | ECB daily reference rates via Frankfurter, converted to cross rates. They are not live trading prices. |
| Optional quotes and chart | Twelve Data, subject to your account's access. The chart uses daily closes and, when the displayed range includes the current date, the latest available quote. If history is unavailable, the chart explicitly falls back to ECB data. |
| Historical events | Recent Australian Reserve Bank media-release archives and Federal Reserve FOMC releases. Coverage is limited to the last three calendar years; Chinese sources and broader international news are not yet included. |
| Experiment | Uses only whether a relevant central-bank announcement appeared in the previous seven days. It excludes same-day events, compares against a simple trend baseline, and may be affected by small samples or subsequent changes to source archives. It does not analyze article content or trading costs. |

Chart highs and lows reflect the displayed daily values and any current quote shown, not intraday extremes. Provider archives can change or become temporarily unavailable.

## Tests

```powershell
.\mvnw.cmd test
```

The tests include Spring application startup and a mocked Twelve Data history response. Actual access to each currency pair depends on the user's account.

## Technology

Java 21 · Spring Boot · Maven · vanilla JavaScript · SVG · jsoup

## Project status

This is an early-stage personal learning project. Potential next steps include adding Chinese and international news sources, preserving publication-time data for historical evaluation, and researching transparent news-content analysis.
