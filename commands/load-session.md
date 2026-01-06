# /project-memory:load-session

Load a specific session by ID into context.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/project-memory:load-session <session-id>
/project-memory:load-session 5
/project-memory:load-session 012
```

## Arguments

- `$ARGUMENTS` - Session ID (required). Can be "5" or "005".

## Instructions for Claude

1. Run the get session script:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/get-session.ts" $ARGUMENTS
   ```

2. Parse the JSON output and display the session:

   ```
   ## Session 005 (4,230 tokens)

   **Date:** 2024-01-07
   **Summary:** Implemented OAuth2 authentication flow

   ### Decisions Made
   - **[auth]** OAuth2 for third-party login
     *Rationale: Industry standard, better UX than password*

   - **[security]** Store tokens in httpOnly cookies
     *Rationale: Prevents XSS attacks*

   ### Patterns Established
   - **Auth Callback Pattern**: All OAuth callbacks go through /auth/callback/:provider

   ### Files Modified
   - src/auth/oauth.ts (created)
   - src/routes/auth.ts (modified)
   - src/middleware/auth.ts (modified)

   ### Key Topics
   authentication, oauth, security
   ```

3. After loading, this session's knowledge is in context. Claude can reference these decisions in the current conversation.

4. Show token usage relative to budget.
