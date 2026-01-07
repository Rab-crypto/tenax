# /tenax:load-sessions

Load multiple sessions by IDs, or the last 3 sessions if no IDs specified.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/tenax:load-sessions
/tenax:load-sessions 1,3,5
/tenax:load-sessions 001 003 005
/tenax:load-sessions --budget 40000
```

## Arguments

- `$ARGUMENTS` - Session IDs (comma or space separated). If omitted, loads last 3 sessions.
- `-b, --budget` - Token budget limit (default: config tokenBudget)

## Instructions for Claude

1. Run the get sessions script:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/get-sessions.ts" $ARGUMENTS
   ```

2. Budget-aware loading:
   - If no IDs provided, loads last 3 sessions (most recent first)
   - Sessions are loaded in order provided (or by recency if no IDs)
   - Loading stops when budget would be exceeded
   - Output includes which sessions were loaded vs skipped

3. Display loaded sessions:

   ```
   ## Loaded 3 of 5 sessions (38,420 tokens - 48% of budget)

   ### Session 001
   [Session summary and key decisions...]

   ### Session 003
   [Session summary and key decisions...]

   ### Session 005
   [Session summary and key decisions...]

   *Skipped sessions 007, 009 (would exceed token budget)*
   ```

4. Show token count for each loaded session and total.
