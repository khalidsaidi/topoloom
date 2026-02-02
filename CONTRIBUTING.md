# Contributing

Thanks for your interest in TopoLoom!

## Setup
- Node >= 20, pnpm >= 9
- From repo root: `pnpm install`

## Required checks
Run all checks before opening a PR:
- `pnpm check:no-stubs`
- `pnpm -r typecheck`
- `pnpm -r lint`
- `pnpm -r test`
- `pnpm -r build`

## Coverage thresholds
We enforce minimum coverage thresholds in `packages/topoloom/vitest.config.ts`:
- Lines: 85%
- Statements: 83%
- Functions: 80%
- Branches: 64%

These values reflect the current algorithmic surface area and allow incremental improvements
without blocking releases. The intent is to steadily raise them as additional regression and
property tests land.

## Determinism & serialization
- Keep iteration orders stable.
- All major outputs should be serializable and deterministic under identical inputs.
