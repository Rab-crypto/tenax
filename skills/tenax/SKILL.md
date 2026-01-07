---
name: tenax
description: |
  Manages persistent project knowledge across Claude Code sessions.
  Stores and retrieves decisions, patterns, tasks, and insights with semantic search.

  ⚠️ CRITICAL REQUIREMENTS:

  1. USE MARKERS IN EVERY RESPONSE that contains decisions/patterns/insights:
     [D] topic: text  |  [P] name: text  |  [T] text  |  [I] text

     DO BOTH: Write helpful user-friendly responses AND include markers.
     Markers supplement communication, they don't replace it.
     Add markers IMMEDIATELY when making decisions, not at session end.

  2. SEARCH MEMORY FIRST - Before ANY debugging, architecture, or problem-solving.
     Past sessions contain solutions you need. Use search.ts before investigating.

  3. REFERENCE SESSION DATA - When loaded, cite and build on past decisions.
     "Based on session 003's decision on auth, I'll continue with JWT..."

  WITHOUT MARKERS, KNOWLEDGE IS LOST TO FUTURE SESSIONS.
---

# Tenax Skill

## MANDATORY: Search Before Acting

Before debugging, investigating, or proposing solutions, you MUST first search Tenax.
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
bun "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/search.ts" "<relevant topic>"
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
bun "${CLAUDE_PLUGIN_ROOT}/skills/tenax/cli.ts" batch --json '<batch-data>'
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
bun "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/record-decision.ts" -t "<topic>" -r "<rationale>" "<decision>"
bun "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/record-pattern.ts" -n "<name>" -u "<usage>" "<description>"
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
bun "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/get-summary.ts"
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

- `/tenax:status` - View memory status and summary
- `/tenax:search <query>` - Search all knowledge
- `/tenax:list` - List all sessions
- `/tenax:load-session <N>` - Load specific session
- `/tenax:load-recent <N>` - Load N recent sessions
- `/tenax:fresh` - Start without loading history
- `/tenax:record` - Manually record decision/pattern/task
- `/tenax:settings` - Configure behavior
- `/tenax:export` - Export to markdown/json/obsidian
- `/tenax:backup` - Create backup
- `/tenax:stats` - View detailed statistics

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

### Markers SUPPLEMENT Communication, They Don't Replace It

**DO BOTH:** Write helpful, user-friendly responses AND include markers. These are not mutually exclusive.

**CORRECT - Use Multi-Line Markers to Label Your Summary:**
```
I've completed the homepage redesign. Here's what changed:

[D] Frontend redesign with "Precision Engineering" aesthetic:
  - JetBrains Mono + Outfit typography
  - Bento grid layout with asymmetric cards (12-column, span 4/8)
  - Timeline-style "How It Works" with glowing nodes
  - Redesigned terminal with syntax highlighting
  - Hero section preserved as requested

[P] Terminal syntax highlighting:
  - .prompt for $ prefix
  - .command for the command text
  - .string, .flag, .comment for arguments
  - .output for command results

[I] Page-specific styles kept inline in <style> tag to avoid bloating main stylesheet

Would you like me to commit these changes?
```

The markers **label** the summary content - no duplication, zero extra tokens.

**WRONG - Summary Then Duplicate Markers (Wasteful):**
```
I redesigned the homepage with new typography and layout.

[D] frontend: Redesigned homepage with typography and layout
```

**WRONG - Summary Only (Lost Knowledge):**
```
I've redesigned the homepage with new typography, bento grid features,
timeline process section, and redesigned terminal.

Would you like me to commit these changes?
```

**THE RULE:** Use markers to **label** your explanations. The marker + your natural content = searchable knowledge with zero token overhead.

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

### Marker Formats

Two formats are supported: **single-line** for quick notes, and **multi-line** for detailed content.

#### Single-Line Format (Quick Notes)

For brief decisions, use the compact `[D] topic: text` format:

```
[D] database: Using SQLite for embedded storage
[P] error-handling: Wrap async in try-catch with logging
[T] Add unit tests for auth module
[I] API rate limits are per-user not per-app
```

#### Multi-Line Format (Detailed Content) - RECOMMENDED

For detailed decisions with bullet points, use the multi-line format. The marker labels your existing explanation - **zero extra tokens**:

```
[D] Frontend redesign includes:
  - JetBrains Mono + Outfit typography
  - Bento grid features section with asymmetric cards
  - Timeline-style "How It Works" with glowing nodes
  - Redesigned terminal with syntax highlighting

```

**The block ends at a blank line.** Everything between the marker and the blank line is captured.

More examples:

```
[P] Bento grid implementation:
  - Use 12-column CSS grid
  - Cards span 4 or 8 columns via .bento-card--wide/--medium
  - Tall cards span 2 rows with .bento-card--tall
  - Gap of var(--space-lg) between cards

[I] Bun subprocess stdin behavior:
  - Bun.stdin.text() hangs when called in subprocess context
  - Workaround: pass data via temp file argument
  - Node.js wrapper reads stdin, writes temp file, Bun reads file

[T] Remaining frontend work:
  - Add mobile responsive breakpoints
  - Test in Safari and Firefox
  - Add loading states for animations

```

### Best Practice: Label Your Summaries

Instead of writing a summary AND separate markers, just add a marker to your summary:

**Before (wasteful):**
```
I redesigned the homepage with new typography and layout.

[D] frontend: Redesigned homepage with new typography and layout
```

**After (efficient):**
```
[D] I redesigned the homepage with:
  - JetBrains Mono + Outfit typography
  - Bento grid layout with asymmetric cards
  - Timeline process visualization

```

The marker **labels** your natural content rather than duplicating it.

### When to Use Markers

**ALWAYS use markers when:**
- Making or confirming a technology choice
- Establishing a coding pattern or convention
- Noting remaining work items
- Discovering important technical details

**Markers can appear:**
- Labeling summaries (recommended)
- In bullet point sections
- In prose paragraphs
- Grouped at end of response

The extraction system captures both single-line and multi-line blocks automatically.

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
