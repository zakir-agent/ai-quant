---
name: add-api
description: 按照项目 FastAPI 规范生成新的 API 路由模块，包含 APIRouter、Query 参数、数据库查询、Pydantic schema 和注册到 main.py
argument-hint: "<module-name> <description>"
disable-model-invocation: false
allowed-tools: Read, Edit, Write, Glob, Grep
---

# 新建 API 路由: $ARGUMENTS

## 项目规范

先阅读以下文件了解现有模式：
- `backend/app/api/market.py` — 参考实现（Query 参数、db 依赖注入、响应格式）
- `backend/app/api/analysis.py` — 另一个参考
- `backend/app/main.py` — 路由注册位置
- `backend/app/database.py` — `get_db` 依赖
- `backend/app/config.py` — `get_settings` 配置

## 生成步骤

1. **创建路由文件** `backend/app/api/<name>.py`
   - 使用 `APIRouter(prefix="/api/<name>", tags=["<name>"])`
   - 所有函数使用 `async def`
   - 使用 `Query()` 声明参数（带 description）
   - 数据库会话通过 `Depends(get_db)` 注入
   - 返回 dict（FastAPI 自动序列化），不用 Pydantic response model

2. **注册路由** 在 `backend/app/main.py`
   - `from app.api.<name> import router as <name>_router`
   - `app.include_router(<name>_router)`

3. **添加前端 API 函数**（可选）
   - 在 `frontend/src/lib/api.ts` 中添加对应的 TypeScript 接口和 fetch 函数

## 代码模板

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.<module> import <Model>

router = APIRouter(prefix="/api/<name>", tags=["<name>"])


@router.get("/list")
async def get_<name>_list(
    limit: int = Query(20, ge=1, le=100, description="Number of records"),
    db: AsyncSession = Depends(get_db),
):
    """Get <name> list."""
    stmt = select(<Model>).order_by(<Model>.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return {
        "data": [
            {
                # map fields
            }
            for r in rows
        ]
    }
```

## 检查清单

- [ ] 使用 `APIRouter` 带 prefix 和 tags
- [ ] 所有处理函数 `async def`
- [ ] Query 参数带 description 和合理的默认值/范围
- [ ] 数据库依赖通过 `Depends(get_db)` 注入
- [ ] float() 转换 Decimal 字段
- [ ] 路由已注册到 main.py
- [ ] 错误场景使用 `HTTPException`
