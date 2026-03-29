---
name: add-collector
description: 按照项目现有 BaseCollector 模式生成新的数据采集器，包含 collect/transform/store 三步管道、upsert 入库、错误处理和调度注册
argument-hint: "<collector-name> <data-source-description>"
disable-model-invocation: false
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

# 新建数据采集器: $ARGUMENTS

## 项目规范

先阅读以下文件了解现有模式：
- `backend/app/collectors/base.py` — BaseCollector 基类（collect → transform → store 管道）
- `backend/app/collectors/cex.py` — 参考实现（ccxt 采集器）
- `backend/app/models/market.py` — 现有数据模型
- `backend/app/scheduler/jobs.py` — 调度任务注册

## 生成步骤

1. **创建数据模型**（如需要）
   - 在 `backend/app/models/` 中添加 SQLAlchemy 模型
   - 使用 `Decimal` 存储金额，`datetime` 使用 UTC
   - 添加 UNIQUE 约束和索引
   - 生成 Alembic 迁移：`PYTHONPATH=. alembic revision --autogenerate -m "add xxx table"`

2. **创建采集器** `backend/app/collectors/<name>.py`
   - 继承 `BaseCollector`
   - 实现 `name` 属性、`collect()`、`transform()`、`store()` 三个方法
   - `collect()`: 使用 `httpx.AsyncClient` 调用外部 API，指数退避重试（最多 3 次）
   - `transform()`: 将原始数据转为 dict 列表（与模型字段对应）
   - `store()`: 使用 `pg_insert().on_conflict_do_update()` 做 upsert
   - 使用 `from app.database import async_session` 获取数据库会话
   - 使用 `logging.getLogger(__name__)` 记录日志

3. **注册到调度器**
   - 在 `backend/app/scheduler/jobs.py` 中添加定时任务
   - 在 `backend/app/api/market.py` 的 `trigger_collection()` 中注册手动触发

4. **添加依赖**（如需要）
   - 更新 `backend/requirements.txt`

## 代码模板

```python
"""<Name> collector — <description>."""

import logging
from datetime import datetime, timezone
from decimal import Decimal

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.collectors.base import BaseCollector
from app.database import async_session
from app.models.<module> import <Model>

logger = logging.getLogger(__name__)


class <Name>Collector(BaseCollector):
    name = "<name>"

    async def collect(self) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get("<api_url>")
            resp.raise_for_status()
            return resp.json()

    async def transform(self, raw_data: dict) -> list[dict]:
        records = []
        for item in raw_data:
            records.append({
                # map fields
                "timestamp": datetime.now(timezone.utc),
            })
        return records

    async def store(self, records: list[dict]) -> int:
        if not records:
            return 0
        async with async_session() as session:
            stmt = pg_insert(<Model>).values(records)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_<name>",
                set_={...},
            )
            await session.execute(stmt)
            await session.commit()
        return len(records)
```

## 检查清单

- [ ] 采集器继承 BaseCollector 并实现三个抽象方法
- [ ] 使用 async/await + httpx（非 requests）
- [ ] Decimal 存金额，datetime 用 UTC
- [ ] upsert 处理重复数据
- [ ] 日志使用 logger（非 print）
- [ ] 注册到 scheduler 和手动触发接口
- [ ] 如需 API Key，在 config.py 和 .env.example 中添加配置
