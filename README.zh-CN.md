# CurrencyLens

**将汇率走势与央行事件放在一起查看的货币研究看板。**

简体中文 · [English](README.md)

CurrencyLens 是一个基于 Java 和 Spring Boot 的学习项目，关注美元兑人民币（USD/CNY）、澳元兑人民币（AUD/CNY）和澳元兑美元（AUD/USD）。它结合标明来源的汇率、交互式走势图、历史央行公告和一个简单的事件预测实验。

> **研究原型：**历史数据和公告可能存在延迟或缺漏。相关事件只是供进一步阅读的线索，不代表已证明涨跌原因。当前实验不理解新闻内容，也没有证明预测能力，请勿作为投资建议。

## 功能

- **三组货币对：**展示 USD/CNY、AUD/CNY、AUD/USD，每组标明报价来源和时间。
- **交互式走势图：**悬停查看具体数值，点击日期，标出区间最高和最低值，并可按月份选择最长 20 年的时间范围。
- **按需刷新：**进入页面时加载报价；点击刷新时仅更新选中的货币对，页面不会在后台定时请求。
- **历史事件线索：**查看所选日期附近的澳大利亚储备银行媒体公告和美联储 FOMC 公告，并访问原文。
- **实验性比较：**按时间滚动回测一个基于央行公告是否出现的简单模型，并与上一期涨跌方向基线比较。

## 运行项目

需要 Java 21、网络连接，以及 Windows、macOS 或 Linux。项目自带 Maven Wrapper，首次运行时会下载 Maven。

在项目目录打开 PowerShell：

```powershell
.\mvnw.cmd spring-boot:run
```

macOS / Linux：

```bash
./mvnw spring-boot:run
```

浏览器打开 [http://localhost:8080](http://localhost:8080)。也可以在 Java 开发工具中直接运行 `CurrencylensApplication`。

### 可选：使用 Twelve Data 报价

不设置 Key 时，项目通过 [Frankfurter](https://frankfurter.dev/) 展示 ECB 每日参考汇率。若要使用 [Twelve Data](https://twelvedata.com/) 的报价和历史日线，请申请个人 Key，并在**启动程序的环境中**设置：

```powershell
# Windows PowerShell；请在本地替换占位文字
$env:TWELVE_DATA_API_KEY = 'YOUR_API_KEY'
.\mvnw.cmd spring-boot:run
```

```bash
# macOS / Linux
export TWELVE_DATA_API_KEY='YOUR_API_KEY'
./mvnw spring-boot:run
```

不要将真实 Key 提交到仓库。接口权限、市场覆盖、延迟、额度和展示授权取决于数据商与套餐；部署或再分发数据前，请查看数据商条款。

进入页面时，程序最多请求三组报价以及当前货币对的历史日线；切换货币对或历史区间可能产生额外日线请求，较长区间会分段请求。同一程序实例内，报价缓存 30 秒，日线按货币对和区间缓存 15 分钟。点击刷新只查询选中的报价，不会后台定时刷新。

## 数据来源与限制

| 内容 | 来源和含义 |
| --- | --- |
| 默认汇率 | Frankfurter 提供的 ECB 每日参考汇率，换算成交叉汇率；不是实时交易报价。 |
| 可选报价与走势图 | Twelve Data，权限取决于账户。走势图使用每日收盘价；包含当前日期时会加入最新可用报价。历史数据获取失败时，图表明确提示退回 ECB。 |
| 历史事件 | 最近三个自然年的澳大利亚储备银行媒体公告和美联储 FOMC 公告；暂未覆盖中国官方消息和更广泛的国际新闻。 |
| 事件实验 | 仅判断前 7 天是否出现相关央行公告，排除当日公告，并与简单趋势基线比较；样本可能较少，原始档案也可能发生补录或变更。实验不分析新闻内容或交易成本。 |

图上最高、最低值基于展示的日线和可能包含的当前报价，并非盘中极值。数据商的历史资料也可能变更或暂时不可用。

## 运行测试

```powershell
.\mvnw.cmd test
```

测试包括 Spring 程序启动和使用模拟响应检查 Twelve Data 历史数据处理；各货币对的实际接口权限仍取决于用户账户。

## 技术栈

Java 21 · Spring Boot · Maven · 原生 JavaScript · SVG · jsoup

## 项目状态

这是一个早期个人学习项目。后续可考虑加入中国和更多国际新闻来源、保存可追溯的发布时间，并研究可解释的新闻内容分析。
