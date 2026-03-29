# AI Quant 改进记录 — 2026-03-29

本次迭代在 MVP 全部跑通的基础上，完成了改进计划中的 8 个短期 + 3 个中期改进项，以及 2 个 bug 修复，共 14 个 commit，涉及 75 个文件，新增约 3500 行代码。

---

# 短期改进

## 1. 单币种深度分析

**Commit:** `b41b7aa`

### 背景
原有 AI 分析仅支持全市场（scope="market"），无法对单个交易对做深度技术分析。

### 改动

**后端：**

| 文件 | 改动内容 |
|------|----------|
| `backend/app/services/data_aggregator.py` | 新增 `get_symbol_snapshot(symbol)` 函数，拉取指定交易对的多时间框架 OHLCV 数据（1h/48根、4h/30根、1d/30根），并预压缩为统计摘要（high/low/change_pct/avg_volume 等）。同时匹配 DEX 相关交易对和按 symbol 过滤的新闻。 |
| `backend/app/analysis/prompts.py` | 新增 `SYMBOL_SYSTEM_PROMPT` 和 `SYMBOL_ANALYSIS_PROMPT_TEMPLATE`，要求 AI 做多时间框架趋势判断、支撑/阻力位识别，返回 `technical_analysis` 结构（含 trend_1h/4h/1d、support/resistance levels）。新增 `build_symbol_analysis_prompt()` 函数。 |
| `backend/app/analysis/engine.py` | `run_analysis()` 根据 scope 分流：`scope="market"` 走原有逻辑，其他值（如 `"BTC/USDT"`）走 `get_symbol_snapshot` + 单币种 prompt。`technical_analysis` 存入 `data_sources` JSON 字段实现持久化。 |
| `backend/app/api/analysis.py` | `latest` 和 `history` 端点新增返回 `technical_analysis` 字段，从 `data_sources` 中提取。 |

**前端：**

| 文件 | 改动内容 |
|------|----------|
| `frontend/src/lib/api.ts` | `Recommendation` 接口新增 `entry_price` 和可选 `symbol`；`AnalysisReport` 接口新增 `technical_analysis` 类型定义。 |
| `frontend/src/app/analysis/page.tsx` | 标题旁新增交易对选择器（下拉框，数据来自 `getPairs` API）。切换 scope 时自动加载对应历史。详情面板新增技术分析区：1h/4h/1d 趋势箭头、支撑/阻力位、关键观察。建议区域支持显示入场价。 |
| `frontend/src/messages/zh.json` | 新增 5 个 i18n key：marketWide、technicalAnalysis、support、resistance、entry。 |
| `frontend/src/messages/en.json` | 对应英文翻译。 |

### 设计决策
- **scope 格式用交易对**（如 `BTC/USDT`）而非币种名，与 OHLCV 数据库字段直接匹配
- **手动触发为主**，不加入定时任务，按需分析性价比更高
- **数据预压缩**控制 token 成本：每个时间框架只传统计摘要，不传原始 K 线

---

## 2. AI 新闻情感标注

**Commit:** `74b25ef`

### 背景
RSS 来源（CoinDesk、Cointelegraph、TheBlock）的新闻 `sentiment` 字段为 NULL，仅 CryptoPanic 来源有基于社区投票的情感标签。

### 改动

| 文件 | 改动内容 |
|------|----------|
| `backend/app/services/news_sentiment.py`（新建） | 核心服务：查询 `sentiment IS NULL` 的新闻，批量（默认 30 条）发送标题给 AI 进行 positive/negative/neutral 分类，解析返回的 JSON 数组后逐条 UPDATE 回数据库。支持 AI 返回包裹格式（如 `{"results": [...]}`）。 |
| `backend/app/scheduler/jobs.py` | 新增 `tag_news_sentiment()` 定时任务函数，注册为 scheduler job，默认每 30 分钟运行。 |
| `backend/app/api/news.py` | 新增 `POST /api/news/tag-sentiment` 端点，支持手动触发情感标注。 |
| `backend/app/config.py` | 新增 `news_sentiment_interval_minutes`（默认 30）和 `news_sentiment_batch_size`（默认 30）配置项。 |

### 设计决策
- **独立定时任务（方案 B）**而非采集时同步标注，不影响采集流程
- **批量处理**：一次 AI 调用标注多条新闻，token 消耗低（~500 input + ~200 output tokens）
- **Prompt 设计**：系统提示指定从加密货币投资者角度判断情感，只返回 JSON

---

## 3. 分析 Prompt 优化（技术指标引擎）

**Commits:** `e1c0a9a`, `4df2ee2`

### 背景
原有单币种分析只给 AI 提供原始 close 价格序列（`recent_closes`），让 LLM 自行推断技术信号，既不准确也浪费 token。

### 改动

| 文件 | 改动内容 |
|------|----------|
| `backend/app/services/technical_indicators.py`（新建） | 纯 Python 实现，零外部依赖，约 230 行。提供 `compute_indicators(closes, highs, lows, volumes)` 函数，返回指标值 + 信号标签。 |
| `backend/app/services/data_aggregator.py` | `get_symbol_snapshot()` 中 OHLCV 数据 reverse 为 oldest-first 后调用 `compute_indicators()`，将 `indicators` 字段替换原有的 `recent_closes`。空指标结果不注入 prompt。 |
| `backend/app/analysis/prompts.py` | `SYMBOL_SYSTEM_PROMPT` 增加指标使用指导（RSI/MA/MACD/布林带/ATR）。`SYMBOL_ANALYSIS_PROMPT_TEMPLATE` 增加技术指标说明段落。`PROMPT_VERSION` 从 v1 升级为 v2。 |

### 实现的指标

| 指标 | 输出字段 | 信号标签 |
|------|----------|----------|
| RSI(14) | `rsi_14` | `rsi_signal`: overbought / oversold / neutral |
| SMA(7, 25, 50) | `ma_7`, `ma_25`, `ma_50` | `ma_cross`: golden_cross / death_cross / neutral |
| 价格 vs MA | — | `price_vs_ma`: above_all / below_all / mixed |
| MACD(12, 26, 9) | `macd`, `macd_signal`, `macd_histogram` | `macd_trend`: bullish / bearish / neutral |
| 布林带(20, 2) | `bollinger_upper/middle/lower` | `bollinger_pct`: 价格在带中的位置 (0-1) |
| ATR(14) | `atr_14` | — |
| 量比 | `volume_ratio` | 当前成交量 / 20 日均量 |

### 设计决策
- **纯手写而非 pandas-ta**：只需 5 个指标，手写约 200 行，避免引入 pandas 重依赖
- **信号标签**：每个数值指标附带文字标签（如 `rsi_signal: "overbought"`），LLM 无需理解数字也能利用
- **MA(99) 改为 MA(50)**：1h 取 48 根、4h/1d 取 30 根，MA(99) 永远算不出来，MA(50) 更实用
- **空指标不注入 prompt**：数据不足时跳过 `indicators` 字段，避免空对象干扰 AI
- **Token 影响**：每个时间框架增加 ~200 tokens 指标数据，净增约 400 tokens（扣除移除的 recent_closes）

---

## 4. 采集失败告警

**Commit:** `48640d0`

### 背景
各 collector（CEX、CoinGecko、DexScreener 等）定时采集失败时仅记日志，用户无法在前端感知数据中断。

### 改动

| 文件 | 改动内容 |
|------|----------|
| `backend/app/services/collector_health.py`（新建） | 内存中维护 `CollectorStatus` 注册表，记录每个 collector 的连续失败次数、最后成功/失败时间、最后错误信息。3 次连续失败触发 alert 状态。 |
| `backend/app/collectors/base.py` | `run()` 方法成功时调 `record_success()`，失败时调 `record_failure()`。 |
| `backend/app/scheduler/jobs.py` | `run_ai_analysis` 和 `tag_news_sentiment` 也接入健康追踪。 |
| `backend/app/api/settings.py` | `/api/settings/status` 响应新增 `collector_health` 字段。 |
| `frontend/src/app/settings/page.tsx` | Settings 页面新增 "采集器健康状态" 卡片，用绿/黄/红状态点展示各 collector 健康状况。 |

### 设计决策
- **内存方案**而非 DB 表：采集失败是实时状态，重启后归零合理，避免迁移复杂度
- **3 次阈值**：默认采集间隔 15-30 分钟，3 次连续失败约 45-90 分钟无数据
- **单级告警**：个人项目不需要 warning/critical 分级

---

## 5. 数据完整性检查

**Commit:** `48640d0`（与采集失败告警同一 commit）

### 背景
OHLCV 数据可能因采集中断或交易所 API 故障产生缺口，用户无法知道数据是否完整。

### 改动

| 文件 | 改动内容 |
|------|----------|
| `backend/app/api/market.py` | 新增 `GET /api/market/integrity` 端点。按 symbol/exchange/timeframe/days 查询，比较预期 K 线数 vs 实际数计算完整率，检测相邻 K 线间隔超过 1.5 倍周期的缺口。 |
| `frontend/src/lib/api.ts` | 新增 `DataIntegrity` 类型和 `getDataIntegrity()` API 调用。 |
| `frontend/src/app/settings/page.tsx` | Settings 页面新增 "数据完整性" 卡片，展示 BTC/USDT 1h 最近 7 天的完整率百分比和缺口详情。 |
| `frontend/src/messages/zh.json` / `en.json` | 新增 9 个 i18n key。 |

### 设计决策
- **按需查询**而非定时任务：数据量不大，实时计算可行
- **缺口检测阈值**：相邻 K 线间隔 > 1.5 倍周期即为缺口
- Settings 页面展示，K 线图标记缺口作为后续增强

---

## 6. AI Client 模型路由修复

**Commits:** `e9ce16c`

### 背景
当仅配置 OpenRouter（custom endpoint）而无标准 Anthropic/OpenAI API key 时，primary 模型调用失败后，fallback 模型（如 `gpt-4o`）错误地路由到标准 OpenAI 端点，导致 401 认证错误。

### 改动

| 文件 | 改动内容 |
|------|----------|
| `backend/app/services/ai_client.py` | **`_configure_keys()`**：移除了将 `ai_custom_api_key` 设置为 `OPENAI_API_KEY` 环境变量的逻辑。Custom endpoint key 通过 `_resolve_model` 的 `extra_kwargs` 显式传递，无需污染环境变量。**`_resolve_model()`**：重构为清晰的决策树。新增 `has_standard_keys` 检测：当无标准 API key 且有 custom endpoint 时，所有模型（包括 fallback）都路由到 custom endpoint。 |

### 路由逻辑（重构后）
1. `model="custom"` → custom endpoint，使用 `ai_custom_model`
2. model 匹配 `ai_custom_model` → custom endpoint
3. 无标准 API key 但有 custom endpoint → 所有模型走 custom endpoint
4. 否则 → 标准 provider（Anthropic/OpenAI）

---

# 中期改进

## 7. 告警/通知系统

**Commit:** `839d3e4`

### 背景
市场异动、采集器故障等事件发生时，用户只能打开网页查看，无法在手机上实时收到通知。

### 改动

| 文件 | 改动内容 |
|------|----------|
| `backend/app/services/alerting.py`（新建） | 核心通知服务，约 100 行。支持 Telegram Bot API 和通用 Webhook 两个渠道。内存冷却机制按 event_type 分别控制，默认 30 分钟内不重复发送同类通知。MarkdownV2 格式发送 Telegram 消息。 |
| `backend/app/config.py` | 新增 7 个配置项：`alert_enabled`、`telegram_bot_token`、`telegram_chat_id`、`alert_webhook_url`、`alert_price_change_pct`（默认 5%）、`alert_sentiment_delta`（默认 30）、`alert_cooldown_minutes`（默认 30）。 |
| `backend/app/services/collector_health.py` | `record_failure()` 达到告警阈值时异步调用 `notify()`；`record_success()` 从告警状态恢复时发送 "已恢复" 通知。 |
| `backend/app/scheduler/jobs.py` | AI 分析完成后，risk_level=high 或情感分数绝对值超阈值时发送通知。CoinGecko 采集后检查价格 24h 变动是否超阈值（默认 5%），超过则发送价格异动通知。 |

### 触发事件

| 事件 | event_type 格式 | 触发条件 |
|------|-----------------|----------|
| 采集器故障 | `collector_{name}_down` | 连续失败 >= 3 次 |
| 采集器恢复 | `collector_{name}_recovered` | 从告警状态恢复 |
| AI 分析高风险 | `analysis_alert` | risk_level=high 或 sentiment 绝对值 >= 30 |
| 价格异动 | `price_{SYMBOL}_{direction}` | 24h 涨跌幅 >= 5% |

### 设计决策
- **Telegram + Webhook 双渠道**：Telegram 个人最实用，Webhook 可对接 Slack/Discord/钉钉
- **直接用 httpx 调 Telegram API**，不引入 `python-telegram-bot` 库
- **`.env` 配置**，不做运行时可配
- **冷却机制防轰炸**：按 event_type 独立冷却，进程重启后重置

---

## 8. K 线图叠加技术指标

**Commit:** `b5e4ba8`

### 背景
后端已能计算 RSI、MA、MACD、布林带等指标（短期改进第 3 项），但仅用于 AI 分析的 prompt 上下文，前端 K 线图没有可视化展示。

### 改动

**后端：**

| 文件 | 改动内容 |
|------|----------|
| `backend/app/services/technical_indicators.py` | 新增 `compute_indicator_series()` 函数和配套的 `_sma_series()`、`_rsi_series()`、`_bollinger_series()`、`_macd_series()` 函数。返回与输入等长的时间对齐数组（None 填充不足部分），供前端逐点绑定到 K 线图。 |
| `backend/app/api/market.py` | `/api/market/kline` 端点新增可选参数 `indicators`（逗号分隔，如 `ma,rsi,macd,bollinger`）。有值时计算指标序列，以 `{name: [{time, value}]}` 格式附在响应的 `indicators` 字段中。 |

**前端：**

| 文件 | 改动内容 |
|------|----------|
| `frontend/src/components/charts/KlineChart.tsx` | 重构，新增 `indicators` 和 `activeIndicators` 属性。主图叠加 MA 线（3 条不同颜色）和布林带（上/中/下轨线）。RSI 和 MACD 通过独立 `priceScaleId` + `scaleMargins` 实现子图效果。RSI 子图添加 30/70 参考线，MACD 子图包含 MACD 线 + 信号线 + 柱状图。图表高度根据启用的子图动态增加。 |
| `frontend/src/lib/api.ts` | 新增 `IndicatorSeries` 和 `KlineWithIndicators` 类型，`getKline()` 支持传 `indicators` 参数。 |
| `frontend/src/app/page.tsx` | Dashboard 页面新增指标状态管理和 toggle 按钮组（MA/BOLLINGER/RSI/MACD），默认启用 MA。 |
| `frontend/src/app/market/page.tsx` | Market 页面同上。 |

### 指标叠加方式

| 指标 | 位置 | 图形类型 | 颜色 |
|------|------|----------|------|
| MA(7) | 主图 | LineSeries | 橙色 #f59e0b |
| MA(25) | 主图 | LineSeries | 蓝色 #3b82f6 |
| MA(50) | 主图 | LineSeries | 紫色 #a855f7 |
| 布林带上/中/下轨 | 主图 | LineSeries | 蓝色半透明 |
| RSI(14) | 子图 | LineSeries + 30/70 参考线 | 橙色 |
| MACD + 信号线 | 子图 | LineSeries x2 | 蓝色 + 红色 |
| MACD 柱状图 | 子图 | HistogramSeries | 绿色/红色 |

### 设计决策
- **后端计算 + API 返回**而非前端计算，保持前后端一致性
- **一个请求返回 K 线 + 指标**，减少网络往返
- **Toggle 按钮**控制显示/隐藏，切换指标触发重新 fetch（因为指标数据按需计算）
- **动态高度**：基础 400px + 每个子图 120px

---

## 9. 多时间框架联动

**Commit:** `57baff7`

### 背景
用户需要同时对比 1h/4h/1d 走势以判断多级别趋势一致性，但现有界面只能单选一个时间框架查看。

### 改动

| 文件 | 改动内容 |
|------|----------|
| `frontend/src/components/charts/MultiTimeframeChart.tsx`（新建） | 新组件，并行加载 1h/4h/1d 三个时间框架的 K 线和指标数据（`Promise.allSettled`），用 CSS grid 并排渲染三个独立的 KlineChart。每个图上方标注 symbol 和 timeframe。响应式布局：桌面端 `grid-cols-3`，移动端 `grid-cols-1` 纵向堆叠。 |
| `frontend/src/app/market/page.tsx` | K 线 tab 工具栏新增 "多框架" toggle 按钮。启用时隐藏单图和 timeframe 选择器，显示 MultiTimeframeChart；关闭时恢复单图模式。指标 toggle 在两种模式下共享。 |
| `frontend/src/messages/zh.json` / `en.json` | 新增 `market.multiTimeframe` i18n key。 |

### 设计决策
- **并排三图**而非标签切换或叠加：一目了然，最符合多级别分析习惯
- **放在 Market 页面**：Dashboard 已满，不单建新页
- **并行请求**：三个 timeframe 各 200 根 K 线同时加载，总耗时等于最慢的一个
- **纯前端改动**：后端已有的 `/api/market/kline` 接口完全够用

---

# 文件变更总览

```
新增文件 (4):
  backend/app/services/alerting.py              100 行  告警通知服务
  backend/app/services/collector_health.py       85 行  采集器健康追踪
  backend/app/services/news_sentiment.py        113 行  新闻情感标注服务
  backend/app/services/technical_indicators.py   380 行  技术指标计算引擎（标量+序列）
  frontend/src/components/charts/MultiTimeframeChart.tsx  100 行  多时间框架图表组件

修改文件 (主要):
  backend/app/analysis/engine.py               scope 分流逻辑
  backend/app/analysis/prompts.py              单币种 prompt + 指标说明 + v2
  backend/app/api/analysis.py                  返回 technical_analysis
  backend/app/api/market.py                    指标序列 + 数据完整性
  backend/app/api/news.py                      手动标注端点
  backend/app/api/settings.py                  collector_health
  backend/app/collectors/base.py               健康追踪接入
  backend/app/config.py                        情感标注 + 告警配置项
  backend/app/scheduler/jobs.py                情感标注 + 告警 + 健康追踪
  backend/app/services/ai_client.py            模型路由重构
  backend/app/services/data_aggregator.py      symbol snapshot + 指标集成
  frontend/src/app/analysis/page.tsx           scope 选择器 + 技术分析面板
  frontend/src/app/market/page.tsx             指标 toggle + 多框架模式
  frontend/src/app/page.tsx                    指标 toggle
  frontend/src/app/settings/page.tsx           健康 + 完整性卡片
  frontend/src/components/charts/KlineChart.tsx  指标叠加重构
  frontend/src/lib/api.ts                      类型定义更新

总计: 75 文件, +3492 行, -628 行 (含 linter 格式化)
```

---

# 新增 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/news/tag-sentiment` | 手动触发 AI 新闻情感标注 |
| GET | `/api/market/integrity` | OHLCV 数据完整性检查 |

# 修改的 API 行为

| 端点 | 变化 |
|------|------|
| `POST /api/analysis/run?scope=BTC/USDT` | 支持传入交易对进行单币种分析 |
| `GET /api/analysis/latest?scope=BTC/USDT` | 返回新增 `technical_analysis` 字段 |
| `GET /api/analysis/history?scope=BTC/USDT` | 同上 |
| `GET /api/market/kline?indicators=ma,rsi` | 可选附带技术指标时间序列 |
| `GET /api/settings/status` | 新增 `collector_health` 字段 |

# 新增配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `NEWS_SENTIMENT_INTERVAL_MINUTES` | 30 | 情感标注定时任务间隔 |
| `NEWS_SENTIMENT_BATCH_SIZE` | 30 | 每次标注最大新闻条数 |
| `ALERT_ENABLED` | true | 通知总开关 |
| `TELEGRAM_BOT_TOKEN` | "" | Telegram Bot Token |
| `TELEGRAM_CHAT_ID` | "" | Telegram Chat ID |
| `ALERT_WEBHOOK_URL` | "" | 通用 Webhook URL |
| `ALERT_PRICE_CHANGE_PCT` | 5.0 | 价格变动告警阈值（%） |
| `ALERT_SENTIMENT_DELTA` | 30 | 情感分数变化告警阈值 |
| `ALERT_COOLDOWN_MINUTES` | 30 | 同类通知冷却时间（分钟） |

# 数据库变更

无。所有新数据存储复用现有的 JSON 字段（`data_sources`、`sentiment`）和内存状态，无需 Alembic 迁移。
