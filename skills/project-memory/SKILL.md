---
name: project-memory
description: |
  Manages persistent project knowledge across Claude Code sessions.
  Stores and retrieves decisions, patterns, tasks, and insights with semantic search.

  MANDATORY: Before debugging issues, proposing solutions, or investigating errors,
  ALWAYS search project memory first. Past solutions may already exist.

  ALSO search before: architecture decisions, library choices, patterns, API designs.

  Use when: debugging, troubleshooting, making decisions, establishing patterns,
  or when encountering ANY technical problem.
---

# Project Memory Skill

## MANDATORY: Search Before Acting

Before debugging, investigating, or proposing solutions, you MUST first search project memory.
This applies to:

- **Debugging/Troubleshooting** - Search for similar errors, issues, or workarounds
- **Technical problems** - Past solutions may already be documented
- Architecture decisions
- Library or framework choices
- Design patterns
- API structures or endpoint designs
- Database schemas or data models
- Testing strategies
- Platform-specific issues (Windows, macOS, Linux)

### How to Check

```bash
bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/search.ts" "<relevant topic>"
```

Example queries:
- Before recommending React: `search.ts "frontend framework"`
- Before designing an API: `search.ts "api design rest graphql"`
- Before choosing a database: `search.ts "database postgres mongo"`

### What to Do with Results

1. **If matching decision found:** Present it to the user before proceeding
   - "I found a previous decision on this: We chose X because Y"
   - Ask if they want to continue with the existing approach

2. **If conflicting decision found:** Surface the conflict
   - "This conflicts with a decision from Session 005: ..."
   - Ask how to proceed (keep existing, update, or create exception)

3. **If no results:** Proceed normally, but record the new decision

## Automatic Recording

When multiple items need to be saved, use the batch CLI (single permission prompt):

```bash
bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/cli.ts" batch --json '<batch-data>'
```

Batch JSON format:
```json
{
  "decisions": [{"topic": "api", "decision": "Use REST", "rationale": "Simpler"}],
  "patterns": [{"name": "error-handler", "description": "Try-catch wrapper", "usage": "API routes"}],
  "tasks": [{"title": "Add tests", "priority": "high"}],
  "insights": [{"content": "Insight text"}]
}
```

For single items, use individual scripts:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/record-decision.ts" -t "<topic>" -r "<rationale>" "<decision>"
bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/record-pattern.ts" -n "<name>" -u "<usage>" "<description>"
```

### Recording Guidelines

**DO record:**
- Confirmed technology choices
- Agreed-upon patterns
- Architectural decisions
- API design choices
- Naming conventions that will be reused

**DO NOT record:**
- Temporary workarounds
- Debugging steps
- Exploratory code
- Decisions marked as "just for now"

## Quick Reference

Get project summary (token-light):
```bash
bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/get-summary.ts"
```

## Conflict Resolution

When a search returns a conflicting past decision:

1. **Surface the existing decision clearly:**
   ```
   I found a previous decision on this topic:

   **Session 005 (Oct 15):** Decided to use PostgreSQL
   **Rationale:** Need relational data, team expertise

   Your current request suggests using MongoDB.
   ```

2. **Ask for clarification:**
   - "Should we keep the existing decision?"
   - "Should we update to the new approach?"
   - "Is this a different context that warrants a separate decision?"

3. **If updating:** Use the `supersedes` field to link to the old decision
   ```bash
   record-decision.ts -t "database" --supersedes "uuid-of-old" "Use MongoDB" -r "Changed requirements"
   ```

## Available User Commands

Inform users they can use these commands:

- `/project-memory:status` - View memory status and summary
- `/project-memory:search <query>` - Search all knowledge
- `/project-memory:list` - List all sessions
- `/project-memory:load-session <N>` - Load specific session
- `/project-memory:load-recent <N>` - Load N recent sessions
- `/project-memory:fresh` - Start without loading history
- `/project-memory:record` - Manually record decision/pattern/task
- `/project-memory:settings` - Configure behavior
- `/project-memory:export` - Export to markdown/json/obsidian
- `/project-memory:backup` - Create backup
- `/project-memory:stats` - View detailed statistics

## Token Awareness

Always report token counts when loading content:

```
Loading session 003: 5,420 tokens (6.8% of budget)
```

When loading multiple items, show cumulative usage:

```
Loaded 3 sessions: 12,450 tokens (15.6% of budget)
```

## Session End Behavior

At the end of each session, the plugin automatically:
1. Captures the full transcript
2. Extracts decisions, patterns, tasks, insights
3. Generates embeddings for semantic search
4. Updates the project index

No manual action required from user or Claude.
