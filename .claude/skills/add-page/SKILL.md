---
name: add-page
description: 按照项目 Next.js 规范生成新页面，包含 App Router 页面组件、API 调用、i18n 国际化、Tailwind CSS 样式和 sidebar 导航注册
argument-hint: "<page-name> <description>"
disable-model-invocation: false
allowed-tools: Read, Edit, Write, Glob, Grep
---

# 新建前端页面: $ARGUMENTS

## 项目规范

先阅读 `node_modules/next/dist/docs/` 下与页面路由相关的文档，了解 Next.js 最新约定。

然后阅读以下文件了解现有模式：
- `frontend/src/app/market/page.tsx` — 参考页面（状态管理、API 调用、Tab 切换、组件结构）
- `frontend/src/lib/api.ts` — API 调用函数和 TypeScript 接口
- `frontend/src/messages/zh.json` — 中文 i18n
- `frontend/src/messages/en.json` — 英文 i18n
- `frontend/src/components/ui/Card.tsx` — UI 基础组件
- `frontend/src/components/ui/SegmentedControl.tsx` — Tab 切换组件
- `frontend/src/components/LanguageProvider.tsx` — `useT()` hook

## 生成步骤

1. **添加 API 函数和类型**
   - 在 `frontend/src/lib/api.ts` 中添加 TypeScript interface 和 apiFetch 函数

2. **创建页面** `frontend/src/app/<name>/page.tsx`
   - 文件顶部 `"use client";`
   - 使用 `useT()` 获取翻译函数
   - 使用 `useState` + `useEffect` 管理数据加载
   - 使用 `motion.div` 做页面过渡动画
   - 样式使用 CSS 变量：`var(--text-primary)`, `var(--bg-secondary)`, `var(--border-primary)`, `var(--accent-primary)` 等
   - 布局使用 `max-w-7xl mx-auto space-y-4`

3. **创建子组件**（如需要）
   - 放在 `frontend/src/components/<name>/` 目录
   - 数据展示组件接收 props，不直接调用 API

4. **添加 i18n 翻译**
   - 在 `frontend/src/messages/zh.json` 和 `en.json` 中添加对应的翻译 key
   - 命名空间使用页面名：`"<name>": { "title": "...", ... }`

5. **注册导航**
   - 在 sidebar 组件中添加导航链接

## 代码模板

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Card from "@/components/ui/Card";
import { useT } from "@/components/LanguageProvider";
import { get<Name>Data, type <Name>Item } from "@/lib/api";

export default function <Name>Page() {
  const t = useT();
  const [data, setData] = useState<<Name>Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<Name>Data()
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">
        {t("<name>.title")}
      </h2>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <Card>
          {loading ? (
            <div className="text-[var(--text-muted)]">{t("common.loading")}</div>
          ) : data.length > 0 ? (
            {/* 数据展示 */}
          ) : (
            <div className="text-[var(--text-muted)]">{t("common.noData")}</div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
```

## 检查清单

- [ ] 页面文件在 `frontend/src/app/<name>/page.tsx`
- [ ] 顶部声明 `"use client";`
- [ ] 使用 `useT()` 做国际化（非硬编码文案）
- [ ] 样式使用 CSS 变量（非硬编码颜色）
- [ ] 使用 `motion.div` 做过渡动画
- [ ] API 函数和类型定义在 `api.ts`
- [ ] zh.json 和 en.json 都添加了翻译
- [ ] sidebar 导航已注册
