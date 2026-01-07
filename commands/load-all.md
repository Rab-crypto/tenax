# /tenax:load-all

Smart-load all sessions within token budget.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/tenax:load-all
/tenax:load-all --budget 60000
```

## Arguments

- `-b, --budget` - Token budget (default: from config)

## Instructions for Claude

1. First, list all sessions to show what's available:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/list-sessions.ts"
   ```

2. Calculate total tokens and show preview:
   ```
   ## Load All Sessions?

   Available: 12 sessions (total ~45,000 tokens)
   Budget: 80,000 tokens

   This would use 56% of your token budget.

   Sessions to load:
   - 012: User profile (5,420 tokens)
   - 011: Auth bug fix (2,100 tokens)
   - ...

   Proceed? [Y/n]
   ```

3. If confirmed, load sessions:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/get-sessions.ts" --recent 999 --budget $BUDGET
   ```

4. Show loaded content with total token usage.

5. If total exceeds budget:
   - Load sessions in reverse chronological order (newest first)
   - Stop when budget would be exceeded
   - Show which sessions were skipped
