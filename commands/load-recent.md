# /project-memory:load-recent

Load the N most recent sessions.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/project-memory:load-recent
/project-memory:load-recent 3
/project-memory:load-recent 5 --budget 50000
```

## Arguments

- `$ARGUMENTS` - Number of recent sessions to load (default: 5)
- `-b, --budget` - Token budget limit

## Instructions for Claude

1. Run the get sessions script with --recent flag:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/get-sessions.ts" --recent ${ARGUMENTS:-5}
   ```

2. Display loaded sessions (most recent first):

   ```
   ## Recent Sessions (3 loaded, 12,450 tokens)

   ### Session 012 (Today)
   Summary: Implemented user profile page
   Decisions: Using React Query for data fetching

   ### Session 011 (Yesterday)
   Summary: Fixed authentication bug
   Decisions: Added token refresh logic

   ### Session 010 (2 days ago)
   Summary: API rate limiting
   Decisions: 100 requests/minute per user

   *Total: 12,450 tokens (15.6% of budget)*
   ```

3. This is useful for quickly catching up on recent project context.
