---
description: Save current conversation knowledge to project memory
---

# /project-memory:save

Manually save the current session to project memory.

## Usage

When the user runs `/project-memory:save`, automatically:

1. **Review the conversation** and identify:
   - Decisions made (technology choices, architecture, approaches)
   - Patterns established (conventions, standards)
   - Tasks mentioned (TODOs, future work)
   - Insights discovered (learnings, gotchas)

2. **Save everything in parallel** using the record scripts:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/record-decision.ts" -t "<topic>" -r "<rationale>" "<decision>"
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/record-pattern.ts" -n "<name>" -u "<usage>" "<description>"
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/add-task.ts" -p "<priority>" "<title>" "<description>"
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/add-insight.ts" "<insight>"
   ```

3. **Report summary** of what was saved

## Example output

```
Saved to project memory:
- 3 decisions (runtime, storage, hooks)
- 1 pattern (stdin-file-fallback)
- 0 tasks
- 1 insight
```

## Notes

- Run this anytime to checkpoint important knowledge
- Deduplicates automatically - won't save duplicates
- All saves happen in the background
