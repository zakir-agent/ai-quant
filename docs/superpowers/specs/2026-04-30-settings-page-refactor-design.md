# Settings Page Refactor Design

**Date:** 2026-04-30
**Goal:** Split monolithic settings page into modular components + improve layout/visual hierarchy

## Problem

`frontend/src/app/settings/page.tsx` is a ~500 line monolith with ~14 `useState` hooks, 8 display sections, and inline helper components. Hard to maintain and visually flat — all 8 cards render as an undifferentiated grid with no logical grouping.

## Approach

**Component extraction + layout restructure** (keeps all existing content, reorganizes visual hierarchy).

## Component Structure

```
frontend/src/
├── app/settings/
│   └── page.tsx                        # Lightweight container (~80 lines)
├── components/settings/
│   ├── TelegramLogList.tsx             # Unchanged (already extracted)
│   ├── AiModelCard.tsx                 # AI model configuration display
│   ├── AiUsageCard.tsx                 # AI usage stats + progress bar
│   ├── DataSourcesCard.tsx             # 9 data source health statuses
│   ├── CollectionScheduleCard.tsx      # Collection intervals
│   ├── AlertingCard.tsx                # Alert config + test button
│   ├── DataStatisticsCard.tsx          # 5-column data count stats
│   ├── DataIntegrityCard.tsx           # K-line completeness matrix (most complex)
│   ├── SchedulerJobsCard.tsx           # Scheduler status + job list
│   └── shared.tsx                      # StatusDot, healthColor, SectionHeader
```

### Responsibility Model

- **Each Card** receives data via props from the parent `page.tsx`
- **Each Card** manages its own local UI state (e.g., integrity天数切换, 展开/折叠, detail loading)
- **`page.tsx`** only handles: data loading (3 API calls via `Promise.all`), error handling, and composing Cards

### Props Flow

```
page.tsx loads:
  config    → AppConfig    (from getConfig())
  status    → SystemStatus (from getSystemStatus())
  scheduler → SchedulerStatus (from getSchedulerStatus())

Distributes to cards:
  AiModelCard           ← config
  AiUsageCard           ← status.aiUsage, config
  DataSourcesCard       ← status.collectorHealth
  CollectionScheduleCard← config
  AlertingCard          ← config, sendAlertTest
  DataStatisticsCard    ← status.dataCounts
  DataIntegrityCard     ← (fetches own data via API)
  SchedulerJobsCard     ← scheduler
```

### Shared Module (`shared.tsx`)

- `StatusDot({ status, label? })` — colored circle + optional text label
- `healthColor(status: string)` — status string → CSS color variable
- `SectionHeader({ title })` — section title with left accent color bar

## Layout Restructure

### Grouping

Cards organized into 3 logical groups with section headers:

**Group 1: AI & Analysis**
- AI Model Config (left) | AI Usage Today (right)
- Alerting (full width)
- Collection Schedule (left) | Scheduler Jobs (right)

**Group 2: Data & Sources**
- Data Sources (left) | Data Statistics (right)
- K-line Data Integrity (full width)

**Group 3: System** (placeholder for future expansion)

### Visual Changes

- Section headers: small text + left accent color bar (e.g., `border-l-2 border-blue-500`)
- Card gap: `gap-4` → `gap-6` for breathing room
- "Edit .env" footer note → info banner at page top (more prominent)
- StatusDot: add optional text label (e.g., "Healthy" in green) for clarity
- AI Usage progress bar: add numeric value label
- Data Sources "Free" badge: consistent pill styling

### What Stays the Same

- `max-w-4xl` centered layout
- 2-column grid for paired cards
- Full-width for DataIntegrity (complex content needs space)
- All existing i18n keys preserved
- Backend API endpoints unchanged
- `lib/api.ts` types and functions unchanged
- `TelegramLogList` component unchanged

## i18n

New keys needed:
- `settings.section.ai` — "AI & Analysis" / "AI 与分析"
- `settings.section.data` — "Data & Sources" / "数据与来源"
- `settings.section.system` — "System" / "系统"

Both `zh.json` and `en.json` updated.

## Implementation Order

1. Create `shared.tsx` (StatusDot, healthColor, SectionHeader)
2. Extract 8 Card components one by one (each is independent)
3. Rewrite `page.tsx` as lightweight container
4. Apply layout restructure (grouping, spacing, info banner)
5. Update i18n messages
6. Verify `npm run lint` passes
