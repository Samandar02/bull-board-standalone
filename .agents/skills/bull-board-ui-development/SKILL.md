---
name: bull-board-ui-development
description: >-
  Use this skill when creating or updating UI pages, components, hooks, or styles in the @bull-board/ui package.
---

# Bull Board UI Development Guide

This skill provides guidelines and patterns for frontend development within `packages/ui`.

## Tech Stack & Architecture

- **Framework**: React 19 (`react`, `react-dom`).
- **Build Tool**: Rsbuild (`@rsbuild/core`, `@rsbuild/plugin-react`).
- **Routing**: `react-router-dom` v5 (`Route`, `Switch`, `useHistory`, `useLocation`).
- **Component Primitives**: Headless components from `@base-ui/react`.
- **Styling**: Vanilla CSS and CSS Modules (`*.module.css`). **No Tailwind CSS**.
- **State Management**:
  - `useSettingsStore` (`packages/ui/src/hooks/useSettings.ts`): User preferences (theme, polling, page size, collapsibles).
  - `useInstanceStore` (`packages/ui/src/hooks/useInstanceStore.ts`): Active Redis instance and selected DB.
- **Server State & Queries**: `@tanstack/react-query` v5.

---

## Key Pages & Navigation Structure

1. **Instances Manager (`/instances` & `/`)**:
   - Location: `packages/ui/src/pages/InstancesPage/InstancesPage.tsx`.
   - Functionality: Lists all saved Redis servers, shows ping latency/status, allows creating/editing/deleting instances, database picker, and connecting into the board.
2. **Dashboard Overview (`/board`)**:
   - Location: `packages/ui/src/pages/OverviewPage/OverviewPage.tsx`.
   - Functionality: Displays queue status cards, counts, bulk pause/resume, and queue grouping.
3. **Queue Details (`/queue/:name`)**:
   - Location: `packages/ui/src/pages/QueuePage/QueuePage.tsx`.
   - Functionality: Paginated jobs list by state (`active`, `waiting`, `completed`, `failed`, `delayed`, `paused`), throughput/latency charts, job actions (retry, clean, promote).
4. **Job Inspector (`/queue/:name/:jobId`)**:
   - Location: `packages/ui/src/pages/JobPage/JobPage.tsx`.
   - Functionality: Job data, return values, logs, stack traces, and job dependency flows.
5. **Job Schedulers (`/job-schedulers`)**:
   - Location: `packages/ui/src/pages/SchedulersPage/SchedulersPage.tsx`.
   - Functionality: Repeatable and cron jobs across queues.

---

## Working with `Api.ts` & Instance Context

The frontend API client (`packages/ui/src/services/Api.ts`) transparently adapts its base URL depending on whether a Redis instance is currently selected:

```typescript
import { useApi } from '../hooks/useApi';

const api = useApi();

// When connecting to an instance:
api.setInstance(instanceId, dbIndex);

// Future queue requests will target:
// /api/instances/:instanceId/board/api/*
// with the header: `x-redis-db: :dbIndex`
```

---

## Styling Guidelines

1. **Theme Tokens**: Refer to `theme.css` for CSS variables:
   - Colors: `--primary`, `--text-primary`, `--bg-card`, `--border-color`.
   - Dark/Light mode: Handled automatically by body class and dataset attributes.
2. **Component Styles**:
   - Always name stylesheet files as `<ComponentName>.module.css`.
   - Import as `import s from './MyComponent.module.css'`.
   - Apply classnames using `className={s.myClass}` or `clsx(s.base, active && s.active)`.
3. **Responsive Design**:
   - Use `useMobileQuery()` hook for responsive drawer and layout decisions.

## Validation Checklist

1. Run `corepack yarn dev:ui` and verify the Rsbuild compilation passes without TypeScript warnings.
2. Ensure components maintain accessibility and dark/light mode contrast.
3. Test layout on mobile and desktop breakpoints.
