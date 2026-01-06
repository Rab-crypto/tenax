---
description: Save current conversation knowledge to project memory
---

# /project-memory:save

Manually save the current session to project memory.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

When the user runs `/project-memory:save`, automatically:

1. **Review the conversation** and identify:
   - Decisions made (technology choices, architecture, approaches)
   - Patterns established (conventions, standards)
   - Tasks mentioned (TODOs, future work)
   - Insights discovered (learnings, gotchas)

2. **Save everything in ONE batch call** using the CLI:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/cli.ts" batch --json '<batch-data>'
   ```

   The batch JSON format:
   ```json
   {
     "decisions": [
       {"topic": "api", "decision": "Use REST over GraphQL", "rationale": "Simpler for our use case"}
     ],
     "patterns": [
       {"name": "error-handler", "description": "Wrap async routes in try-catch", "usage": "All API endpoints"}
     ],
     "tasks": [
       {"title": "Add unit tests", "description": "Cover auth module", "priority": "high"}
     ],
     "insights": [
       {"content": "Rate limiting should be per-user not global", "context": "Performance discussion"}
     ]
   }
   ```

3. **Report summary** using compact markers for visibility:
   ```
   Saved to project memory:

   [D] storage: Using SQLite for local data because no separate server is needed
   [D] api: Going with REST over GraphQL for simpler implementation

   [P] error-handler: Wrap async routes in try-catch with standardized error response

   [I] Rate limiting should be per-user not global for better resource distribution
   ```

## Example

```bash
bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/cli.ts" batch --json '{"decisions":[{"topic":"storage","decision":"Use SQLite for local data","rationale":"No server needed"}],"insights":[{"content":"Bun native SQLite is fast"}]}'
```

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
- Single command = single permission prompt
- Batch processing is faster than individual calls
