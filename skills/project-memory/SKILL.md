---
name: project-memory
description: |
  Manages persistent project knowledge across Claude Code sessions.
  Stores and retrieves decisions, patterns, tasks, and insights with semantic search.

  ⚠️ CRITICAL REQUIREMENTS:

  1. USE MARKERS THROUGHOUT THE SESSION - Not just at the end!
     [D] topic: text  |  [P] name: text  |  [T] text  |  [I] text
     Add markers IMMEDIATELY when making decisions, not in a summary.
     PreCompact and SessionEnd hooks extract only marked content.

  2. SEARCH MEMORY FIRST - Before ANY debugging, architecture, or problem-solving.
     Past sessions contain solutions you need. Use search.ts before investigating.

  3. REFERENCE SESSION DATA - When loaded, cite and build on past decisions.
     "Based on session 003's decision on auth, I'll continue with JWT..."

  WITHOUT MARKERS, KNOWLEDGE IS LOST TO FUTURE SESSIONS.
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

## ⚠️ CRITICAL: Use Markers THROUGHOUT The Session

**THIS IS MANDATORY.** When making ANY decision, establishing ANY pattern, noting ANY task, or discovering ANY insight during a conversation, you **MUST** output compact markers **IMMEDIATELY** - not in a summary at the end.

**WHY THIS MATTERS:**
- The PreCompact hook may trigger ANYTIME during the session
- If you wait until the end to add markers, they may be lost to auto-compaction
- Only marked content is reliably extracted
- Unmarked decisions from the first half of a session WILL BE LOST

**CORRECT APPROACH:**
```
User: "Should we use SQLite or PostgreSQL?"

Claude: Based on your needs for embedded storage, I recommend SQLite.

[D] database: Using SQLite for embedded storage - no separate server needed

Let me explain the trade-offs...
```

**WRONG APPROACH:**
```
User: "Should we use SQLite or PostgreSQL?"

Claude: Based on your needs, I recommend SQLite. Let me explain...
[...long discussion without markers...]
[Markers only added at session end - TOO LATE if PreCompact already ran]
```

**FAILURE TO USE MARKERS = LOST KNOWLEDGE**

### Compact Marker Format

The marker format is designed to minimize token usage while remaining human-readable:

| Type | Format | Example |
|------|--------|---------|
| Decision | `[D] topic: text` | `[D] database: Using SQLite for embedded storage` |
| Pattern | `[P] name: text` | `[P] error-handling: Wrap async in try-catch` |
| Task | `[T] text` | `[T] Add unit tests for auth module` |
| Insight | `[I] text` | `[I] API rate limits are per-user not per-app` |

### Decision Markers `[D]`

Use for technology choices, architectural decisions, and confirmed approaches:

```
[D] runtime: Using Bun for fast TypeScript execution
[D] auth: JWT tokens with 15-minute expiry and refresh rotation
[D] styling: Tailwind CSS with custom design tokens
```

### Pattern Markers `[P]`

Use when establishing coding patterns or conventions:

```
[P] error-boundary: Wrap async route handlers in try-catch with logging
[P] barrel-exports: Use index.ts to re-export from feature directories
[P] naming: Use kebab-case for files, PascalCase for components
```

### Task Markers `[T]`

Use for noting work that needs to be done:

```
[T] Add unit tests for the authentication module
[T] Update documentation with new configuration options
[T] Fix timezone handling in date picker component
```

### Insight Markers `[I]`

Use for discoveries, observations, or important technical details:

```
[I] Safari handles date parsing differently than Chrome causing timezone issues
[I] The ORM auto-commits transactions so manual rollback is needed
[I] Bun.stdin.text() hangs in subprocesses - use file argument workaround
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

Each marker must be on its own line. The extraction system will automatically parse these markers and store them in project memory for future reference.

## Referencing Session Data

When session data is loaded (via /load-session, /load-recent, or auto-load), you MUST:

1. **Cite previous decisions when relevant:**
   ```
   Based on the decision from session 003, we're using SQLite for storage.
   Building on that, I'll implement the caching layer using...
   ```

2. **Build on established patterns:**
   ```
   Following the error-handling pattern established in session 002,
   I'll wrap this async operation in a try-catch with logging.
   ```

3. **Reference insights when troubleshooting:**
   ```
   Session 004 noted that Bun.stdin.text() hangs in subprocesses.
   I'll use the file argument workaround instead.
   ```

4. **Update decisions explicitly when changing them:**
   ```
   [D] accent-color: Changing from amber to teal for better accessibility

   (This updates the previous decision from session 005)
   ```

This creates continuity across sessions and prevents re-solving the same problems.

## Session Capture Behavior

The plugin captures sessions at two points:
1. **PreCompact hook** - Runs before auto-compaction (may happen mid-session)
2. **SessionEnd hook** - Runs when session ends normally

Because PreCompact can trigger anytime, markers must be added THROUGHOUT the session, not just at the end.

When the same session is captured multiple times:
- Same-topic decisions are merged (newer replaces older)
- Same-name patterns are merged
- Insights and tasks are deduplicated

No manual action required from user or Claude.
