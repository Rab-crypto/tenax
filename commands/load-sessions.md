# /project-memory:load-sessions

Load multiple sessions by IDs.

## Usage

```
/project-memory:load-sessions 1,3,5
/project-memory:load-sessions 001 003 005
/project-memory:load-sessions 1,3,5 --budget 40000
```

## Arguments

- `$ARGUMENTS` - Session IDs (comma or space separated)
- `-b, --budget` - Token budget limit (default: config tokenBudget)

## Instructions for Claude

1. Run the get sessions script:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/get-sessions.ts" $ARGUMENTS
   ```

2. If budget is exceeded, the script will load as many sessions as fit:
   - Sessions are loaded in order provided
   - Once budget is reached, remaining sessions are skipped
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
