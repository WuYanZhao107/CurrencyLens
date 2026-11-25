const $ = id => document.getElementById(id);

let points = [], basePoints = [], referencePoints = [], chartSource = 'reference';
let seriesRequestId = 0, requestedSeries = '', custom = false, requestId = 0;
let pair = 'audCny', days = 30, events = [], eventErrors = [], eventsReady = false, selectedDate = null;
let lastCheckedAt = null, lastRangeNote = { type: 'default' };
let convReversed = false, animateChartNext = true;
let showMa7 = false, showMa30 = false;
try {
  showMa7 = localStorage.getItem('cl_ma7') === '1';
  showMa30 = localStorage.getItem('cl_ma30') === '1';
} catch (e) {}

let lang = document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'zh';
let theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

const labels = { audCny: 'AUD / CNY', usdCny: 'USD / CNY', audUsd: 'AUD / USD' };
const pairSymbols = { audCny: 'AUD/CNY', usdCny: 'USD/CNY', audUsd: 'AUD/USD' };
const quoteOrder = ['USD/CNY', 'AUD/CNY', 'AUD/USD'];
const relevant = { audCny: ['AUD', 'CNY'], usdCny: ['USD', 'CNY'], audUsd: ['AUD', 'USD'] };
const quoteData = new Map();

const I18N = {
  zh: {
    pageTitle: 'CurrencyLens · 汇率与世界',
    brandSub: '汇率与世界',
    statusObserving: '数据观察中',
    themeToggleLabel: '切换夜间/白天模式',
    refreshLabel: p => `刷新 ${p}`,
    eyebrowSub: '汇率观察',
    heroTitleHtml: '看汇率，也看<span>背后的世界。</span>',
    heroDesc: '人民币、澳元与美元，一处了解汇率走势和重要资讯。',
    refreshModeLabel: '报价刷新方式',
    refreshModeValue: '手动刷新',
    connecting: '正在连接数据源…',
    lastChecked: t => `最近检查：${t}`,
    updateFailed: '更新失败，请稍后重试',
    loadingShort: '加载中…',
    quoteFailed: '获取失败，请选择后刷新。',
    quoteConvert: (a, b) => `1 ${a} 兑换 ${b}`,
    selectedHint: p => `● 选中 ${p} · 点击卡片或按钮切换与刷新`,
    defaultQuoteNote: '切换货币对后，可单独刷新对应汇率。',
    converterTag: '即时换算',
    swapLabel: '交换货币方向',
    copyLabel: '复制换算结果',
    chartTitle: '汇率走势',
    ranges: { '30': '1月', '90': '3月', '180': '6月', '365': '1年' },
    customRangeLabel: '自定义区间',
    fromLabel: '从',
    toLabel: '到',
    viewBtn: '查看',
    rangeDefault: '最多可查看过去 20 年',
    rangeInvalid: '请选择过去 20 年内的有效月份，开始不得晚于结束。',
    rangeLoading: '正在获取历史汇率…',
    rangeInsufficient: '此区间数据不足，请选择其他月份。',
    rangeLoaded: (f, t) => `已显示 ${f} 至 ${t} · 历史日线`,
    rangeError: '历史数据暂时无法获取，请稍后重试。',
    metricHigh: '区间最高',
    metricLow: '区间最低',
    metricSpread: '区间振幅',
    ma7Label: '7日均线',
    ma30Label: '30日均线',
    loadingHistory: '正在加载历史数据…',
    historyError: '历史数据加载失败，请稍后重试。',
    historyInsufficient: '所选区间的汇率数据不足。',
    chartSourceRef: '每日参考汇率 · ECB via Frankfurter',
    chartSourceSelecting: '正在选择数据源…',
    chartSourceLoadingTwelve: '正在获取 Twelve Data 日线…',
    chartSourceTwelve: 'Twelve Data · 日线收盘价',
    chartSourceTwelveLive: 'Twelve Data · 日线收盘价 + 当前报价',
    chartSourceFallback: '外部报价暂不可用，走势图显示 ECB 参考汇率',
    chartSourceTwelveFallback: 'Twelve Data 历史数据暂不可用 · 显示 ECB 参考汇率，与上方报价来源不同',
    chartTimingLive: '日线 + 当前报价（按需刷新）',
    chartTimingDaily: '历史日线数据',
    periodChange: '区间变化',
    highLabel: '最高',
    lowLabel: '最低',
    tipLive: t => ` · 当前报价 ${t} (UTC)`,
    tipHint: '点击查看当时事件',
    tipEvents: n => `${n} 条相关央行公告`,
    eventsTitle: '历史事件线索',
    eventsDesc: '点击走势图或选择日期，查看当天及之前 7 天的相关央行公告。时间相近不代表造成汇率变化。',
    obsDateLabel: '观察日期',
    latestBtn: '最新',
    eventsLoading: '正在获取历史事件…',
    loadingNews: '正在获取资讯…',
    eventsError: '历史公告暂时不可用',
    eventsLoadFailed: '历史公告加载失败，请稍后重试。',
    eventsCoverage: '已覆盖澳洲联储、美联储 FOMC、中国人民银行及国家外汇管理局公开公告；只表示公开记录，不代表全部国际新闻。',
    eventsUncovered: y => `此日期的央行历史公告暂未接入（当前覆盖 ${y} 年起）；不代表当时没有新闻。`,
    eventsCaption: (p, d, n) => `${p} · ${d} 及此前 7 天 · ${n} 条线索`,
    eventsEmpty: '这个时间窗口没有找到已覆盖的相关央行公告。并不代表当时没有其他重要新闻。',
    eventReason: cat => {
      const desc = cat === 'AUD' ? '澳元相关央行公告' : cat === 'CNY' ? '人民币相关央行/外汇局公告' : '美元相关央行公告';
      return `关联依据：${desc}，日期在观察窗口内；影响方向和因果关系未知。`;
    },
    sourceMap: {
      '澳洲联储': '澳洲联储 (RBA)',
      '美联储': '美联储 (Fed)',
      '中国人民银行': '中国人民银行 (PBoC)',
      '国家外汇管理局': '国家外汇管理局 (SAFE)'
    },
    labSub: '实验功能',
    labTitle: '事件与走势实验',
    labDesc: '按观察日期之前是否有相关央行公告，统计类似情形下下一次参考汇率的涨跌，并与延续上次涨跌方向的基线比较。实验不理解公告内容，不证明因果或预测有效。',
    statDirection: '同类情形上涨比例',
    statAccuracy: '实验回测命中率',
    statBaseline: '基线命中率',
    calculating: '计算中…',
    insufficientSample: '样本不足',
    expErrorNote: '历史事件数据不完整，暂停事件条件预测；请稍后重试。',
    expUncoveredNote: d => `该时期的公告数据尚未覆盖（现有数据从 ${d} 起），无法计算事件预测。`,
    expShortNote: '观察日期之前的历史样本不足。',
    expNote: (date, hasEvent, sampleCount, btCount) =>
      `截至 ${date}：最近 7 天${hasEvent ? '有' : '无'}已覆盖的相关央行公告；同类样本 ${sampleCount} 次。滚动回测 ${btCount} 次，基线为沿用上一次涨跌方向。同日公告排除，样本小且未验证新闻效果，不能作为交易依据。`,
    footerDisclaimer: '仅供学习与研究 · 参考汇率非交易报价',
    backendMsgMap: {
      '未配置 Twelve Data Key，当前为每日参考汇率。': '未配置 Twelve Data Key，当前为每日参考汇率。',
      '外部报价获取失败或额度不足，已切换为每日参考汇率。': '外部报价获取失败或额度不足，已切换为每日参考汇率。',
      '报价时间由数据源提供，时效取决于账户与市场。': '报价时间由数据源提供，时效取决于账户与市场。'
    }
  },
  en: {
    pageTitle: 'CurrencyLens · FX & Context',
    brandSub: 'FX & Context',
    statusObserving: 'Observing',
    themeToggleLabel: 'Toggle light/dark theme',
    refreshLabel: p => `Refresh ${p}`,
    eyebrowSub: 'RATES & CONTEXT',
    heroTitleHtml: 'Read the rates, and <span>the world behind them.</span>',
    heroDesc: 'CNY, AUD, and USD in one place—explore exchange-rate history alongside official policy context.',
    refreshModeLabel: 'Quote Updates',
    refreshModeValue: 'On-Demand',
    connecting: 'Connecting to data sources…',
    lastChecked: t => `Last checked: ${t}`,
    updateFailed: 'Update failed, try again later',
    loadingShort: 'Loading…',
    quoteFailed: 'Unavailable. Select and refresh.',
    quoteConvert: (a, b) => `1 ${a} to ${b}`,
    selectedHint: p => `● Selected ${p} · Click any card or button to switch & refresh`,
    defaultQuoteNote: 'Select a pair to refresh its quote independently.',
    converterTag: 'Quick Convert',
    swapLabel: 'Swap currencies',
    copyLabel: 'Copy converted amount',
    chartTitle: 'Historical Trend',
    ranges: { '30': '1M', '90': '3M', '180': '6M', '365': '1Y' },
    customRangeLabel: 'Custom Range',
    fromLabel: 'From',
    toLabel: 'To',
    viewBtn: 'Apply',
    rangeDefault: 'Up to 20 years of history',
    rangeInvalid: 'Select valid months within the past 20 years (start ≤ end).',
    rangeLoading: 'Loading historical rates…',
    rangeInsufficient: 'Insufficient data for this range. Try other months.',
    rangeLoaded: (f, t) => `Showing ${f} to ${t} · Daily history`,
    rangeError: 'Historical data is temporarily unavailable.',
    metricHigh: 'Period High',
    metricLow: 'Period Low',
    metricSpread: 'Spread',
    ma7Label: '7D MA',
    ma30Label: '30D MA',
    loadingHistory: 'Loading historical rates…',
    historyError: 'Failed to load historical rates. Try again later.',
    historyInsufficient: 'Not enough data points in the selected range.',
    chartSourceRef: 'Daily Reference · ECB via Frankfurter',
    chartSourceSelecting: 'Selecting data source…',
    chartSourceLoadingTwelve: 'Fetching Twelve Data daily series…',
    chartSourceTwelve: 'Twelve Data · Daily Close',
    chartSourceTwelveLive: 'Twelve Data · Daily Close + Latest Quote',
    chartSourceFallback: 'Live quote unavailable; showing ECB reference chart',
    chartSourceTwelveFallback: 'Twelve Data history unavailable · Showing ECB reference rates',
    chartTimingLive: 'Daily closes + latest quote (on-demand)',
    chartTimingDaily: 'Daily historical rates',
    periodChange: 'Period change',
    highLabel: 'High',
    lowLabel: 'Low',
    tipLive: t => ` · Latest ${t} (UTC)`,
    tipHint: 'Click to inspect nearby events',
    tipEvents: n => `${n} central-bank release${n > 1 ? 's' : ''}`,
    eventsTitle: 'Historical Context',
    eventsDesc: 'Click the chart or pick a date to view official central-bank releases from that day and the prior 7 days. Proximity does not imply causation.',
    obsDateLabel: 'Date',
    latestBtn: 'Latest',
    eventsLoading: 'Loading historical releases…',
    loadingNews: 'Loading releases…',
    eventsError: 'Historical releases temporarily unavailable',
    eventsLoadFailed: 'Failed to load releases. Try again later.',
    eventsCoverage: 'Covers official RBA, Federal Reserve FOMC, PBoC, and SAFE releases; public records only, not all global news.',
    eventsUncovered: y => `Archive coverage starts in ${y}; earlier periods are not included here (absence does not mean no news occurred).`,
    eventsCaption: (p, d, n) => `${p} · ${d} & prior 7 days · ${n} release${n === 1 ? '' : 's'}`,
    eventsEmpty: 'No covered central-bank releases found in this 7-day window.',
    eventReason: cat => {
      const desc = cat === 'AUD' ? 'RBA (AUD)' : cat === 'CNY' ? 'PBoC / SAFE (CNY)' : 'Federal Reserve (USD)';
      return `Match basis: ${desc} release within the 7-day window; market impact unknown.`;
    },
    sourceMap: {
      '澳洲联储': 'RBA',
      '美联储': 'Federal Reserve',
      '中国人民银行': 'PBoC',
      '国家外汇管理局': 'SAFE'
    },
    labSub: 'EVENT BACKTEST',
    labTitle: 'Event-Conditioned Baseline',
    labDesc: 'Checks whether a covered central-bank release appeared in the prior 7 days and compares next-day directional accuracy against a simple trend-continuation baseline. Does not parse text or imply predictive power.',
    statDirection: 'Upward Share (Similar)',
    statAccuracy: 'Event Model Hit Rate',
    statBaseline: 'Baseline Hit Rate',
    calculating: 'Calculating…',
    insufficientSample: 'Low sample',
    expErrorNote: 'Event data is incomplete; pausing rolling backtest until available.',
    expUncoveredNote: d => `Event archive starts on ${d}; earlier dates cannot be evaluated.`,
    expShortNote: 'Insufficient prior history before the selected date.',
    expNote: (date, hasEvent, sampleCount, btCount) =>
      `As of ${date}: ${hasEvent ? 'covered release present' : 'no covered release'} in prior 7 days; ${sampleCount} matching observations. ${btCount} rolling backtest steps vs. prior-direction baseline. Same-day releases excluded; small sample, not financial advice.`,
    footerDisclaimer: 'Educational & research prototype · Reference rates, not live trading quotes',
    backendMsgMap: {
      '未配置 Twelve Data Key，当前为每日参考汇率。': 'No Twelve Data API key configured; displaying ECB daily reference rates.',
      '外部报价获取失败或额度不足，已切换为每日参考汇率。': 'External live quote unavailable or quota reached; switched to ECB daily reference rates.',
      '报价时间由数据源提供，时效取决于账户与市场。': 'Quote timestamp provided by source; freshness depends on account tier and market hours.'
    }
  }
};

const t = () => I18N[lang];
const signed = x => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateValue = d => Date.parse(d + 'T00:00:00Z');

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw Error('API unavailable');
  return r.json();
}

function translateBackendMsg(msg) {
  if (!msg) return '';
  if (lang === 'zh') return msg;
  return t().backendMsgMap[msg] || msg;
}

function translateErrorMsg(msg) {
  if (lang === 'zh') return msg;
  if (msg.includes('澳洲联储')) return msg.replace('澳洲联储 ', 'RBA ').replace(' 年公告未能获取', ' archive unavailable');
  if (msg.includes('美联储')) return msg.replace('美联储 ', 'Fed ').replace(' 年公告未能获取', ' archive unavailable');
  if (msg.includes('中国人民银行')) return 'PBoC recent releases unavailable';
  if (msg.includes('国家外汇管理局')) return 'SAFE releases unavailable';
  return msg;
}

function getActiveRate() {
  const symbol = pairSymbols[pair];
  const q = quoteData.get(symbol);
  if (q && !q.error && q.quotes && q.quotes[0]) {
    return Number(q.quotes[0].rate);
  }
  if (points.length) {
    return Number(points.at(-1)[pair]);
  }
  return null;
}

function renderConverter() {
  const [base, quote] = pairSymbols[pair].split('/');
  const fromCode = convReversed ? quote : base;
  const toCode = convReversed ? base : quote;
  $('convFromCode').textContent = fromCode;
  $('convToCode').textContent = toCode;

  const rate = getActiveRate();
  const raw = $('convAmount').value.replace(/,/g, '').trim();
  const amount = raw === '' ? 0 : Number(raw);

  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    $('converterUnitRate').textContent = `1 ${base} = — ${quote}`;
    $('convResult').textContent = '—';
    return;
  }

  const inverse = 1 / rate;
  $('converterUnitRate').textContent = `1 ${base} = ${rate.toFixed(4)} ${quote}  ·  1 ${quote} = ${inverse.toFixed(4)} ${base}`;

  const effectiveRate = convReversed ? inverse : rate;
  const converted = (Number.isFinite(amount) ? amount : 0) * effectiveRate;
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  $('convResult').textContent = converted.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });

  document.querySelectorAll('#converterPresets button').forEach(btn => {
    btn.classList.toggle('selected', Number(btn.dataset.amount) === Number(raw));
  });
}

function flagPairHtml(symbol) {
  const [a, b] = symbol.split('/');
  return `<span class="flag-pair" aria-hidden="true"><span class="flag-dot flag-${esc(a)}">${esc(a.slice(0, 2))}</span><span class="flag-dot flag-${esc(b)}">${esc(b.slice(0, 2))}</span></span>`;
}

function renderQuotes() {
  const dict = t();
  $('ticker').innerHTML = quoteOrder.map(symbol => {
    const d = quoteData.get(symbol);
    const isSelected = pairSymbols[pair] === symbol;
    const pairKey = Object.keys(pairSymbols).find(k => pairSymbols[k] === symbol);
    if (!d) {
      return `<article class="quote ${isSelected ? 'quote-selected' : ''}" role="button" tabindex="0" data-pair="${pairKey}"><div class="quote-top"><div class="pair-identity">${flagPairHtml(symbol)}<span class="quote-name">${esc(symbol)}</span></div></div><div class="loading">${esc(dict.loadingShort)}</div></article>`;
    }
    if (d.error) {
      return `<article class="quote ${isSelected ? 'quote-selected' : ''}" role="button" tabindex="0" data-pair="${pairKey}"><div class="quote-top"><div class="pair-identity">${flagPairHtml(symbol)}<span class="quote-name">${esc(symbol)}</span></div></div><div class="loading">${esc(dict.quoteFailed)}</div></article>`;
    }
    const q = d.quotes[0];
    const [base, quote] = symbol.split('/');
    const isLive = d.mode === 'live';
    return `<article class="quote ${isSelected ? 'quote-selected' : ''}" role="button" tabindex="0" data-pair="${pairKey}" aria-pressed="${isSelected}">
      <div class="quote-top">
        <div class="pair-identity">${flagPairHtml(symbol)}<span class="quote-name">${esc(symbol)}</span></div>
        <span class="badge ${isLive ? 'badge-live' : ''}">${isLive ? 'Twelve Data' : 'Frankfurter / ECB'}</span>
      </div>
      <div class="quote-value tabular">${Number(q.rate).toFixed(4)}</div>
      <div class="quote-bottom">
        <span>${esc(dict.quoteConvert(base, quote))}</span>
        <span class="quote-time">${esc(q.time)}${isLive ? ' (UTC)' : ''}</span>
      </div>
    </article>`;
  }).join('');

  const selected = quoteData.get(pairSymbols[pair]);
  $('mode').textContent = dict.selectedHint(labels[pair]);
  $('quoteNote').textContent = selected && !selected.error ? translateBackendMsg(selected.message) : dict.defaultQuoteNote;
  $('refreshText').textContent = dict.refreshLabel(labels[pair]);
  renderConverter();
}

function updateCheckedLabel() {
  if (lastCheckedAt === 'failed') {
    $('checked').textContent = t().updateFailed;
  } else if (lastCheckedAt instanceof Date) {
    $('checked').textContent = t().lastChecked(lastCheckedAt.toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-CN'));
  } else {
    $('checked').textContent = t().connecting;
  }
}

async function loadQuote(symbol) {
  try {
    const result = await api('/api/market/quote?pair=' + encodeURIComponent(symbol));
    quoteData.set(symbol, result);
    if (symbol === pairSymbols[pair] && referencePoints.length) {
      if (result.mode === 'live' && chartSource !== 'twelve') loadSeries();
      else if (result.mode !== 'live' && chartSource === 'twelve') useReference('fallback');
      else draw(false);
    }
    lastCheckedAt = new Date();
    updateCheckedLabel();
  } catch (e) {
    if (!quoteData.has(symbol)) quoteData.set(symbol, { error: true });
    if (symbol === pairSymbols[pair]) {
      lastCheckedAt = 'failed';
      updateCheckedLabel();
    }
  }
  renderQuotes();
}

async function refreshSelected() {
  const button = $('refresh'), symbol = pairSymbols[pair];
  button.disabled = true;
  button.classList.add('spinning');
  try {
    await loadQuote(symbol);
  } finally {
    button.disabled = false;
    button.classList.remove('spinning');
  }
}

function loadInitialQuotes() {
  renderQuotes();
  quoteOrder.forEach(loadQuote);
}

let chartSourceMode = 'ref';
function updateChartSourceText() {
  const dict = t();
  const map = {
    ref: dict.chartSourceRef,
    selecting: dict.chartSourceSelecting,
    loadingTwelve: dict.chartSourceLoadingTwelve,
    twelve: dict.chartSourceTwelve,
    twelveLive: dict.chartSourceTwelveLive,
    fallback: dict.chartSourceFallback,
    twelveFallback: dict.chartSourceTwelveFallback
  };
  $('chartSource').textContent = map[chartSourceMode] || dict.chartSourceRef;
}

async function loadHistory() {
  try {
    const d = await api('/api/market/history');
    basePoints = d.points;
    if (custom) return;
    referencePoints = basePoints;
    points = referencePoints;
    if (!selectedDate) selectedDate = points.at(-1).date;
    $('eventDate').min = points[0].date;
    $('eventDate').max = points.at(-1).date;
    $('eventDate').value = selectedDate;
    animateChartNext = true;
    draw(true);
    renderEvents();
    renderConverter();
    experiment();
    loadSeries();
  } catch (e) {
    $('chart').innerHTML = `<div class="loading">${esc(t().historyError)}</div>`;
  }
}

function useReference(sourceKey = 'ref') {
  seriesRequestId++;
  requestedSeries = '';
  chartSource = 'reference';
  chartSourceMode = sourceKey;
  points = referencePoints;
  updateChartSourceText();
  draw(animateChartNext);
  animateChartNext = false;
  experiment();
}

async function loadSeries() {
  if (!referencePoints.length) return;
  const selected = pairSymbols[pair], q = quoteData.get(selected);
  if (!q || q.mode !== 'live') {
    useReference('ref');
    return;
  }
  const from = referencePoints[0].date;
  const today = new Date().toISOString().slice(0, 10);
  const to = (!custom || $('toMonth').value === today.slice(0, 7)) ? today : referencePoints.at(-1).date;
  const requestKey = selected + ':' + from + ':' + to;
  if (requestKey === requestedSeries) return;
  requestedSeries = requestKey;
  const id = ++seriesRequestId, activePair = pair;
  chartSource = 'reference';
  chartSourceMode = 'loadingTwelve';
  points = referencePoints;
  updateChartSourceText();
  draw(false);
  try {
    const result = await api(`/api/market/series?pair=${encodeURIComponent(selected)}&from=${from}&to=${to}`);
    if (id !== seriesRequestId || activePair !== pair) return;
    if (result.points.length < 2) throw Error('Insufficient history');
    points = result.points.map(item => ({ date: item.date, [activePair]: item.rate }));
    chartSource = 'twelve';
    chartSourceMode = 'twelve';
    updateChartSourceText();
    draw(true);
    experiment();
  } catch (e) {
    if (id === seriesRequestId) {
      useReference('twelveFallback');
    }
  }
}

async function loadEvents() {
  try {
    const d = await api('/api/market/events');
    events = d.events;
    eventErrors = d.errors;
    eventsReady = true;
    updateEventStatus();
    renderEvents();
    draw(false);
    experiment();
  } catch (e) {
    eventErrors = ['error'];
    eventsReady = true;
    updateEventStatus();
    $('news').innerHTML = `<p class="muted">${esc(t().eventsLoadFailed)}</p>`;
    experiment();
  }
}

function updateEventStatus() {
  const dict = t();
  if (eventErrors.length === 1 && eventErrors[0] === 'error') {
    $('eventStatus').textContent = dict.eventsError;
    return;
  }
  const errText = eventErrors.length ? ' ' + eventErrors.map(translateErrorMsg).join(lang === 'en' ? '; ' : '；') + '.' : '';
  $('eventStatus').textContent = dict.eventsCoverage + errText;
}

function renderEvents() {
  const dict = t();
  if (!selectedDate || !eventsReady) return;
  const coverageYear = new Date().getUTCFullYear() - 2;
  if (Number(selectedDate.slice(0, 4)) < coverageYear) {
    $('eventCaption').textContent = `${labels[pair]} · ${selectedDate}`;
    $('news').innerHTML = `<p class="muted">${esc(dict.eventsUncovered(coverageYear))}</p>`;
    return;
  }
  const end = dateValue(selectedDate), begin = end - 7 * 86400000;
  const matched = events.filter(e => relevant[pair].includes(e.category) && dateValue(e.date) >= begin && dateValue(e.date) <= end);
  $('eventCaption').textContent = dict.eventsCaption(labels[pair], selectedDate, matched.length);
  $('news').innerHTML = matched.length
    ? matched.slice(0, 10).map(e => `
      <article class="story">
        <div class="story-meta">
          <span class="story-source">${esc(dict.sourceMap[e.source] || e.source)}</span>
          <span class="tabular">${esc(e.date)}</span>
        </div>
        <a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)} ↗</a>
        <div class="story-reason">${esc(dict.eventReason(e.category))}</div>
      </article>`).join('')
    : `<p class="muted">${esc(dict.eventsEmpty)}</p>`;
}

function computeSma(series, key, windowSize) {
  const out = new Array(series.length).fill(null);
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += Number(series[i][key]);
    if (i >= windowSize) sum -= Number(series[i - windowSize][key]);
    if (i >= windowSize - 1) out[i] = sum / windowSize;
  }
  return out;
}

function draw(animate = false) {
  const dict = t();
  if (points.length < 2) {
    $('chart').innerHTML = `<div class="loading">${esc(dict.historyInsufficient)}</div>`;
    return;
  }
  const fullSeries = points.map(p => ({ ...p }));
  const q = quoteData.get(pairSymbols[pair]), quote = q?.quotes?.[0], quoteDate = quote?.time?.slice(0, 10);
  const currentRange = !custom || $('toMonth').value === new Date().toISOString().slice(0, 7);
  if (chartSource === 'twelve' && currentRange && q?.mode === 'live' && quoteDate && fullSeries.length && quoteDate >= fullSeries.at(-1).date && quoteDate <= new Date().toISOString().slice(0, 10)) {
    const live = { date: quoteDate, [pair]: Number(quote.rate), live: true, quoteTime: quote.time };
    if (quoteDate === fullSeries.at(-1).date) fullSeries[fullSeries.length - 1] = live;
    else fullSeries.push(live);
  }

  const ma7All = computeSma(fullSeries, pair, 7);
  const ma30All = computeSma(fullSeries, pair, 30);
  for (let i = 0; i < fullSeries.length; i++) {
    fullSeries[i].ma7 = ma7All[i];
    fullSeries[i].ma30 = ma30All[i];
  }

  const end = dateValue(points.at(-1).date);
  const start = custom ? dateValue(points[0].date) : end - days * 86400000;
  const data = fullSeries.filter(p => dateValue(p.date) >= start);
  if (data.length < 2) {
    $('chart').innerHTML = `<div class="loading">${esc(dict.historyInsufficient)}</div>`;
    return;
  }

  const hasLive = data.some(p => p.live);
  $('chartTiming').textContent = hasLive ? dict.chartTimingLive : dict.chartTimingDaily;
  if (chartSource === 'twelve') {
    chartSourceMode = hasLive ? 'twelveLive' : 'twelve';
    updateChartSourceText();
  }
  if (hasLive && data.at(-1).date > $('eventDate').max) {
    $('eventDate').max = data.at(-1).date;
  }

  const v = data.map(p => Number(p[pair]));
  const lowIndex = v.indexOf(Math.min(...v));
  const highIndex = v.indexOf(Math.max(...v));
  const min = v[lowIndex], max = v[highIndex];
  const spreadPct = min > 0 ? ((max - min) / min) * 100 : 0;

  $('metricHigh').textContent = max.toFixed(4);
  $('metricLow').textContent = min.toFixed(4);
  $('metricSpread').textContent = spreadPct.toFixed(2) + '%';

  let yMin = min, yMax = max;
  if (showMa7) {
    for (const p of data) if (p.ma7 != null) { yMin = Math.min(yMin, p.ma7); yMax = Math.max(yMax, p.ma7); }
  }
  if (showMa30) {
    for (const p of data) if (p.ma30 != null) { yMin = Math.min(yMin, p.ma30); yMax = Math.max(yMax, p.ma30); }
  }

  const pad = (yMax - yMin) * 0.22 || Math.max(Math.abs(yMax) * 0.01, 0.01);
  const lo = yMin - pad, hi = yMax + pad;

  const box = $('chart');
  const w = Math.max(320, Math.round(box.clientWidth || 780));
  const h = Math.max(210, Math.round(box.clientHeight || 252));
  const left = 64, right = w - 18, top = 26, bottom = h - 34;
  const t0 = dateValue(data[0].date), t1 = dateValue(data.at(-1).date);
  const span = Math.max(1, t1 - t0);

  const toX = d => left + ((dateValue(d) - t0) / span) * (right - left);
  const toY = val => bottom - ((val - lo) / (hi - lo)) * (bottom - top);
  const xy = data.map(p => [toX(p.date), toY(Number(p[pair]))]);

  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  const buildMaPath = key => {
    let path = '', drawing = false;
    for (let i = 0; i < data.length; i++) {
      const val = data[i][key];
      if (val == null) { drawing = false; continue; }
      path += `${drawing ? 'L' : 'M'}${xy[i][0].toFixed(1)},${toY(val).toFixed(1)} `;
      drawing = true;
    }
    return path.trim();
  };
  const ma7Path = showMa7 ? buildMaPath('ma7') : '';
  const ma30Path = showMa30 ? buildMaPath('ma30') : '';

  let lineLength = 0;
  for (let i = 1; i < xy.length; i++) {
    lineLength += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
  }
  lineLength = Math.ceil(lineLength) + 20;

  // Map central bank events within range to nearest chart index
  const eventCountByIdx = new Map();
  if (eventsReady && events.length) {
    const rel = relevant[pair];
    const startDate = data[0].date, endDate = data.at(-1).date;
    for (const ev of events) {
      if (!rel.includes(ev.category) || ev.date < startDate || ev.date > endDate) continue;
      const evMs = dateValue(ev.date);
      let bestIdx = -1, bestDiff = Infinity;
      for (let i = 0; i < data.length; i++) {
        const diff = dateValue(data[i].date) - evMs;
        if (diff >= 0 && diff <= 3 * 86400000 && diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        eventCountByIdx.set(bestIdx, (eventCountByIdx.get(bestIdx) || 0) + 1);
      }
    }
  }

  let axes = '';
  for (let i = 0; i < 5; i++) {
    const y = top + (i * (bottom - top)) / 4;
    const val = hi - (i * (hi - lo)) / 4;
    axes += `<line x1="${left}" y1="${y.toFixed(1)}" x2="${right}" y2="${y.toFixed(1)}" stroke="var(--chart-grid)" stroke-dasharray="4 5"/><text x="${left - 9}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" class="axis-label">${val.toFixed(4)}</text>`;
  }
  const xTicks = w < 480 ? 3 : 5;
  for (let i = 0; i < xTicks; i++) {
    const x = left + (i * (right - left)) / (xTicks - 1);
    const iso = new Date(t0 + (i * span) / (xTicks - 1)).toISOString();
    const label = span > 365 * 86400000 ? iso.slice(0, 7) : iso.slice(5, 10);
    axes += `<text x="${x.toFixed(1)}" y="${h - 10}" text-anchor="middle" class="axis-label">${label}</text>`;
  }

  const eventPins = Array.from(eventCountByIdx.entries()).map(([idx]) => {
    const [px, py] = xy[idx];
    return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.2" fill="var(--chart-event-pin)" stroke="var(--surface)" stroke-width="1.5" opacity="0.9"/>`;
  }).join('');

  let selectedPin = '';
  if (selectedDate) {
    const sIdx = data.findIndex(p => p.date === selectedDate);
    if (sIdx >= 0) {
      const [sx, sy] = xy[sIdx];
      selectedPin = `<line x1="${sx.toFixed(1)}" x2="${sx.toFixed(1)}" y1="${top}" y2="${bottom}" stroke="var(--chart-pin)" stroke-dasharray="2 3"/><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>`;
    }
  }

  const mark = (index, high) => {
    const [x, y] = xy[index];
    const same = highIndex === lowIndex;
    const posY = Math.min(bottom - 6, Math.max(14, y + (high ? -10 : 16) + (same && !high ? 9 : 0)));
    const anchor = x > right - 105 ? 'end' : x < left + 105 ? 'start' : 'middle';
    const tx = anchor === 'end' ? x - 7 : anchor === 'start' ? x + 7 : x;
    const color = high ? 'var(--up)' : 'var(--down)';
    const lbl = high ? dict.highLabel : dict.lowLabel;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${color}" stroke="var(--extrema-stroke)" stroke-width="2"/><text x="${tx.toFixed(1)}" y="${posY.toFixed(1)}" text-anchor="${anchor}" class="extrema-label" fill="${color}">${lbl} ${v[index].toFixed(4)}</text>`;
  };

  const animLineClass = animate ? 'chart-line-path chart-line-animate' : 'chart-line-path';
  const animAreaClass = animate ? 'chart-area-animate' : '';
  const dashAttr = animate ? `stroke-dasharray="${lineLength}" stroke-dashoffset="${lineLength}" style="--line-len:${lineLength}"` : '';

  box.innerHTML = `
    <svg id="chartSvg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(labels[pair])} (${min.toFixed(4)} – ${max.toFixed(4)})">
      <defs>
        <linearGradient id="shade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--chart-area-top)"/>
          <stop offset="100%" stop-color="var(--chart-area-bot)"/>
        </linearGradient>
      </defs>
      ${axes}
      ${selectedPin}
      <path d="${line} L${right},${bottom} L${left},${bottom} Z" fill="url(#shade)" class="${animAreaClass}"/>
      ${ma30Path ? `<path d="${ma30Path}" stroke="var(--chart-ma30)" stroke-dasharray="5 3" class="chart-ma-line"/>` : ''}
      ${ma7Path ? `<path d="${ma7Path}" stroke="var(--chart-ma7)" class="chart-ma-line"/>` : ''}
      <path d="${line}" fill="none" stroke="var(--chart-line)" stroke-width="2.4" class="${animLineClass}" ${dashAttr}/>
      ${eventPins}
      ${mark(highIndex, true)}
      ${mark(lowIndex, false)}
      <line id="crosshair" x1="0" x2="0" y1="${top}" y2="${bottom}" stroke="var(--accent)" stroke-opacity="0.55" stroke-dasharray="3 3" visibility="hidden"/>
      <circle id="dot" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>
      <rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="transparent" id="hitbox"/>
    </svg>
    <div class="chart-tip" id="chartTip" hidden></div>`;

  const change = (v.at(-1) / v[0] - 1) * 100;
  $('chartPair').textContent = labels[pair];
  $('chartValue').textContent = v.at(-1).toFixed(4);
  $('chartChange').textContent = `${change >= 0 ? '▲' : '▼'} ${signed(change)} · ${dict.periodChange}`;
  $('chartChange').className = 'change tabular ' + (change >= 0 ? 'up' : 'down');
  $('firstDate').textContent = data[0].date;
  $('lastDate').textContent = data.at(-1).date;

  const svg = $('chartSvg'), tip = $('chartTip');
  let active = 0;

  function hover(e) {
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * w;
    active = xy.reduce((best, p, i) => Math.abs(p[0] - x) < Math.abs(xy[best][0] - x) ? i : best, 0);
    const [px, py] = xy[active];
    $('crosshair').setAttribute('x1', px);
    $('crosshair').setAttribute('x2', px);
    $('crosshair').setAttribute('visibility', 'visible');
    $('dot').setAttribute('cx', px);
    $('dot').setAttribute('cy', py);
    $('dot').setAttribute('visibility', 'visible');
    tip.hidden = false;
    const evCount = eventCountByIdx.get(active) || 0;
    const maBits = [];
    if (showMa7 && data[active].ma7 != null) maBits.push(`<span style="color:#93c5fd">MA7 ${data[active].ma7.toFixed(4)}</span>`);
    if (showMa30 && data[active].ma30 != null) maBits.push(`<span style="color:#c4b5fd">MA30 ${data[active].ma30.toFixed(4)}</span>`);
    const maHtml = maBits.length ? `<small>${maBits.join(' &nbsp;·&nbsp; ')}</small>` : '';
    tip.innerHTML = `${esc(data[active].date)}${data[active].live ? esc(dict.tipLive(data[active].quoteTime)) : ''}<br><strong>${esc(labels[pair])} &nbsp; ${v[active].toFixed(6)}</strong>${maHtml}${evCount ? `<small class="tip-event">● ${esc(dict.tipEvents(evCount))}</small>` : ''}<small>${esc(dict.tipHint)}</small>`;
    const pctX = Math.min(Math.max((px / w) * 100, 18), 82);
    const pctY = Math.max(18, (py / h) * 100 - 4);
    tip.style.left = pctX + '%';
    tip.style.top = pctY + '%';
  }

  svg.addEventListener('pointermove', hover);
  svg.addEventListener('pointerleave', () => {
    tip.hidden = true;
    $('crosshair').setAttribute('visibility', 'hidden');
    $('dot').setAttribute('visibility', 'hidden');
  });
  svg.addEventListener('click', e => {
    hover(e);
    selectedDate = data[active].date;
    $('eventDate').value = selectedDate;
    draw(false);
    renderEvents();
    experiment();
  });
}

// As-of discipline: an event is usable only if its date is strictly before the observation date.
function eventFlag(date) {
  const tMs = dateValue(date);
  return events.some(e => relevant[pair].includes(e.category) && dateValue(e.date) < tMs && dateValue(e.date) >= tMs - 7 * 86400000);
}

function experiment() {
  const dict = t();
  if (points.length < 25 || !selectedDate || !eventsReady) return;
  if (eventErrors.length) {
    $('direction').textContent = $('accuracy').textContent = $('samples').textContent = '—';
    $('experimentNote').textContent = dict.expErrorNote;
    return;
  }
  const coverageStart = `${new Date().getUTCFullYear() - 2}-01-08`;
  if (selectedDate < coverageStart) {
    $('direction').textContent = $('accuracy').textContent = $('samples').textContent = '—';
    $('experimentNote').textContent = dict.expUncoveredNote(coverageStart);
    return;
  }
  const data = points.filter(p => p.date >= coverageStart && p.date <= selectedDate);
  if (data.length < 25) {
    $('direction').textContent = $('accuracy').textContent = $('samples').textContent = '—';
    $('experimentNote').textContent = dict.expShortNote;
    return;
  }
  let buckets = [[0, 0], [0, 0]], hits = 0, baseHits = 0, n = 0;
  for (let i = 1; i < data.length - 1; i++) {
    const flag = eventFlag(data[i].date) ? 1 : 0;
    const outcome = Math.sign(Number(data[i + 1][pair]) - Number(data[i][pair]));
    const previous = Math.sign(Number(data[i][pair]) - Number(data[i - 1][pair]));
    const bucket = buckets[flag];
    if (outcome !== 0 && previous !== 0 && bucket[1] >= 20) {
      const guess = bucket[0] / bucket[1] >= 0.5 ? 1 : -1;
      hits += guess === outcome ? 1 : 0;
      baseHits += previous === outcome ? 1 : 0;
      n++;
    }
    if (outcome !== 0) {
      bucket[1]++;
      if (outcome > 0) bucket[0]++;
    }
  }
  const hasEvent = eventFlag(data.at(-1).date);
  const current = buckets[hasEvent ? 1 : 0];
  $('direction').textContent = current[1] >= 20 ? (current[0] / current[1] * 100).toFixed(1) + '%' : dict.insufficientSample;
  $('accuracy').textContent = n ? (hits / n * 100).toFixed(1) + '%' : dict.insufficientSample;
  $('samples').textContent = n ? (baseHits / n * 100).toFixed(1) + '%' : dict.insufficientSample;
  $('experimentNote').textContent = dict.expNote(data.at(-1).date, hasEvent, current[1], n);
}

function selectPair(nextPair) {
  if (!labels[nextPair] || nextPair === pair) return;
  pair = nextPair;
  animateChartNext = true;
  renderQuotes();
  document.querySelectorAll('#pairs button').forEach(x => x.classList.toggle('selected', x.dataset.pair === pair));
  useReference('selecting');
  renderEvents();
  loadSeries();
}

function updateRangeStatusText() {
  const dict = t();
  if (lastRangeNote.type === 'default') $('rangeStatus').textContent = dict.rangeDefault;
  else if (lastRangeNote.type === 'invalid') $('rangeStatus').textContent = dict.rangeInvalid;
  else if (lastRangeNote.type === 'loading') $('rangeStatus').textContent = dict.rangeLoading;
  else if (lastRangeNote.type === 'insufficient') $('rangeStatus').textContent = dict.rangeInsufficient;
  else if (lastRangeNote.type === 'loaded') $('rangeStatus').textContent = dict.rangeLoaded(lastRangeNote.from, lastRangeNote.to);
  else if (lastRangeNote.type === 'error') $('rangeStatus').textContent = dict.rangeError;
}

function applyTheme(next) {
  theme = next;
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('cl_theme', theme); } catch (e) {}
  $('themeToggle').setAttribute('aria-label', t().themeToggleLabel);
  $('themeToggle').setAttribute('title', t().themeToggleLabel);
}

function applyLang(next) {
  lang = next;
  document.documentElement.setAttribute('data-lang', lang);
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  try { localStorage.setItem('cl_lang', lang); } catch (e) {}

  const dict = t();
  document.title = dict.pageTitle;
  $('heroTitle').innerHTML = dict.heroTitleHtml;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (typeof dict[key] === 'string') el.textContent = dict[key];
  });
  document.querySelectorAll('#range button').forEach(btn => {
    const r = btn.dataset.days;
    if (dict.ranges[r]) btn.textContent = dict.ranges[r];
  });
  document.querySelectorAll('[data-lang-btn]').forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-lang-btn') === lang);
  });

  $('themeToggle').setAttribute('aria-label', dict.themeToggleLabel);
  $('themeToggle').setAttribute('title', dict.themeToggleLabel);
  $('convSwap').setAttribute('aria-label', dict.swapLabel);
  $('convSwap').setAttribute('title', dict.swapLabel);
  $('convCopy').setAttribute('aria-label', dict.copyLabel);
  $('convCopy').setAttribute('title', dict.copyLabel);

  updateCheckedLabel();
  updateRangeStatusText();
  updateChartSourceText();
  renderQuotes();
  if (points.length >= 2) draw(false);
  if (eventsReady) {
    updateEventStatus();
    renderEvents();
    experiment();
  }
}

// Event Listeners
$('themeToggle').addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));

document.querySelectorAll('[data-lang-btn]').forEach(btn => {
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('data-lang-btn');
    if (next !== lang) applyLang(next);
  });
});

$('ticker').addEventListener('click', e => {
  const card = e.target.closest('.quote[data-pair]');
  if (card) selectPair(card.dataset.pair);
});
$('ticker').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    const card = e.target.closest('.quote[data-pair]');
    if (card) {
      e.preventDefault();
      selectPair(card.dataset.pair);
    }
  }
});

$('pairs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) selectPair(b.dataset.pair);
});

function syncMaButtons() {
  document.querySelectorAll('#maToggles button[data-ma]').forEach(btn => {
    const active = btn.dataset.ma === '7' ? showMa7 : showMa30;
    btn.classList.toggle('selected', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

$('maToggles').addEventListener('click', e => {
  const btn = e.target.closest('button[data-ma]');
  if (!btn) return;
  if (btn.dataset.ma === '7') {
    showMa7 = !showMa7;
    try { localStorage.setItem('cl_ma7', showMa7 ? '1' : '0'); } catch (err) {}
  } else {
    showMa30 = !showMa30;
    try { localStorage.setItem('cl_ma30', showMa30 ? '1' : '0'); } catch (err) {}
  }
  syncMaButtons();
  if (points.length >= 2) draw(false);
});

$('range').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  requestId++;
  custom = false;
  referencePoints = basePoints;
  points = referencePoints;
  if (points.length) {
    $('eventDate').min = points[0].date;
    $('eventDate').max = points.at(-1).date;
  }
  days = Number(b.dataset.days);
  selectedDate = points.at(-1)?.date || null;
  $('eventDate').value = selectedDate || '';
  lastRangeNote = { type: 'default' };
  updateRangeStatusText();
  document.querySelectorAll('#range button').forEach(x => x.classList.toggle('selected', x === b));
  animateChartNext = true;
  useReference('ref');
  renderEvents();
  loadSeries();
});

$('eventDate').addEventListener('change', e => {
  selectedDate = e.target.value;
  draw(false);
  renderEvents();
  experiment();
});

$('jumpLatest').addEventListener('click', () => {
  if (!points.length) return;
  selectedDate = points.at(-1).date;
  $('eventDate').value = selectedDate;
  draw(false);
  renderEvents();
  experiment();
});

$('refresh').addEventListener('click', refreshSelected);

// Converter interactions
$('convAmount').addEventListener('input', e => {
  let clean = e.target.value.replace(/[^\d.]/g, '');
  const dotIdx = clean.indexOf('.');
  if (dotIdx !== -1) {
    clean = clean.slice(0, dotIdx + 1) + clean.slice(dotIdx + 1).replace(/\./g, '');
  }
  if (clean !== e.target.value) e.target.value = clean;
  renderConverter();
});

$('converterPresets').addEventListener('click', e => {
  const btn = e.target.closest('button[data-amount]');
  if (!btn) return;
  $('convAmount').value = btn.dataset.amount;
  renderConverter();
});

$('convSwap').addEventListener('click', () => {
  convReversed = !convReversed;
  $('convSwap').classList.toggle('swapped', convReversed);
  renderConverter();
});

$('convCopy').addEventListener('click', async () => {
  const val = $('convResult').textContent;
  if (!val || val === '—') return;
  try {
    await navigator.clipboard.writeText(val);
    $('convCopy').classList.add('copied');
    setTimeout(() => $('convCopy').classList.remove('copied'), 1400);
  } catch (e) {}
});

// ResizeObserver to keep SVG typography & geometry razor-sharp
if (typeof ResizeObserver !== 'undefined') {
  let resizeTimer = null;
  new ResizeObserver(() => {
    if (points.length < 2) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => draw(false), 60);
  }).observe($('chart'));
}

// Custom Month Range
const now = new Date(), currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
const earliest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 239, 1));
const earliestMonth = earliest.toISOString().slice(0, 7);
for (const input of [$('fromMonth'), $('toMonth')]) {
  input.min = earliestMonth;
  input.max = currentMonth;
}
$('fromMonth').value = `${now.getUTCFullYear() - 1}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
$('toMonth').value = currentMonth;

$('customRange').addEventListener('submit', async e => {
  e.preventDefault();
  const from = $('fromMonth').value, to = $('toMonth').value;
  if (!from || !to || from > to || from < earliestMonth || to > currentMonth) {
    lastRangeNote = { type: 'invalid' };
    updateRangeStatusText();
    return;
  }
  const id = ++requestId;
  lastRangeNote = { type: 'loading' };
  updateRangeStatusText();
  try {
    const result = await api(`/api/market/history/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (id !== requestId) return;
    if (result.points.length < 2) {
      lastRangeNote = { type: 'insufficient' };
      updateRangeStatusText();
      return;
    }
    custom = true;
    referencePoints = result.points;
    points = referencePoints;
    selectedDate = points.at(-1).date;
    $('eventDate').min = points[0].date;
    $('eventDate').max = points.at(-1).date;
    $('eventDate').value = selectedDate;
    document.querySelectorAll('#range button').forEach(x => x.classList.remove('selected'));
    lastRangeNote = { type: 'loaded', from, to };
    updateRangeStatusText();
    animateChartNext = true;
    useReference('ref');
    renderEvents();
    loadSeries();
  } catch (err) {
    if (id === requestId) {
      lastRangeNote = { type: 'error' };
      updateRangeStatusText();
    }
  }
});

// Initialize
syncMaButtons();
applyTheme(theme);
applyLang(lang);
loadInitialQuotes();
loadHistory();
loadEvents();
