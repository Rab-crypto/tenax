---
description: Show project memory status and recent knowledge
---

# /project-memory:status

Show project memory status and quick summary.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/project-memory:status
```

## Instructions for Claude

1. Run the summary script:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/get-summary.ts"
   ```

2. Parse the JSON output and display in a readable format:
   - Show initialization status
   - Display stats: total sessions, decisions, patterns, tasks, insights
   - List recent decisions (last 5)
   - Show pending tasks
   - Display top topics
   - Show storage size

3. Format example:
   ```
   ## Project Memory Status

   **Sessions:** 12 | **Decisions:** 34 | **Patterns:** 8 | **Tasks:** 5 pending

   ### Recent Decisions
   - [api] Using REST over GraphQL for simplicity
   - [state] Zustand for client state management

   ### Pending Tasks
   - [ ] Add unit tests for auth module
   - [ ] Update API documentation

   ### Top Topics
   api (12), authentication (8), database (5)

   *Storage: 2.4 MB | Token count: 1,234*
   ```

4. If not initialized, offer to initialize with `/project-memory:init`.
