# DEX 热门交易对来源分 Tab 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在"DEX 热门交易对"面板顶部增加 3 个 Tab（全部 / 热门推广 / 指定搜索），分别展示全量数据、Boosted 采集来源和 Search 采集来源的交易对。

**Architecture:** 采集器在 `collect()` 阶段将两种来源的数据分开存放，`transform()` 分别打上 `dexscreener_boosted` / `dexscreener_search` 标签写入 DB；`DexVolume` UniqueConstraint 加入 `source` 字段使两种来源可独立存储；API 响应暴露 `source`；前端 `DexPanel` 客户端按 source 过滤，SegmentedControl 切换 Tab，无额外请求。

**Tech Stack:** Python/SQLAlchemy/Alembic（后端），Next.js 16 / TypeScript / Tailwind CSS 4（前端）

---

## 文件一览

| 文件 | 操作 |
|---|---|
| `backend/app/models/market.py` | 修改 UniqueConstraint |
| `backend/app/collectors/dexscreener.py` | 修改 collect() / transform() |
| `backend/app/api/market.py` | 响应增加 source 字段 |
| `backend/alembic/versions/c3d4e5f6a789_dex_volume_source_in_uq.py` | 新增 migration |
| `frontend/src/lib/api.ts` | DexPair 加 source 字段 |
| `frontend/src/messages/zh.json` | 新增 dex tab 文案 |
| `frontend/src/messages/en.json` | 新增 dex tab 文案 |
| `frontend/src/components/dashboard/DexPanel.tsx` | 新增 Tab 切换逻辑 |

---

## Task 1：更新 DexVolume 模型的 UniqueConstraint

**Files:**
- Modify: `backend/app/models/market.py:46-48`

- [ ] **Step 1：修改 UniqueConstraint，加入 source 字段**

将 `backend/app/models/market.py` 中 `DexVolume.__table_args__` 改为：

```python
    __table_args__ = (
        UniqueConstraint("source", "chain", "dex", "pair", "timestamp", name="uq_dex_volume"),
    )
```

原来是 `("chain", "dex", "pair", "timestamp", name="uq_dex_volume")`，新增 `"source"` 在最前。

- [ ] **Step 2：确认文件改动正确**

```bash
grep -A2 "uq_dex_volume" backend/app/models/market.py
```

预期输出包含 `"source", "chain", "dex", "pair", "timestamp"`.

- [ ] **Step 3：提交**

```bash
git add backend/app/models/market.py
git commit -m "feat(model): include source in DexVolume unique constraint"
```

---

## Task 2：创建 Alembic migration

**Files:**
- Create: `backend/alembic/versions/c3d4e5f6a789_dex_volume_source_in_uq.py`

- [ ] **Step 1：创建 migration 文件**

创建 `backend/alembic/versions/c3d4e5f6a789_dex_volume_source_in_uq.py`，内容如下：

```python
"""dex_volume: include source in unique constraint

Revision ID: c3d4e5f6a789
Revises: f8a9b0c1d234
Create Date: 2026-04-27

"""

from collections.abc import Sequence

from alembic import op

revision: str = "c3d4e5f6a789"
down_revision: str | None = "f8a9b0c1d234"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("uq_dex_volume", "dex_volume", type_="unique")
    op.create_unique_constraint(
        "uq_dex_volume",
        "dex_volume",
        ["source", "chain", "dex", "pair", "timestamp"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_dex_volume", "dex_volume", type_="unique")
    op.create_unique_constraint(
        "uq_dex_volume",
        "dex_volume",
        ["chain", "dex", "pair", "timestamp"],
    )
```

- [ ] **Step 2：执行 migration**

```bash
cd backend && source venv/bin/activate && alembic upgrade head
```

预期输出末尾包含 `Running upgrade f8a9b0c1d234 -> c3d4e5f6a789`，无报错。

- [ ] **Step 3：提交**

```bash
git add backend/alembic/versions/c3d4e5f6a789_dex_volume_source_in_uq.py
git commit -m "feat(db): include source in DexVolume unique constraint migration"
```

---

## Task 3：更新采集器拆分两种来源

**Files:**
- Modify: `backend/app/collectors/dexscreener.py`

- [ ] **Step 1：修改 collect() 返回分开的两组数据**

将 `collect()` 方法中变量和返回值改为分开收集：

```python
    async def collect(self) -> dict:
        """Fetch top DEX pairs from DexScreener."""
        pairs_boosted: list = []
        pairs_search: list = []
        async with httpx.AsyncClient(timeout=30) as client:
            # Get trending/boosted pairs for broad coverage
            try:
                resp = await client.get(f"{DEXSCREENER_BASE}/token-boosts/top/v1")
                if resp.status_code == 200:
                    boosts = resp.json()
                    for item in boosts[:10]:
                        token_addr = item.get("tokenAddress", "")
                        chain = item.get("chainId", "")
                        if token_addr and chain:
                            try:
                                pair_resp = await client.get(
                                    f"{DEXSCREENER_BASE}/tokens/v1/{chain}/{token_addr}"
                                )
                                if pair_resp.status_code == 200:
                                    pairs_data = pair_resp.json()
                                    if isinstance(pairs_data, list):
                                        pairs_boosted.extend(pairs_data[:3])
                            except Exception:
                                logger.debug(
                                    f"Failed to fetch pairs for {chain}/{token_addr}"
                                )
            except Exception:
                logger.warning("Failed to fetch boosted tokens", exc_info=True)

            # Also search for specific well-known pairs
            for query in self.queries:
                try:
                    resp = await client.get(
                        f"{DEXSCREENER_BASE}/latest/dex/search",
                        params={"q": query},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        pairs = data.get("pairs", [])
                        pairs_search.extend(pairs[:5])
                except Exception:
                    logger.warning(f"Failed to search for {query}", exc_info=True)

        return {
            "pairs_boosted": pairs_boosted,
            "pairs_search": pairs_search,
            "collected_at": datetime.now(UTC).isoformat(),
        }
```

- [ ] **Step 2：修改 transform() 对两组分别打标签**

将 `transform()` 方法完整替换为：

```python
    async def transform(self, raw_data: dict) -> list[dict]:
        """Transform DexScreener pairs into DexVolume records."""
        seen: set[tuple] = set()
        records: list[dict] = []
        now = datetime.now(UTC)

        groups = [
            ("dexscreener_boosted", raw_data.get("pairs_boosted", [])),
            ("dexscreener_search", raw_data.get("pairs_search", [])),
        ]

        for source_value, pairs in groups:
            for pair in pairs:
                chain = pair.get("chainId", "unknown")
                dex = pair.get("dexId", "unknown")
                base = pair.get("baseToken", {}).get("symbol", "?")
                quote = pair.get("quoteToken", {}).get("symbol", "?")
                pair_name = f"{base}/{quote}"

                key = (source_value, chain, dex, pair_name)
                if key in seen:
                    continue
                seen.add(key)

                volume_24h = pair.get("volume", {}).get("h24", 0) or 0
                price_usd = float(pair.get("priceUsd", 0) or 0)
                liquidity = pair.get("liquidity", {}).get("usd", 0) or 0
                txns = pair.get("txns", {}).get("h24", {})
                txns_24h = (txns.get("buys", 0) or 0) + (txns.get("sells", 0) or 0)

                records.append(
                    {
                        "source": source_value,
                        "chain": chain,
                        "dex": dex,
                        "pair": pair_name,
                        "volume_24h": Decimal(str(volume_24h)),
                        "price_usd": Decimal(str(price_usd)),
                        "liquidity_usd": Decimal(str(liquidity)),
                        "txns_24h": txns_24h,
                        "timestamp": now,
                    }
                )
        return records
```

- [ ] **Step 3：提交**

```bash
git add backend/app/collectors/dexscreener.py
git commit -m "feat(collector): tag DEX pairs by collection method (boosted/search)"
```

---

## Task 4：API 暴露 source 字段

**Files:**
- Modify: `backend/app/api/market.py:298-310`

- [ ] **Step 1：在 /api/market/dex 响应中加入 source 字段**

将 `get_dex_data()` 中的 return 语句里，每条记录加上 `"source": r.source`：

```python
    return {
        "data": [
            {
                "source": r.source,
                "chain": r.chain,
                "dex": r.dex,
                "pair": r.pair,
                "volume_24h": float(r.volume_24h),
                "price_usd": float(r.price_usd),
                "liquidity_usd": float(r.liquidity_usd),
                "txns_24h": r.txns_24h,
            }
            for r in rows
        ]
    }
```

- [ ] **Step 2：重启后端并验证 API 返回**

```bash
./dev.sh restart backend
curl -s "http://localhost:8000/api/market/dex?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d['data'][0].keys()))"
```

预期输出包含 `'source'`（若 DB 无数据则返回空 data，正常）。

- [ ] **Step 3：提交**

```bash
git add backend/app/api/market.py
git commit -m "feat(api): expose source field in /api/market/dex response"
```

---

## Task 5：前端类型加 source 字段

**Files:**
- Modify: `frontend/src/lib/api.ts:121-129`

- [ ] **Step 1：DexPair 接口加 source 字段**

将 `frontend/src/lib/api.ts` 中的 `DexPair` 接口改为：

```typescript
export interface DexPair {
  source: string;
  chain: string;
  dex: string;
  pair: string;
  volume_24h: number;
  price_usd: number;
  liquidity_usd: number;
  txns_24h: number;
}
```

- [ ] **Step 2：提交**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): add source field to DexPair interface"
```

---

## Task 6：添加 i18n 文案

**Files:**
- Modify: `frontend/src/messages/zh.json`
- Modify: `frontend/src/messages/en.json`

- [ ] **Step 1：在 zh.json 中新增 dex 节点**

在 `frontend/src/messages/zh.json` 的 `"table"` 节点之前，添加 `"dex"` 节点：

```json
  "dex": {
    "tabAll": "全部",
    "tabBoosted": "热门推广",
    "tabSearch": "指定搜索"
  },
```

完整位置参考：在 `"table": {` 这一行之前插入上述内容。

- [ ] **Step 2：在 en.json 中新增 dex 节点**

在 `frontend/src/messages/en.json` 中同样位置添加：

```json
  "dex": {
    "tabAll": "All",
    "tabBoosted": "Boosted",
    "tabSearch": "Search"
  },
```

- [ ] **Step 3：提交**

```bash
git add frontend/src/messages/zh.json frontend/src/messages/en.json
git commit -m "feat(i18n): add DEX source tab labels"
```

---

## Task 7：DexPanel 加入 Tab 切换

**Files:**
- Modify: `frontend/src/components/dashboard/DexPanel.tsx`

- [ ] **Step 1：添加 SegmentedControl 导入和 Tab 类型**

在文件顶部，将现有 import 区域改为：

```typescript
"use client";

import { useMemo, useState } from "react";
import type { DexPair } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";
import SegmentedControl from "@/components/ui/SegmentedControl";

type DexSortKey = "price_usd" | "volume_24h" | "liquidity_usd" | "txns_24h";
type SortState = { key: DexSortKey; dir: "asc" | "desc" };
type DexTab = "all" | "dexscreener_boosted" | "dexscreener_search";
```

- [ ] **Step 2：在 DexPanel 组件中加入 tab state 和过滤逻辑**

将 `export default function DexPanel` 函数体开头替换为：

```typescript
export default function DexPanel({ pairs }: { pairs: DexPair[] }) {
  const t = useT();
  const [sort, setSort] = useState<SortState>({ key: "volume_24h", dir: "desc" });
  const [activeTab, setActiveTab] = useState<DexTab>("all");

  const tabOptions = [
    { value: "all" as DexTab, label: t("dex.tabAll") },
    { value: "dexscreener_boosted" as DexTab, label: t("dex.tabBoosted") },
    { value: "dexscreener_search" as DexTab, label: t("dex.tabSearch") },
  ];

  const filteredPairs = useMemo(
    () => (activeTab === "all" ? pairs : pairs.filter((p) => p.source === activeTab)),
    [pairs, activeTab]
  );

  const sortedPairs = useMemo(() => {
    const next = [...filteredPairs];
    next.sort((a, b) => {
      const d = a[sort.key] - b[sort.key];
      return sort.dir === "asc" ? d : -d;
    });
    return next;
  }, [filteredPairs, sort]);

  function onHeaderClick(key: DexSortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }
```

- [ ] **Step 3：在空状态和表格外层加入 SegmentedControl**

将 `if (!pairs.length)` 检查及 return JSX 改为：

```typescript
  const sortHint = t("table.dexSortHint");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SegmentedControl
        options={tabOptions}
        value={activeTab}
        onChange={setActiveTab}
        className="self-start"
      />
      {sortedPairs.length === 0 ? (
        <p className="py-8 text-center text-[var(--text-muted)]">{t("table.noDex")}</p>
      ) : (
        <>
          {/* Header sits outside the scroll container so the scrollbar never overlaps it */}
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <DexColgroup />
            <thead>
              <tr>
                <th className={`${thBase} text-left text-[var(--text-muted)]`}>{t("table.pair")}</th>
                <th className={`${thBase} text-left text-[var(--text-muted)]`}>{t("table.chain")}</th>
                <th className={`${thBase} text-left text-[var(--text-muted)]`}>{t("table.dex")}</th>
                <DexSortableTh sort={sort} columnKey="price_usd" right label={t("table.price")} hint={sortHint} onSort={onHeaderClick} />
                <DexSortableTh sort={sort} columnKey="volume_24h" right label={t("table.volume24h")} hint={sortHint} onSort={onHeaderClick} />
                <DexSortableTh sort={sort} columnKey="liquidity_usd" right label={t("table.liquidity")} hint={sortHint} onSort={onHeaderClick} />
                <DexSortableTh sort={sort} columnKey="txns_24h" right label={t("table.txns24h")} hint={sortHint} onSort={onHeaderClick} />
              </tr>
            </thead>
          </table>
          {/* Only the body scrolls — scrollbar stays below the header */}
          <div className="flex-1 overflow-auto">
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <DexColgroup />
              <tbody>
                {sortedPairs.map((p) => (
                  <tr
                    key={`${p.source}-${p.chain}-${p.dex}-${p.pair}`}
                    className="border-b border-[var(--border-primary)]/50 transition-colors hover:bg-[var(--bg-card-hover)]"
                  >
                    <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{p.pair}</td>
                    <td className="py-2 pr-4 text-[var(--text-secondary)]">{p.chain}</td>
                    <td className="py-2 pr-4 text-[var(--text-secondary)]">{p.dex}</td>
                    <td className="py-2 pr-4 text-right font-mono text-[var(--text-primary)]">
                      ${p.price_usd.toFixed(p.price_usd < 1 ? 6 : 2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                      {formatUsd(p.volume_24h)}
                    </td>
                    <td className="py-2 pr-4 text-right text-[var(--text-secondary)]">
                      {formatUsd(p.liquidity_usd)}
                    </td>
                    <td className="py-2 text-right text-[var(--text-muted)]">
                      {p.txns_24h.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
```

注意：原来 `sortedPairs.map` 中的 `key` 从 `` `${p.chain}-${p.dex}-${p.pair}` `` 改为 `` `${p.source}-${p.chain}-${p.dex}-${p.pair}` ``，避免同一交易对在两种来源下 key 重复。原来 `sortedPairs` 现在直接用已定义好的 `sortedPairs` 变量，无需重复定义。

- [ ] **Step 4：运行 lint 确认无报错**

```bash
cd frontend && npm run lint
```

预期：无 error。

- [ ] **Step 5：提交**

```bash
git add frontend/src/components/dashboard/DexPanel.tsx
git commit -m "feat(frontend): add source tabs to DexPanel (all/boosted/search)"
```

---

## Task 8：手动触发采集并验证

- [ ] **Step 1：触发一次手动采集**

在 Settings 页面点击「手动采集」，或：

```bash
curl -s -X POST http://localhost:8000/api/market/collect | python3 -m json.tool
```

等待约 30 秒采集完成。

- [ ] **Step 2：验证 DB 中两种 source 都有数据**

```bash
cd backend && source venv/bin/activate && python3 -c "
import asyncio
from app.database import async_session
from sqlalchemy import select, func
from app.models.market import DexVolume

async def check():
    async with async_session() as s:
        result = await s.execute(
            select(DexVolume.source, func.count()).group_by(DexVolume.source)
        )
        for row in result.all():
            print(row)

asyncio.run(check())
"
```

预期输出包含两行，分别是 `('dexscreener_boosted', N)` 和 `('dexscreener_search', N)`。

- [ ] **Step 3：验证 API 响应含 source 字段**

```bash
curl -s "http://localhost:8000/api/market/dex?limit=3" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for item in d['data']:
    print(item['source'], item['pair'])
"
```

预期：每行包含 `dexscreener_boosted` 或 `dexscreener_search` 以及交易对名称。

- [ ] **Step 4：浏览器验证 Tab 切换**

打开 `http://localhost:3000`，在「DEX 热门交易对」卡片中：
- "全部" Tab 显示全量数据
- "热门推广" Tab 只显示 boosted 来源数据
- "指定搜索" Tab 只显示 search 来源数据
- 切换 Tab 不触发网络请求（Network 面板无新 XHR）

- [ ] **Step 5：更新 changelog 并提交**

在 `changelog.md` 未发布节追加：

```
- DEX 热门交易对：新增「全部 / 热门推广 / 指定搜索」三个 Tab，分别展示全量、Boosted 来源和 Search 来源的交易对；采集器同步拆分两组数据打上不同 source 标签，DB UniqueConstraint 加入 source 字段（需执行 `alembic upgrade head`）。
```

```bash
git add changelog.md
git commit -m "chore: update changelog for DEX tab split feature"
```
