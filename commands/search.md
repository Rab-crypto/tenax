---
description: Search project memory semantically
argument-hint: <query>
---

# /tenax:search

Search across all project memory using semantic similarity.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/tenax:search <query>
/tenax:search -t decision "api design"
/tenax:search -l 20 "authentication"
```

## Arguments

- `$ARGUMENTS` - The search query (required)
- `-t, --type` - Filter by type: decision, pattern, task, insight, session
- `-l, --limit` - Maximum results (default: 10)

## Instructions for Claude

1. Run the search script:
   ```bash
   npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/search.ts" $ARGUMENTS
   ```

2. Parse the JSON output and display results using the **`timeAgo` field** (pre-computed):

   Each result includes a `timeAgo` field (e.g., "2hr ago", "3 days ago"). Use it directly.

   Group results by recency when helpful (e.g., "Recent (today)", "Earlier this week", "Older").

   ```
   ## Search Results for "authentication"

   Found 5 results (892 tokens)

   ### Recent (today)
   1. **[auth] JWT over session cookies** - 2hr ago
      Using JWT for stateless authentication...

   2. **[auth] OAuth2 for third-party login** - 5hr ago
      Implementing OAuth2 flow for Google/GitHub...

   ### Earlier this week
   3. **Auth Middleware Pattern** - 3 days ago
      All protected routes use authMiddleware...

   ### Older
   4. **Session 008: Authentication implementation** - 2 weeks ago
      Implemented JWT auth with refresh tokens...
   ```

3. After showing results, offer to load specific items:
   - "Would you like to load any of these sessions for full context?"
   - If no results, suggest trying different keywords or listing sessions

4. **If semantic search yields poor results**, search the raw transcripts directly:
   ```bash
   grep -r "<keyword>" "${PROJECT_DIR}/.claude/tenax/sessions/"
   ```

   Or extract specific patterns from transcript JSONL files:
   ```bash
   grep -oE '<pattern>' "${PROJECT_DIR}/.claude/tenax/sessions/009.jsonl"
   ```

   Raw transcripts contain the full conversation history and may have information that wasn't captured as decisions/patterns/insights.

## Post-Search Analysis (MANDATORY)

After displaying results, you MUST perform these checks:

### 1. Extract Referenced Data from Transcripts

If search results **mention** that data exists but don't show the actual data (e.g., "credentials found in session 009", "URL was used in session X"), you MUST:

```bash
# Search the referenced session's raw transcript
grep -oE '<relevant-pattern>' "${PROJECT_DIR}/.claude/tenax/sessions/<session-id>.jsonl"
```

**This applies to ALL data types**: URLs, commands, file paths, configuration values, error messages, API responses - not just credentials.

### 2. Note Recency and Avoid Duplicate Work

Check the `timeAgo` field carefully:
- If results show **"just now"** or very recent activity related to the user's request, **inform the user the task may already be completed**
- Ask: "I see this was done recently in session X. Should I proceed or is this already handled?"

### 3. Follow Cross-References

When an insight/decision says "found in session X" or "see session Y":
- Load that session's transcript immediately
- Extract the specific data mentioned
- Don't ask the user for information that's already recorded
