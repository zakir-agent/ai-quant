# 新闻 AI 分析 — 进阶版 Handoff

> 这是一份切换到 Claude Code 继续开发的接力文档。把整个文件喂给 Claude Code，
> 让它从「下一步」开始按顺序做完即可。所有约定（异步、`./dev.sh restart backend`
> 自动重启等）见仓库 `CLAUDE.md` 与 `.cursor/rules/*`。

---

## 任务总览

把每条新闻打成结构化 AI 标签（资产代码 / 方向 / 置信度 / 事件类型 / 时间跨度 /
情绪强度 等），**接入到现有市场分析引擎**，并对新闻信号做 24h 准确率回评。

进度图（✅ 已完成 / ⬜ 待办）：

- ✅ **Step 1** — `news_analysis` 表 + SQLAlchemy 模型 + Alembic 迁移
- ✅ **Step 2** — Pydantic schemas（`NewsAnalysisOutput / NewsAnalysisBatchOutput`）
- ⬜ **Step 3** — Prompts 模板
- ⬜ **Step 4** — `services/news_analyzer.py`（批量分析服务）
- ⬜ **Step 5** — 调度器接入 + collector_health
- ⬜ **Step 6** — API：`GET /api/news/{id}/analysis` + `GET /api/news/aggregate`
- ⬜ **Step 7** — 把聚合信号注入 `analysis/engine` 的 snapshot
- ⬜ **Step 8** — `accuracy_tracker` 扩展，对新闻信号做 24h 回评
- ⬜ **Step 9** — 前端 NewsPanel 4 个角标 + i18n
- ⬜ **Step 10** — 运行迁移、重启后端、跑 lint、写 changelog

---

## 已完成成果速查

### 已落库的字段（模型详见 `backend/app/models/news_analysis.py`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `news_id` | FK news_article | 外键 |
| `prompt_version` | str | 与 news_id 联合唯一，schema 升级时不丢历史 |
| `model_used` | str | LiteLLM 模型名 |
| `status` | str | `done / failed / skipped` |
| `is_actionable` | bool | 模型先判断是否能驱动交易决策 |
| `primary_asset` | str | 主资产（建索引） |
| `assets` | JSON | `[{code, role: primary/secondary}]` |
| `direction` | int | -1 / 0 / 1 |
| `magnitude` | int | 0-100 力度（与方向解耦） |
| `confidence` | float | 0-1 |
| `confidence_reason` | text | 模型解释 |
| `event_type` | str | LISTING/HACK/PARTNERSHIP/UPGRADE/REGULATION/MACRO/FUNDRAISE/TOKEN_UNLOCK/WHALE/EXPLOIT/DELISTING/OPINION/OTHER |
| `time_horizon` | str | IMMEDIATE/INTRADAY/SWING/LONG_TERM |
| `intensity` | int | 0-100 FUD/FOMO 强度 |
| `relevance_score` | int | 0-100 与 primary_asset 的相关程度 |
| `tags` | JSON | 自由 tag 长尾聚合 |
| `raw_quote` | text | 原文关键引用（审计用） |
| `summary_zh` | text | 一句话中文摘要 |
| `raw_output` | JSON | 原始模型 JSON（调试） |
| `error` | text | failed 时记错误 |
| `accuracy` | JSON | 24h 回评结果 |

### Pydantic schema 入口

- `app.analysis.news_schemas.NewsAnalysisOutput` — 单条结构
- `app.analysis.news_schemas.NewsAnalysisBatchOutput` — 批量容器（`{ results: [...] }`）
- `app.analysis.news_schemas.news_batch_json_schema()` — 喂给 `ai_completion(json_schema=...)`
- 常量 `NEWS_PROMPT_VERSION = "news-v1"`

### 已注册的迁移

- 头：`b2c3d4e5f6a7_news_analysis_table.py`（Step 10 才需要 `alembic upgrade head`）

### 复用的现有基础设施

- `app/services/ai_client.py::ai_completion(json_schema=...)` 已支持
  `json_schema → json_object → 文本` 的 graceful degradation
- `app/services/collector_health.py::record_success / record_failure`
- `app/scheduler/jobs.py::_run_with_timeout` 包装超时
- 配置 `settings.ai_fast_model`（默认 `gpt-4o-mini`）— 用便宜模型跑分类
- 配置 `settings.news_sentiment_batch_size`（默认 30）— 当作批大小

---

## 下一步具体实现指引

下面给每个 step 配「目标 / 文件 / 代码骨架 / 验收点」。Claude Code 按顺序做。

---

### ⬜ Step 3 — Prompts 模板

**文件**：`backend/app/analysis/news_prompts.py`（新建）

**目标**：写 system / 批量 user 模板。批一次 20 条左右，喂给 `ai_fast_model`。

**关键点**：
- system prompt 要包含**来源先验可信度表**：
  - high：CoinDesk / Cointelegraph / The Block / Bloomberg / Reuters / 项目方官方公告
  - medium：CoinGecko News、newsapi_* 二线财经、知名加密 KOL
  - low：未知 RSS / 营销内容 / 谣言转载
- 强调：`direction` 和 `magnitude` 解耦；`intensity` 是情绪烈度不是方向
- 让模型遇到无法判断的字段时**保持默认值**而不是编造
- 不要在 prompt 里画 JSON shape — schemas.py 已经管好了

**骨架**：

```python
"""Prompt templates for per-article news AI analysis."""

from __future__ import annotations
import json

NEWS_SYSTEM_PROMPT = """你是一个专业的加密货币新闻分析师，专注于把单条新闻提炼为可被量化策略消费的结构化标签。

判断规则：
1. 资产代码标准化：BTC / ETH / SOL / BNB / XRP / DOGE / ADA / AVAX / LINK / TRX / TON / SUI / ARB / OP / MATIC ...；
   永续/现货后缀（USDT/USDC）一律剥掉；标题中的 "$BTC" 视为 BTC。
2. 方向（direction）：1=利好做多，-1=利空做空，0=中性或不确定。
3. 力度（magnitude，0-100）：与方向解耦 — direction=0 时 magnitude 也应接近 0。
4. 置信度（confidence，0-1）：综合"来源可信度先验"与"语气确定性"。
   - 高可信来源：CoinDesk / Cointelegraph / The Block / Bloomberg / Reuters / 项目方官方公告
   - 中可信来源：CoinGecko News、NewsAPI 主流财经、知名加密 KOL
   - 低可信来源：未知 RSS / 营销内容 / 转载内容
5. 情绪强度（intensity，0-100）：FUD/FOMO 烈度，与方向无关，方向已由 direction 字段表达。
6. 事件类型（event_type）：见 schema enum；不确定写 OTHER，不要编造。
7. 时间跨度（time_horizon）：
   - IMMEDIATE: 黑客/暴雷类，需要立刻反应
   - INTRADAY: 当日内可能兑现
   - SWING: 1-7 天波段
   - LONG_TERM: 周/月级别
8. is_actionable：判断这条新闻是否真的能驱动交易决策；纯八卦/讨论应为 false。
9. raw_quote：从原文（标题或摘要）摘 1 句最关键的话，便于审计。
10. summary_zh：一句话中文摘要，≤60 字。

输出必须严格符合 JSON schema。"""


def build_news_batch_prompt(articles: list[dict]) -> str:
    """``articles``: [{id, source, title, summary, published_at}, ...]"""
    payload = json.dumps(articles, ensure_ascii=False, indent=2)
    return (
        "请分析以下新闻列表，每条返回一个对象（按输入顺序），结果放在 results 数组中：\n\n"
        f"{payload}\n\n"
        "注意：results[i].news_id 必须与输入的 id 完全一致。"
    )
```

**验收**：模块可 import，无语法错误。

---

### ⬜ Step 4 — `services/news_analyzer.py`

**文件**：`backend/app/services/news_analyzer.py`（新建）

**目标**：找未分析（针对当前 `NEWS_PROMPT_VERSION`）的新闻 → 批量调 AI →
解析 → 入库（含状态机和幂等保护）。

**关键点**：
- 跳过 `published_at` 早于 N 天前的旧文章（默认 3 天，避开模型读到失效信息）
- 用 LEFT JOIN 找出 `(news_id, prompt_version)` 不存在 NewsAnalysis 的 NewsArticle
- 一次取 `news_sentiment_batch_size` 条
- 调 `ai_completion(json_schema=news_batch_json_schema(), model=settings.ai_fast_model, temperature=0.1)`
- 用 `NewsAnalysisBatchOutput.model_validate(content)` 严格校验
- 失败时 — 整批未拿到结果就退出；单条 schema 不通过就写 `status="failed"` + `error`
- ON CONFLICT（news_id, prompt_version）DO NOTHING：避免并行调度重复入库
- 返回 `(processed, succeeded, failed)` 三元组日志

**骨架**：

```python
"""Per-article structured AI analysis pipeline.

For every news article we haven't analyzed under the current
``NEWS_PROMPT_VERSION`` we run a fast-model batched LLM call and persist
the structured tags to ``news_analysis``.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import and_, exists, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.analysis.news_prompts import NEWS_SYSTEM_PROMPT, build_news_batch_prompt
from app.analysis.news_schemas import (
    NEWS_PROMPT_VERSION,
    NewsAnalysisBatchOutput,
    NewsAnalysisOutput,
    news_batch_json_schema,
)
from app.config import get_settings
from app.database import async_session
from app.models.news import NewsArticle
from app.models.news_analysis import NewsAnalysis
from app.services.ai_client import AIError, ai_completion

logger = logging.getLogger(__name__)

MAX_AGE_DAYS = 3


async def analyze_pending_news() -> dict:
    """Analyze a single batch of pending articles. Returns counts dict."""
    settings = get_settings()
    batch_size = settings.news_sentiment_batch_size
    cutoff = datetime.now(UTC) - timedelta(days=MAX_AGE_DAYS)

    async with async_session() as session:
        existing = (
            select(NewsAnalysis.news_id)
            .where(NewsAnalysis.prompt_version == NEWS_PROMPT_VERSION)
            .where(NewsAnalysis.news_id == NewsArticle.id)
        )
        stmt = (
            select(NewsArticle)
            .where(NewsArticle.published_at >= cutoff)
            .where(~exists(existing))
            .order_by(NewsArticle.published_at.desc())
            .limit(batch_size)
        )
        articles = (await session.execute(stmt)).scalars().all()

    if not articles:
        return {"processed": 0, "succeeded": 0, "failed": 0}

    payload = [
        {
            "id": a.id,
            "source": a.source,
            "title": a.title,
            "summary": (a.summary or "")[:500],
            "published_at": a.published_at.isoformat() if a.published_at else None,
        }
        for a in articles
    ]
    prompt = build_news_batch_prompt(payload)

    try:
        ai_result = await ai_completion(
            prompt=prompt,
            system=NEWS_SYSTEM_PROMPT,
            model=settings.ai_fast_model,
            temperature=0.1,
            max_tokens=4096,
            json_schema=news_batch_json_schema(),
        )
    except AIError as e:
        logger.exception("News analyzer AI call failed: %s", e)
        return {"processed": 0, "succeeded": 0, "failed": 0}

    content = ai_result["content"]
    used_model = ai_result["model"]

    try:
        batch = NewsAnalysisBatchOutput.model_validate(content)
    except ValidationError:
        logger.warning("News analyzer batch failed schema validation; writing failed rows")
        await _persist_all_failed(articles, used_model, str(content)[:500])
        return {"processed": len(articles), "succeeded": 0, "failed": len(articles)}

    by_id = {item.news_id: item for item in batch.results}

    succeeded = 0
    failed = 0
    async with async_session() as session:
        for article in articles:
            item = by_id.get(article.id)
            if item is None:
                await _insert_failed(session, article.id, used_model, "missing_in_batch")
                failed += 1
                continue
            await _insert_done(session, item, used_model)
            succeeded += 1
        await session.commit()

    logger.info(
        "News analysis batch: processed=%s succeeded=%s failed=%s cost=$%s",
        len(articles), succeeded, failed, ai_result["usage"]["cost_usd"],
    )
    return {"processed": len(articles), "succeeded": succeeded, "failed": failed}


async def _insert_done(session, item: NewsAnalysisOutput, model_used: str) -> None:
    values = {
        "news_id": item.news_id,
        "prompt_version": NEWS_PROMPT_VERSION,
        "model_used": model_used,
        "status": "done",
        "is_actionable": item.is_actionable,
        "primary_asset": item.primary_asset(),
        "assets": [a.model_dump() for a in item.assets],
        "direction": item.direction,
        "magnitude": item.magnitude,
        "confidence": item.confidence,
        "confidence_reason": item.confidence_reason,
        "event_type": item.event_type,
        "time_horizon": item.time_horizon,
        "intensity": item.intensity,
        "relevance_score": item.relevance_score,
        "tags": item.tags,
        "raw_quote": item.raw_quote,
        "summary_zh": item.summary_zh,
        "raw_output": item.model_dump(),
    }
    stmt = pg_insert(NewsAnalysis).values(**values).on_conflict_do_nothing(
        index_elements=["news_id", "prompt_version"]
    )
    await session.execute(stmt)


async def _insert_failed(session, news_id: int, model_used: str, error: str) -> None:
    stmt = (
        pg_insert(NewsAnalysis)
        .values(
            news_id=news_id,
            prompt_version=NEWS_PROMPT_VERSION,
            model_used=model_used,
            status="failed",
            error=error,
        )
        .on_conflict_do_nothing(index_elements=["news_id", "prompt_version"])
    )
    await session.execute(stmt)


async def _persist_all_failed(articles, model_used: str, error: str) -> None:
    async with async_session() as session:
        for a in articles:
            await _insert_failed(session, a.id, model_used, error)
        await session.commit()
```

**验收**：
- `python -c "from app.services.news_analyzer import analyze_pending_news"` 不报错
- 在有现成 news 的 DB 上跑一次 `await analyze_pending_news()`，检查
  `SELECT COUNT(*) FROM news_analysis WHERE status='done'` > 0

---

### ⬜ Step 5 — 调度器接入

**文件**：`backend/app/scheduler/jobs.py`

**目标**：新增 `analyze_news()` 作业，复用 `news_sentiment_interval_minutes`
节奏；可与现有 `tag_news_sentiment`（粗粒度三档情绪）共存。

**改动**：
1. 在文件中靠近 `tag_news_sentiment` 的位置加一个新作业函数：

```python
async def analyze_news_articles():
    """Scheduled job: structured per-article AI tagging."""
    from app.services.collector_health import record_failure, record_success
    from app.services.news_analyzer import analyze_pending_news

    try:
        result = await _run_with_timeout("news_analyzer", analyze_pending_news())
        if result is None:
            return
        if result["processed"]:
            logger.info(
                "Scheduled news analyzer: processed=%(processed)s "
                "succeeded=%(succeeded)s failed=%(failed)s",
                result,
            )
        record_success("news_analyzer")
    except Exception as e:
        logger.exception("Scheduled news analyzer failed")
        record_failure("news_analyzer", str(e))
```

2. 在 `start_scheduler()` 末尾注册（紧跟 `news_sentiment` 那个 `add_job` 之后）：

```python
scheduler.add_job(
    analyze_news_articles,
    trigger=IntervalTrigger(minutes=settings.news_sentiment_interval_minutes),
    id="news_analyzer",
    name="AI per-article news analysis",
    replace_existing=True,
)
```

**验收**：`./dev.sh restart backend` 后 `/api/settings/scheduler` 能看到 `news_analyzer`。

---

### ⬜ Step 6 — API：单条查询 + 聚合

**文件**：`backend/app/api/news.py`（追加）

**目标**：
1. `GET /api/news/{news_id}/analysis` — 返回当前 `NEWS_PROMPT_VERSION` 的分析行
2. `GET /api/news/aggregate?asset=BTC&hours=24` — 按 asset × event_type 聚合的加权信号
3. `POST /api/news/analyze` — 手动触发一批（开发期方便）

**骨架**：

```python
from datetime import UTC, datetime, timedelta
from sqlalchemy import case, func
from app.models.news_analysis import NewsAnalysis
from app.analysis.news_schemas import NEWS_PROMPT_VERSION


@router.get("/{news_id}/analysis")
async def get_news_analysis(news_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(NewsAnalysis)
        .where(
            NewsAnalysis.news_id == news_id,
            NewsAnalysis.prompt_version == NEWS_PROMPT_VERSION,
        )
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return {"analysis": None}
    return {"analysis": _na_to_dict(row)}


@router.get("/aggregate")
async def aggregate_news_signal(
    asset: str | None = Query(None),
    hours: int = Query(24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    """Confidence-weighted directional signal per (asset, event_type)."""
    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    weighted = NewsAnalysis.direction * NewsAnalysis.magnitude * NewsAnalysis.confidence

    stmt = (
        select(
            NewsAnalysis.primary_asset.label("asset"),
            NewsAnalysis.event_type,
            func.count(NewsAnalysis.id).label("count"),
            func.sum(weighted).label("weighted_score"),
            func.avg(NewsAnalysis.intensity).label("avg_intensity"),
            func.avg(NewsAnalysis.confidence).label("avg_confidence"),
        )
        .where(NewsAnalysis.created_at >= cutoff)
        .where(NewsAnalysis.status == "done")
        .group_by(NewsAnalysis.primary_asset, NewsAnalysis.event_type)
    )
    if asset:
        stmt = stmt.where(NewsAnalysis.primary_asset == asset.upper())

    rows = (await db.execute(stmt)).all()
    return {
        "hours": hours,
        "asset": asset,
        "buckets": [
            {
                "asset": r.asset,
                "event_type": r.event_type,
                "count": r.count,
                "weighted_score": float(r.weighted_score or 0),
                "avg_intensity": float(r.avg_intensity or 0),
                "avg_confidence": float(r.avg_confidence or 0),
            }
            for r in rows if r.asset is not None
        ],
    }


@router.post("/analyze")
async def trigger_news_analyzer():
    from app.services.news_analyzer import analyze_pending_news
    return await analyze_pending_news()


def _na_to_dict(r: NewsAnalysis) -> dict:
    return {
        "id": r.id,
        "news_id": r.news_id,
        "status": r.status,
        "is_actionable": r.is_actionable,
        "primary_asset": r.primary_asset,
        "assets": r.assets,
        "direction": r.direction,
        "magnitude": r.magnitude,
        "confidence": r.confidence,
        "confidence_reason": r.confidence_reason,
        "event_type": r.event_type,
        "time_horizon": r.time_horizon,
        "intensity": r.intensity,
        "relevance_score": r.relevance_score,
        "tags": r.tags,
        "raw_quote": r.raw_quote,
        "summary_zh": r.summary_zh,
        "model_used": r.model_used,
        "prompt_version": r.prompt_version,
        "accuracy": r.accuracy,
        "created_at": r.created_at.isoformat(),
    }
```

**验收**：`curl /api/news/{id}/analysis`、`curl /api/news/aggregate?hours=24` 200 OK。

---

### ⬜ Step 7 — 注入到 `analysis/engine`

**文件**：`backend/app/services/data_aggregator.py` + `backend/app/analysis/prompts.py`

**目标**：让市场分析「知道」最近 24h 的新闻方向加权值。

**改动**：

#### 7.1 `data_aggregator.py`：加 `_news_signal()` 函数

```python
async def _news_signal(session: AsyncSession, hours: int = 24) -> list[dict]:
    """Return per-asset confidence-weighted news signal for the last N hours."""
    from app.models.news_analysis import NewsAnalysis  # local import: optional dep

    cutoff = datetime.now(UTC) - timedelta(hours=hours)
    weighted = NewsAnalysis.direction * NewsAnalysis.magnitude * NewsAnalysis.confidence
    stmt = (
        select(
            NewsAnalysis.primary_asset.label("asset"),
            func.count(NewsAnalysis.id).label("count"),
            func.sum(weighted).label("weighted"),
            func.avg(NewsAnalysis.intensity).label("intensity"),
        )
        .where(NewsAnalysis.created_at >= cutoff)
        .where(NewsAnalysis.status == "done")
        .where(NewsAnalysis.is_actionable.is_(True))
        .where(NewsAnalysis.primary_asset.is_not(None))
        .group_by(NewsAnalysis.primary_asset)
        .order_by(func.sum(weighted).desc())
        .limit(15)
    )
    rows = (await session.execute(stmt)).all()
    return [
        {
            "asset": r.asset,
            "news_count": int(r.count),
            "weighted_signal": round(float(r.weighted or 0), 2),
            "avg_intensity": round(float(r.intensity or 0), 1),
        }
        for r in rows
    ]
```

把它接进 `get_latest_snapshot()` 和 `get_symbol_snapshot()`：

- 在 `get_latest_snapshot` 里 `gather` 里加上 `_news_signal(session)`，
  snapshot 增加 `"news_signal": signal`
- 在 `get_symbol_snapshot` 里同样加，但建议 filter `primary_asset == base`

#### 7.2 `prompts.py`：模板里加新闻信号片段

`build_market_prompt`：

```python
f"## 新闻信号（24h 加权）\n{_fmt(snapshot.get('news_signal'))}\n\n"
```

`build_symbol_prompt`：同样加在「相关新闻」之前。

注意更新 `PROMPT_VERSION = "v5"`。

**验收**：跑一次 `POST /api/analysis/run`，新报告的 `data_sources.news_signal` 应该非空。

---

### ⬜ Step 8 — accuracy_tracker 扩展

**文件**：`backend/app/services/accuracy_tracker.py`

**目标**：对每条 `news_analysis`，在 24h 后回查 `primary_asset` 的实际涨跌，写入
`news_analysis.accuracy`，并把汇总加到现有滚动 stats 里。

**实现**：

1. 加一个并行函数 `score_matured_news() -> int`，复用 `_get_price_near()`
2. 评分逻辑：方向是否与 24h 实际方向一致；correct=True/False
3. 跳过 `direction==0` 的中性新闻
4. 在 `score_accuracy` 调度作业里同时调用：

```python
async def score_accuracy():
    from app.services.accuracy_tracker import (
        score_matured_recommendations,
        score_matured_news,
    )
    try:
        await _run_with_timeout("score_accuracy", score_matured_recommendations())
        await _run_with_timeout("score_news_accuracy", score_matured_news())
    except Exception:
        logger.exception("Scheduled accuracy scoring failed")
```

5. `_update_rolling_accuracy` 的输出 dict 加一个 `news` 子字段，给前端额外展示。

**验收**：跑过一次后 `SELECT count(*) FROM news_analysis WHERE accuracy IS NOT NULL` > 0。

---

### ⬜ Step 9 — 前端 NewsPanel 角标 + i18n

**文件**：`frontend/src/components/dashboard/NewsPanel.tsx` +
`frontend/src/lib/api.ts` + `messages/{zh,en}.json`

**目标**：每条新闻显示 4 个小角标：方向 / 事件 / 时间跨度 / 情绪强度。

**改动**：

1. `lib/api.ts` 新增类型：

```ts
export interface NewsAnalysis {
  news_id: number;
  is_actionable: boolean | null;
  primary_asset: string | null;
  direction: -1 | 0 | 1;
  magnitude: number;
  confidence: number;
  event_type: string;
  time_horizon: string;
  intensity: number;
  relevance_score: number;
  summary_zh: string;
  raw_quote: string;
}
export interface NewsItem {
  // ...existing fields
  analysis?: NewsAnalysis | null;
}
export const getNewsAnalysis = (id: number) =>
  apiFetch<{ analysis: NewsAnalysis | null }>(`/api/news/${id}/analysis`);
```

2. 把 `analysis` 一起 join 进 `/api/news/latest` 的返回（在 `api/news.py:get_latest_news`
   里改 SQL：LEFT JOIN news_analysis WHERE prompt_version = current；只附加
   `direction / event_type / time_horizon / intensity / summary_zh`，不发全量）。

3. `NewsPanel.tsx`：在每条卡片底部加 4 个 chip：
   - 方向：上箭头绿 / 下箭头红 / 横线灰
   - 事件：tag 标签 + 颜色
   - 时间跨度：文字 chip（IMMEDIATE/INTRADAY/SWING/LONG_TERM）
   - 情绪强度：进度条 0-100，颜色按 intensity 阶梯

4. i18n 在 `messages/{zh,en}.json` `news` 节点下新增：

```json
"event_LISTING": "上币",
"event_HACK": "黑客攻击",
...
"horizon_INTRADAY": "日内",
...
"intensityLabel": "情绪强度"
```

**验收**：`npm run lint` 通过；首页新闻卡片显示角标。

---

### ⬜ Step 10 — 收尾

**目标**：跑通 + 提交。

```bash
cd backend && alembic upgrade head    # 新表 news_analysis
./dev.sh restart backend              # 加载新调度作业
cd frontend && npm run lint           # 前端检查

# 手动跑一次验证
curl -s -X POST http://localhost:8000/api/news/analyze | python3 -m json.tool
curl -s 'http://localhost:8000/api/news/aggregate?hours=24' | python3 -m json.tool
```

**changelog.md** 「未发布」段顶部加：

```
- 新闻 AI 结构化分析（进阶版）：
  - 新增 news_analysis 表（迁移 b2c3d4e5f6a7），按 (news_id, prompt_version) 唯一，存储 direction/magnitude/confidence/event_type/time_horizon/intensity/relevance/tags/raw_quote/summary_zh 等结构化标签。
  - app/analysis/news_schemas.py + news_prompts.py：用 Pydantic + LiteLLM json_schema 强约束，批量分析喂便宜的 ai_fast_model（默认 gpt-4o-mini），成本远低于全量市场分析。
  - services/news_analyzer.py：批量取未分析新闻 → AI → 入库；状态机 done/failed/skipped；ON CONFLICT DO NOTHING 防并发重复。
  - 调度作业 news_analyzer 复用 news_sentiment_interval_minutes 节奏，挂 collector_health 跟踪。
  - API：GET /api/news/{id}/analysis、GET /api/news/aggregate?asset=&hours=、POST /api/news/analyze（手动触发）。
  - 市场分析引擎接入：snapshot 加 news_signal（24h 加权）字段，prompts 升到 v5；单币种快照按 base 过滤。
  - accuracy_tracker：对新闻信号做 24h 回评，结果写入 news_analysis.accuracy，并入滚动 stats。
  - 前端 NewsPanel 每条加方向/事件/时间跨度/情绪强度 4 个角标；i18n 同步。
```

---

## 一些可能踩的坑（提前提醒）

1. **批量 LLM 输出顺序错位**：模型偶尔会漏返、串号。`news_analyzer.py` 用
   `news_id` 作为 key 索引，输入提示已经强调了「news_id 必须等于输入 id」，但仍有 1-2%
   翻车率，状态写 `failed` 即可，下次扫描会重试。
2. **prompt_version 升级**：以后改字段记得 `NEWS_PROMPT_VERSION = "news-v2"`，
   下次调度自动重跑全部历史新闻；不需要单独迁移。
3. **gpt-4o-mini 不支持 `response_format=json_schema` 严格模式时**，`ai_client`
   已自动降级到 `json_object`，不用担心 — Pydantic 会兜底校验。
4. **Aggregate 接口分母**：`weighted_score` 没有归一化，前端要自己除以 count 才是
   "平均"信号；如果产品要用阈值告警，建议把归一化做在 SQL 端。
5. **新闻表 collected_at 可能远晚于 published_at**：用 `published_at` 决定
   "是否过旧"，用 `created_at`(news_analysis) 做窗口聚合。

---

## 给 Claude Code 的开场提示词

> 我正在继续 ai-quant 项目的「新闻 AI 分析（进阶版）」任务。`docs/news_analysis_handoff.md`
> 是完整的接力文档，请先读它，再按 Step 3 → Step 10 顺序实现。每完成一个 step
> 用 todo 标记，并在最后跑迁移 + 重启后端 + 前端 lint。遵守 `CLAUDE.md` 与
> `.cursor/rules/*` 中的所有规范。
