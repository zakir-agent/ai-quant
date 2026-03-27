# Alembic 数据库迁移指南

## 为什么使用 Alembic

本项目使用 SQLAlchemy ORM 定义数据模型，数据库表结构的变更需要一种可靠的方式同步到实际数据库。Alembic 就是解决这个问题的工具。

### 没有 Alembic 的痛点

- 新增字段、改表结构需要手写 SQL，容易遗漏或出错
- 多人协作时，各自改了不同的表，合并后不知道数据库该执行哪些变更
- 线上数据库和本地数据库结构不一致，排查问题困难
- 操作失误后无法回退

### Alembic 解决了什么

| 能力 | 说明 |
|------|------|
| 自动生成迁移 | 对比 Python 模型和数据库现状，自动生成 DDL 脚本 |
| 版本链管理 | 每次变更生成一个版本文件，按顺序执行，不会遗漏 |
| 环境同步 | 全新数据库跑一次 `upgrade head`，所有表自动创建 |
| 可回退 | 支持 `downgrade` 回退到任意历史版本 |
| 可审计 | 迁移文件提交到 Git，谁改了什么一目了然 |

## 项目结构

```
backend/
├── alembic.ini              # Alembic 配置（数据库连接串）
├── alembic/
│   ├── env.py               # 迁移运行环境（加载模型、连接数据库）
│   ├── script.py.mako       # 迁移文件模板
│   └── versions/            # 所有迁移文件（按版本号命名）
│       └── cb39399457bb_init_tables.py
└── app/
    └── models/              # SQLAlchemy 模型定义
        ├── market.py        # OHLCVData, DexVolume, DefiMetric
        ├── analysis.py      # AnalysisReport
        └── news.py          # NewsArticle
```

## 工作流程

### 整体流程

```
修改 Python 模型 → 生成迁移文件 → 审查迁移内容 → 执行迁移 → 提交到 Git
```

### 前置准备

```bash
cd backend
source .venv/bin/activate  # 激活虚拟环境
```

所有 alembic 命令都需要在 `backend/` 目录下执行，并设置 `PYTHONPATH=.`：

```bash
PYTHONPATH=. alembic <命令>
```

### 1. 全新数据库初始化

拿到一个空的数据库（比如新建的 Supabase 项目），只需一条命令：

```bash
PYTHONPATH=. alembic upgrade head
```

Alembic 会按顺序执行 `versions/` 下的所有迁移文件，从零创建全部表。

### 2. 修改表结构

假设需要给 `ohlcv_data` 表新增一个 `source` 字段：

**第一步：修改模型**

```python
# app/models/market.py
class OHLCVData(Base):
    __tablename__ = "ohlcv_data"
    # ... 已有字段 ...
    source: Mapped[str] = mapped_column(String(32), nullable=True)  # 新增
```

**第二步：生成迁移**

```bash
PYTHONPATH=. alembic revision --autogenerate -m "add source to ohlcv"
```

Alembic 对比模型和数据库，在 `versions/` 下生成一个新文件，内容类似：

```python
def upgrade():
    op.add_column('ohlcv_data', sa.Column('source', sa.String(32), nullable=True))

def downgrade():
    op.drop_column('ohlcv_data', 'source')
```

**第三步：审查迁移文件**

打开生成的文件检查内容是否正确。自动生成偶尔会遗漏或误判，尤其是：
- 重命名字段（会被识别为删除 + 新增）
- 数据迁移（需要手动补充 UPDATE 语句）

**第四步：执行迁移**

```bash
PYTHONPATH=. alembic upgrade head
```

**第五步：提交到 Git**

```bash
git add alembic/versions/ app/models/
git commit -m "add source column to ohlcv_data"
```

### 3. 回退迁移

```bash
# 回退一个版本
PYTHONPATH=. alembic downgrade -1

# 回退到指定版本
PYTHONPATH=. alembic downgrade cb39399457bb

# 回退所有（清空全部表）
PYTHONPATH=. alembic downgrade base
```

## 常用命令速查

| 命令 | 用途 |
|------|------|
| `alembic current` | 查看数据库当前版本 |
| `alembic history` | 查看所有迁移历史 |
| `alembic heads` | 查看最新迁移版本号 |
| `alembic revision --autogenerate -m "描述"` | 自动生成迁移文件 |
| `alembic revision -m "描述"` | 生成空白迁移文件（手动编写） |
| `alembic upgrade head` | 执行到最新版本 |
| `alembic upgrade +1` | 向前执行一个版本 |
| `alembic downgrade -1` | 回退一个版本 |
| `alembic downgrade base` | 回退全部 |

## 注意事项

1. **先改模型，再生成迁移**。不要手动修改数据库表结构，否则 Alembic 会检测到差异并生成多余的迁移
2. **迁移文件必须提交到 Git**。这样其他人或部署环境才能同步表结构
3. **生产环境慎用 downgrade**。回退可能丢失数据，建议通过新增迁移来修复问题
4. **`--autogenerate` 不是万能的**。它无法检测：表/列重命名、数据迁移、存储过程变更。这些场景需要手动编写迁移
5. **连接串配置在 `alembic.ini`**。切换数据库时记得同步修改
