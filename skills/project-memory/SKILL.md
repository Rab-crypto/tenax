---
name: project-memory
description: |
  Manages persistent project knowledge across Claude Code sessions.
  Stores and retrieves decisions, patterns, tasks, and insights with semantic search.

  ⚠️ CRITICAL: You MUST use markers when outputting knowledge:
  [DECISION: topic] text  |  [PATTERN: name] text  |  [TASK: priority] text  |  [INSIGHT] text
  Use [/] to end multi-line markers. WITHOUT MARKERS, KNOWLEDGE IS LOST.

  MANDATORY: Before debugging issues, proposing solutions, or investigating errors,
  ALWAYS search project memory first. Past solutions may already exist.

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

## ⚠️ CRITICAL: Knowledge Output Format - YOU MUST USE MARKERS

**THIS IS MANDATORY.** When making ANY decision, establishing ANY pattern, noting ANY task, or discovering ANY insight during a conversation, you **MUST** output structured markers. Without markers, knowledge will NOT be captured to project memory.

**FAILURE TO USE MARKERS = LOST KNOWLEDGE**

### Decision Markers

**Single-line format:**
```
[DECISION: topic] The decision text describing what was chosen and why
```

**Multi-line format (use `[/]` to end):**
```
[DECISION: topic]
The decision with more detail:
- Reason one
- Reason two
- Trade-offs considered
[/]
```

Example:
```
[DECISION: database] Using SQLite for storage because it's embedded and requires no separate server process

[DECISION: authentication]
Implementing JWT tokens for stateless session management:
- Access tokens expire in 15 minutes
- Refresh tokens stored in HttpOnly cookies
- Token rotation on each refresh
[/]
```

### Pattern Markers

When establishing a coding pattern or convention:

```
[PATTERN: name] Description of the pattern and when to use it
```

Example:
```
[PATTERN: error-boundary] Wrap async route handlers in try-catch with standardized error response
[PATTERN: barrel-exports] Use index.ts files to re-export from feature directories
```

### Task Markers

When noting work that needs to be done:

```
[TASK: priority] Description of what needs to be done
```

Priority can be: `high`, `medium`, or `low`

Example:
```
[TASK: high] Add unit tests for the authentication module
[TASK: medium] Update documentation with new configuration options
```

### Insight Markers

When noting a discovery or important observation:

```
[INSIGHT] The observation or discovery
```

Example:
```
[INSIGHT] The API rate limits are per-user not per-app which affects our caching strategy
[INSIGHT] Safari handles date parsing differently than Chrome causing timezone issues
```

### When to Use Markers

**ALWAYS use markers when:**
- Making or confirming a technology choice
- Establishing a coding pattern or convention
- Noting remaining work items
- Discovering important technical details

**Markers can appear:**
- In numbered lists
- In bullet points
- In prose paragraphs
- In summaries

The extraction system will automatically parse these markers and store them in project memory for future reference.

## Session End Behavior

At the end of each session, the plugin automatically:
1. Captures the full transcript
2. Extracts decisions, patterns, tasks, insights from markers
3. Falls back to heuristic extraction for unmarked content
4. Generates embeddings for semantic search
5. Updates the project index

No manual action required from user or Claude.
