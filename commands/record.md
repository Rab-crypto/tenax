# /project-memory:record

Manually record a decision, pattern, task, or insight.

## Usage

```
/project-memory:record decision -t "api" "Use REST over GraphQL" -r "Simpler for our use case"
/project-memory:record pattern -n "Error Handler" "Wrap all async routes in try-catch"
/project-memory:record task "Add unit tests for auth"
/project-memory:record insight "Rate limiting should be per-user, not global"
```

## Arguments

- `$ARGUMENTS` - Type and content

## Types

### Decision
```
/project-memory:record decision -t <topic> "<decision>" -r "<rationale>"
```
- `-t, --topic` - Topic/category (required)
- `-r, --rationale` - Why this decision was made

### Pattern
```
/project-memory:record pattern -n <name> "<description>" -u "<usage>"
```
- `-n, --name` - Pattern name (required)
- `-u, --usage` - When/how to use

### Task
```
/project-memory:record task "<title>" -d "<description>" -p <priority>
```
- `-d, --description` - Detailed description
- `-p, --priority` - low, medium, high, critical

### Insight
```
/project-memory:record insight "<content>" -c "<context>"
```
- `-c, --context` - What prompted this insight

## Instructions for Claude

1. Parse the type from first argument (decision/pattern/task/insight)

2. Run the appropriate script:
   ```bash
   # Decision
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/record-decision.ts" -t "$TOPIC" -r "$RATIONALE" "$DECISION"

   # Pattern
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/record-pattern.ts" -n "$NAME" -u "$USAGE" "$DESCRIPTION"

   # Task
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/add-task.ts" -d "$DESC" -p "$PRIORITY" "$TITLE"

   # Insight
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/add-insight.ts" -c "$CONTEXT" "$CONTENT"
   ```

3. Confirm what was recorded:
   ```
   ## Recorded Decision

   **Topic:** api
   **Decision:** Use REST over GraphQL
   **Rationale:** Simpler for our use case

   *This decision is now searchable and will be considered in future sessions.*
   ```
