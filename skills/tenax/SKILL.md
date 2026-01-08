---
name: tenax
description: "Project memory. REQUIRED: Include [D] topic: [P] name: [T] [I] markers inline for choices/findings."
hooks:
  - type: UserPromptSubmit
    once: true
    command: "npx tsx \"${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/get-summary.ts\""
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - Task
  - Skill
---

# Tenax Skill

## ⚠️ MANDATORY PROTOCOL

**You MUST follow these steps. This is not optional.**

### At Session Start
```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/get-summary.ts"
```
Do this FIRST, before responding to any user request.

### Before Any Action - MANDATORY CHECKS

**⛔ DO NOT skip these steps. ALWAYS check before acting.**

#### Step 1: Check Conversation Context (Current Session)

Before executing ANY task, check your conversation history:
- Did you just complete this exact task in the last few messages?
- If yes: "I just did X moments ago - is there an issue, or should I redo it?"

#### Step 2: Search Tenax (Previous Sessions)

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/search.ts" "<relevant-topic>"
```

**Check search results for:**

1. **Recency** - Was this task done recently?
   - "Uploaded frontend - 3hr ago" → "This was done 3 hours ago. Redo it?"

2. **Prior Decisions** - Does your choice conflict with history?
   - User says "use SQLite" but search shows "[D] database: PostgreSQL chosen" → Surface the conflict before proceeding

**This applies to:**
- Adding new features or functionality
- Changing existing code or configuration
- Choosing libraries, tools, or approaches
- Making architectural or design decisions
- Any task that involves writing or modifying code
- **Repeating tasks that may have been done recently**

**WRONG:** User says "upload frontend" → you immediately upload
**RIGHT:** User says "upload frontend" → check context (did I just do this?) → search "frontend upload" → note recency → then act

**WRONG:** User says "let's use SQLite" → you implement SQLite
**RIGHT:** User says "let's use SQLite" → search "database" → find prior PostgreSQL decision → "Session 005 decided PostgreSQL. Switch to SQLite, or keep PostgreSQL?"

If search returns no results, briefly note: "Searched for X - no prior decisions found."

### After Deciding - Use ALL FOUR Markers

**DO NOT default to only [D].** Each response should include the appropriate markers:

| Use This | When You... | Example |
|----------|-------------|---------|
| `[D] topic:` | Make a choice or select something | `[D] database: Using PostgreSQL for relational data` |
| `[P] name:` | Establish a convention or pattern | `[P] error-handling: Always wrap async in try-catch` |
| `[T]` | Identify work that remains | `[T] Add input validation to the form` |
| `[I]` | Discover something useful | `[I] The API rate limits are per-user, not per-app` |

**Why this matters:** Without search, you may contradict prior decisions. Without ALL markers, patterns and insights are lost.

### Before Sending Your Response - VERIFY

**⛔ Do not send your response until you've confirmed:**

- [ ] Checked conversation context for recent duplicates
- [ ] Searched Tenax for prior decisions on this topic
- [ ] Noted any conflicts or recency issues to the user
- [ ] Used appropriate markers ([D], [P], [T], [I]) for any choices made

**If you skipped any step, go back and complete it now.**

---

## Quick Start Example

When user asks: "Should we use SQLite or PostgreSQL?"

**Step 1: Search first**
```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/search.ts" "database"
```

**Step 2: Respond with marker INLINE**
```
[D] database: I recommend SQLite for your embedded storage needs - zero config, single file, no server required. The main advantages are portability and simplicity for your use case.
```

**CRITICAL:** The marker starts the sentence. Don't write your response then add a marker afterward. The marker labels the prose that follows it.

---

## Session Start

At conversation start, load project context:

```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/get-summary.ts"
```

Then acknowledge: "Loaded project memory: X sessions, Y decisions."

---

## Markers

Use these markers to label decisions, patterns, tasks, and insights:

| Marker | Purpose | Example |
|--------|---------|---------|
| `[D] topic:` | Choices made | `[D] database: Using SQLite for storage` |
| `[P] name:` | Conventions | `[P] error-handling: Wrap async in try-catch` |
| `[T]` | Work remaining | `[T] Add unit tests for auth module` |
| `[I]` | Discoveries | `[I] API rate limits are per-user not per-app` |

### Multi-Line Format

For detailed decisions, use multi-line blocks (ends at blank line):

```
[D] frontend-redesign: Implementing new design system with JetBrains Mono + Outfit typography, bento grid layout with asymmetric cards, and a timeline-style "How It Works" section. These changes improve visual hierarchy and modernize the aesthetic.
```

For lists, keep the marker at the start:
```
[D] api-endpoints: Creating three new endpoints - /users for account management, /projects for CRUD operations, and /webhooks for event subscriptions.
```

---

## Search Flow Details

When search returns results:

1. **Results found** → Reference them: "Based on session 003, we decided to use X..."
2. **Conflict found** → Surface it: "This differs from session 005 which chose Y. Should I proceed or align with the prior decision?"
3. **Recent task found** → Note it: "This was done 2hr ago in session 017. Redo it?"
4. **No results** → Search raw transcripts:
   ```bash
   grep -r "<keyword>" "${PROJECT_DIR}/.claude/tenax/sessions/"
   ```
5. **Still nothing** → Note "Searched for X - no prior decisions" → Proceed with `[D]` marker

---

## Recording Knowledge

**Single items:**
```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/record-decision.ts" -t "<topic>" -r "<rationale>" "<decision>"
npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/record-pattern.ts" -n "<name>" -u "<usage>" "<description>"
```

**Batch recording (single permission):**
```bash
npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/cli.ts" batch --json '<json>'
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

---

## When to Use Markers

### CRITICAL: Mark ALL Decisions

**Every response that involves judgment should include a marker.** This includes:

| Category | Examples |
|----------|----------|
| **Technical** | Database choice, API design, library selection |
| **Architectural** | Folder structure, patterns, conventions |
| **Operational** | Commit scope, what to include/exclude, verification results |
| **Process** | Git workflow decisions, CI/CD choices, deployment strategy |
| **Configuration** | Settings verified as correct, config file changes |

### The Rule

If you made a choice, verified something, or concluded anything - **mark it inline**.

**WRONG** (marker as afterthought):
```
The gitignore looks correct.
[D] gitignore: Verified
```

**RIGHT** (marker labels the explanation):
```
[D] gitignore: Verified correct - properly excludes .claude/, backups, and test/ directories.
[D] commit-scope: This release (v2.1.0) includes install scripts and removes deprecated commands.
[P] retry-logic: Using exponential backoff with max 3 attempts for all API calls.
[I] The rate limiter resets per-user, not globally - discovered while debugging timeouts.
```

### DON'T Mark

- Temporary workarounds you'll remove
- Debugging console.logs
- Exploratory code that won't persist
- Explicit "just for now, will change later"

### Common Mistake

❌ Treating operational tasks as "just execution" - commits, verifications, and process choices ARE decisions that should be marked.

---

## User Commands

Users can invoke these commands:

| Command | Purpose |
|---------|---------|
| `/tenax:status` | View memory summary |
| `/tenax:search <query>` | Search all knowledge |
| `/tenax:list` | List all sessions |
| `/tenax:load-session <N>` | Load specific session |
| `/tenax:load-sessions [IDs]` | Load multiple sessions |
| `/tenax:record` | Manually record decision/pattern/task |
| `/tenax:settings` | Configure behavior |
| `/tenax:export` | Export to markdown/json |
| `/tenax:backup` | Create backup |
| `/tenax:stats` | View statistics |

---

## Session Capture

Sessions are captured automatically at:
1. **PreCompact** - Before auto-compaction (may happen mid-session)
2. **SessionEnd** - When session ends normally

Because PreCompact can trigger anytime, use markers throughout the session - not just at the end.

---

## Referencing Past Sessions

When session data is loaded, cite it:

```
Based on the decision from session 003, we're using SQLite.
Following the error-handling pattern from session 002...
Session 004 noted important subprocess handling considerations.
```

This creates continuity across sessions.
