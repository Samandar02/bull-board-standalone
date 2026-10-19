---
name: bull-board-lint-format
description: >-
  Use this skill when checking, fixing, or enforcing linting and code formatting using oxlint and oxfmt.
---

# Bull Board Lint & Format Guide

This skill guides agents in running and adhering to the ultra-fast Rust-based tooling configured in the project: `oxlint` and `oxfmt`.

## Rules & Configuration

### Oxlint Constraints (`.oxlintrc.json`)
- **No `console.log`**: Standard `console.log` is forbidden. Only `console.warn` and `console.error` are allowed.
  ```typescript
  // ❌ INVALID
  console.log('Server started');

  // ✅ VALID
  console.warn('Configuration warning');
  console.error('Failed to connect to Redis', err);
  ```
- **Unused Variables (`no-unused-vars`)**:
  - All unused function arguments and variables must be prefixed with an underscore `_`.
  - Caught errors ignore pattern is `none` (use `_err` or handle the error).
  - `ignoreRestSiblings: true` is enabled.
  ```typescript
  // ❌ INVALID
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // ✅ VALID
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  ```

### Oxfmt Constraints (`.oxfmtrc.json`)
- Quotes: Single quotes (`'`) for JS/TS code.
- Trailing commas: `es5`.
- Print width: 100 characters max line length.
- Package JSON: Automatically sorted (`sortPackageJson: true`).
- Import sorting: Automatically organized with no redundant empty lines between import blocks.

---

## Step-by-Step Execution

### 1. Check Code for Lint Violations
```bash
corepack yarn lint:check
```

### 2. Auto-Fix Lint Violations
```bash
corepack yarn lint
```

### 3. Check Code Formatting
```bash
corepack yarn format:check
```

### 4. Auto-Format Code
```bash
corepack yarn format
```

## Validation Checklist

Before finishing any code change:
1. Run `corepack yarn lint:check` and confirm 0 errors and 0 warnings.
2. Run `corepack yarn format:check` and confirm all files match the format specification.
