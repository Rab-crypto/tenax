# /tenax:fresh

Start a fresh session without loading any history.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/tenax:fresh
```

## Instructions for Claude

1. Acknowledge the fresh start:

   ```
   ## Fresh Start

   Starting without loading previous session history.

   Project memory is still active - new decisions will be recorded automatically.

   Previous knowledge available:
   - 34 decisions
   - 8 patterns
   - 12 sessions

   Use `/tenax:search <query>` to find specific past decisions.
   Use `/tenax:load-session <ID>` to load specific sessions.
   ```

2. Do NOT load any previous sessions or summaries.

3. The plugin still records new decisions/patterns during this session.

4. User can still search and load specific items on demand.
