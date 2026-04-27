# DEX 热门交易对来源分 Tab

**日期**: 2026-04-27  
**状态**: 已批准

## 背景

DexScreener 采集器通过两种方式获取热门交易对：
1. **Boosted**：调用 `/token-boosts/top/v1` 获取平台推广热门代币，再查询其交易对
2. **Search**：按预设列表（WETH/USDC、SOL/USDC 等）调用 `/latest/dex/search` 搜索

当前所有记录的 `source` 字段均为 `"dexscreener"`，两种来源无法区分。需在 DB、API、前端三层打通来源标签，并在前端展示为独立 Tab。

## 方案

一次取全量数据，前端按 `source` 字段客户端过滤，Tab 切换无网络请求。

## 变更范围

### 后端

**`backend/app/collectors/dexscreener.py`**
- `collect()` 返回结构改为 `{"pairs_boosted": [...], "pairs_search": [...], "collected_at": ...}`
- `transform()` 对 `pairs_boosted` 设 `source = "dexscreener_boosted"`，对 `pairs_search` 设 `source = "dexscreener_search"`

**`backend/app/models/market.py`**
- `DexVolume.UniqueConstraint` 从 `(chain, dex, pair, timestamp)` 改为 `(source, chain, dex, pair, timestamp)`，约束名保持 `uq_dex_volume`

**Alembic migration**（新文件）
- 删除旧约束 `uq_dex_volume`
- 创建新约束 `uq_dex_volume`，字段为 `(source, chain, dex, pair, timestamp)`

**`backend/app/api/market.py`**
- `/api/market/dex` 响应的每条记录加上 `source` 字段（字符串）
- 不加服务端 source 过滤参数（由前端客户端过滤）

### 前端

**`frontend/src/lib/api.ts`**
- `DexPair` 接口新增 `source: string`

**`frontend/src/components/dashboard/DexPanel.tsx`**
- 顶部加 `SegmentedControl`，3 个选项：全部 / 热门推广 / 指定搜索
- 内部 state `activeTab`，按 `source` 字段过滤 `pairs` prop
- 默认 Tab：全部

**`frontend/src/messages/zh.json` 和 `en.json`**

新增 key：

| key | 中文 | 英文 |
|---|---|---|
| `dex.tabAll` | 全部 | All |
| `dex.tabBoosted` | 热门推广 | Boosted |
| `dex.tabSearch` | 指定搜索 | Search |

## 数据流

```
DexScreenerCollector.collect()
  → { pairs_boosted: [...], pairs_search: [...] }
  ↓
transform()
  → source = "dexscreener_boosted" / "dexscreener_search"
  ↓
DexVolume 表（unique on source+chain+dex+pair+timestamp）
  ↓
GET /api/market/dex → { data: [..., source: string] }
  ↓
DexPanel（client-side filter by source）
  → Tab: 全部 / 热门推广 / 指定搜索
```

## 不在范围内

- Market 页面的链过滤下拉不变
- Dashboard 卡片标题不变
- 不新增 API 端点
