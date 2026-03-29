# Frontend Error Handling Design

## Overview

Add structured error handling to the frontend: Next.js error boundaries, toast notifications (sonner), and inline error components with retry support.

## 1. Next.js Error Boundaries

### `app/global-error.tsx`
- Catches root layout level fatal errors
- Shows "System Error" message with refresh button
- Must be a client component with its own `<html>` and `<body>` tags (Next.js requirement)

### `app/error.tsx`
- Catches page-level runtime errors
- Shows error message + retry button (calls `reset()`)
- Styled with project CSS variables

## 2. Toast Notifications (sonner)

- Install `sonner` package
- Add `<Toaster />` in `app/layout.tsx`, positioned top-right
- Theme: follows project dark/light mode via CSS variable overrides
- Usage: `toast.error(message)` for user-triggered action failures

### Where to use toast:
- `dashboard/AnalysisPanel.tsx` — analysis run failure (replace inline error state)
- `app/page.tsx` — manual collection trigger failure (replace `collectResult` error state)
- `app/settings/page.tsx` — settings save failure
- `app/analysis/page.tsx` — analysis trigger failure

## 3. Inline Error Component

### `components/ui/ErrorBlock.tsx`

Props:
- `message: string` — error description
- `onRetry?: () => void` — retry callback (shows retry button when provided)

Styling:
- Background: `color-mix(in srgb, var(--danger) 10%, transparent)`
- Border: `var(--danger)` at 30% opacity
- Text: `var(--danger)`
- Retry button: outlined style with `var(--danger)` color

### Where to use ErrorBlock:
- `app/page.tsx` — dashboard data load failure
- `app/market/page.tsx` — market data load failure
- `app/analysis/page.tsx` — analysis list load failure
- `app/settings/page.tsx` — settings load failure

## 4. Page Modification Pattern

Each page changes from:
```typescript
// Before: silent failure
try {
  const data = await fetchData();
  setData(data);
} catch (e) {
  console.error("Failed:", e);
}
```

To:
```typescript
// After: visible error with retry
const [error, setError] = useState<string | null>(null);

const loadData = useCallback(async () => {
  setError(null);
  setLoading(true);
  try {
    const data = await fetchData();
    setData(data);
  } catch (e) {
    setError(t("common.loadFailed"));
  } finally {
    setLoading(false);
  }
}, [t]);

// In render: error ? <ErrorBlock message={error} onRetry={loadData} /> : <DataContent />
```

For user actions:
```typescript
// Toast for action failures
try {
  await runAction();
  toast.success(t("common.success"));
} catch (e) {
  toast.error(t("common.actionFailed"));
}
```

## 5. i18n Keys

Add to both `zh.json` and `en.json`:

```json
{
  "common": {
    "loadFailed": "数据加载失败 / Failed to load data",
    "retry": "重试 / Retry",
    "actionFailed": "操作失败，请重试 / Action failed, please retry",
    "systemError": "系统异常 / System Error",
    "refreshPage": "刷新页面 / Refresh Page",
    "unexpectedError": "页面出现异常 / An unexpected error occurred"
  }
}
```

## Files Changed

New files:
- `frontend/src/app/global-error.tsx`
- `frontend/src/app/error.tsx`
- `frontend/src/components/ui/ErrorBlock.tsx`

Modified files:
- `frontend/package.json` (add sonner)
- `frontend/src/app/layout.tsx` (add Toaster)
- `frontend/src/app/page.tsx`
- `frontend/src/app/market/page.tsx`
- `frontend/src/app/analysis/page.tsx`
- `frontend/src/app/settings/page.tsx`
- `frontend/src/components/dashboard/AnalysisPanel.tsx`
- `frontend/src/messages/zh.json`
- `frontend/src/messages/en.json`
