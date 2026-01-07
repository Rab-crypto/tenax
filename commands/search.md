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
   bun "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/search.ts" $ARGUMENTS
   ```

2. Parse the JSON output and display results:

   ```
   ## Search Results for "authentication"

   Found 5 results (892 tokens)

   ### Decisions
   1. **[auth] JWT over session cookies** (92% match)
      Using JWT for stateless authentication...
      *Session 008, 2024-01-10*

   2. **[auth] OAuth2 for third-party login** (87% match)
      Implementing OAuth2 flow for Google/GitHub...
      *Session 005, 2024-01-07*

   ### Patterns
   3. **Auth Middleware Pattern** (78% match)
      All protected routes use authMiddleware...
      *Session 008, 2024-01-10*

   ### Sessions
   4. **Session 008: Authentication implementation** (75% match)
      Implemented JWT auth with refresh tokens...
   ```

3. After showing results, offer to load specific items:
   - "Would you like to load any of these sessions for full context?"
   - If no results, suggest trying different keywords or listing sessions
