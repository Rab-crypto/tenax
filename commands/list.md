# /project-memory:list

List all stored sessions with metadata.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/project-memory:list
```

## Instructions for Claude

1. Run the list sessions script:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/list-sessions.ts"
   ```

2. Parse the JSON output and display as a table:

   ```
   ## Sessions

   | ID  | Date       | Summary                          | Tokens | Decisions |
   |-----|------------|----------------------------------|--------|-----------|
   | 012 | 2024-01-15 | Implemented user authentication  | 5,420  | 3         |
   | 011 | 2024-01-14 | Fixed database connection issues | 2,100  | 1         |
   | 010 | 2024-01-13 | Added API rate limiting          | 3,800  | 2         |

   *Total: 12 sessions | Use `/project-memory:load-session <ID>` to load*
   ```

3. Include helpful commands at the bottom:
   - `/project-memory:load-session <ID>` - Load a specific session
   - `/project-memory:load-recent <N>` - Load N most recent sessions
   - `/project-memory:search <query>` - Search across all sessions
