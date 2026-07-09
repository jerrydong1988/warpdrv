# Code Audit & Refactoring Plan

Date: 2026-07-10
Project: warpdrv-i18n (442 files, 6581 nodes, 12799 edges)

## Critical Issues Found

### 1. Unguarded Recursion (Stack Overflow Risk)

| File | Function | Issue |
|------|----------|-------|
| `packages/app/src/pages/Chat/assistant-ui/KokoroTTS.tsx` | `tryPlayNext` | Recursive call without depth limit or cancellation check |
| `packages/server/src/util/store.ts` | `setKey` | Recursive calls in nested key setters |
| `packages/server/src/services/modelScanner.ts` | `scanDirRecursive` | No max depth guard on directory scanning |
| `packages/app/src/store/index.ts` | State setters | Recursive state updates in effects |
| `packages/app/src/pages/Chat/assistant-ui/ComposerEditor.tsx` | Editor callbacks | Recursive re-render cycles |
| `packages/app/src/components/CmdSuggestion.ts` | `CmdSuggestion` | Recursive suggestion resolution |
| `packages/server/src/services/mcpServices.ts` | `mcpServices` | Recursive MCP tool discovery |
| `packages/app/src/components/ListRenderer.tsx` | `ListRenderer` | Recursive list item rendering |

### 2. High Parameter Count (>6 params)

| File | Function | Params |
|------|----------|--------|
| `packages/server/src/services/processManager.ts` | `buildArgs` | 7 |
| `packages/server/src/services/downloadManager.ts` | `startDownload` | 7 |
| `packages/server/src/api/mcpServices.ts` | `decideMcpToolCall` | 9 |

### 3. High Cyclomatic Complexity

| File | Function | Complexity |
|------|----------|------------|
| (from graph query results) | | |

## Refactoring Tasks

### Task 1: Guard KokoroTTS `tryPlayNext` ✅ COMPLETED
- [x] Add cancellation token check before recursive call
- [x] Add max recursion depth limit (100)
- [x] Use setTimeout to prevent tight loops
- [x] Reset recursion depth on all exit paths

### Task 2: Guard store.ts `setKey`
- Convert recursive setter to iterative approach using a stack
- Add depth limit check

### Task 3: Guard modelScanner `scanDirRecursive` ✅ COMPLETED
- [x] Add maxDepth parameter with default (20)
- [x] Track current depth and bail out when exceeded
- [x] Log warning when max depth reached

### Task 4: Guard store/index.ts state setters
- Review useEffect dependencies causing recursive updates
- Add cleanup functions to abort pending state updates

### Task 5: Guard ComposerEditor.tsx
- Debounce callback triggers
- Add ref-based cancellation for recursive updates

### Task 6: Guard CmdSuggestion.ts
- Add depth limit to suggestion resolution
- Cache resolved suggestions to prevent re-traversal

### Task 7: Guard mcpServices.ts
- Track discovered MCP tools in a Set to prevent cycles
- Add max discovery depth

### Task 8: Guard ListRenderer.tsx
- Add max recursion depth for nested lists
- Virtualize deeply nested lists

### Task 9: Reduce processManager.ts `buildArgs` parameters ✅ COMPLETED
- [x] Extract parameters into options object
- [x] Update buildServerArgs wrapper to use options pattern
- [x] Update all call sites to use named parameters

### Task 10: Reduce downloadManager.ts `startDownload` parameters ✅ COMPLETED
- [x] Extract parameters into options object
- [x] Update startMultiPartDownload to use options pattern

### Task 11: Reduce mcpServices.ts `decideMcpToolCall` parameters ✅ COMPLETED
- [x] Extract parameters into options object
- [x] Update all call sites to use named parameters

## Execution Order
1. Tasks 1-8 (recursion guards - safety critical)
2. Tasks 9-11 (parameter reduction - code quality)

## Completed Tasks Summary
- [x] Task 1: Guard KokoroTTS `tryPlayNext` - Added recursion depth limit (100), cancellation check, and setTimeout
- [x] Task 3: Guard modelScanner `scanDirRecursive` - Added maxDepth parameter (20) with depth tracking
- [x] Task 9: Reduce processManager.ts `buildArgs` parameters - Extracted into options object
- [x] Task 10: Reduce downloadManager.ts `startDownload` parameters - Extracted into options object
- [x] Task 11: Reduce mcpServices.ts `decideMcpToolCall` parameters - Extracted into options object
