# /tenax:forget

Remove entries from project memory.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/tenax:forget <id>
/tenax:forget --type decisions
/tenax:forget --all
```

## Arguments

- `$ARGUMENTS` - Entry ID to delete
- `--type <type>` - Delete all of a type (decisions, patterns, tasks, insights)
- `--all` - Delete everything (requires confirmation)

## Instructions for Claude

1. **Single entry deletion:**
   ```bash
   npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/forget.ts" $ARGUMENTS
   ```

2. **Type deletion (ask for confirmation first):**
   ```
   ## Delete All Decisions?

   This will remove 34 decisions from project memory.
   This action cannot be undone.

   Type "yes" to confirm.
   ```

   If confirmed:
   ```bash
   npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/forget.ts" --type decisions
   ```

3. **Delete all (double confirmation):**
   ```
   ## Delete ALL Tenax?

   This will permanently delete:
   - 12 sessions
   - 34 decisions
   - 8 patterns
   - 5 tasks
   - 10 insights

   This cannot be undone. Consider `/tenax:backup` first.

   Type "DELETE ALL" to confirm.
   ```

4. Confirm deletion:
   ```
   ## Deleted

   Removed: 34 decisions

   *Project memory updated*
   ```
