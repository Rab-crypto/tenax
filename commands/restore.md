# /project-memory:restore

Restore project memory from a backup.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/project-memory:restore ./project-memory-backup.tar.gz
/project-memory:restore ./backup.tar.gz --force
```

## Arguments

- `$ARGUMENTS` - Path to backup file (required)
- `-f, --force` - Overwrite existing memory without confirmation

## Instructions for Claude

1. Check if memory already exists:
   ```
   ## Restore from Backup?

   Existing project memory found:
   - 12 sessions
   - 34 decisions

   Restoring will **replace** current memory.

   Continue? [y/N]
   ```

2. If confirmed (or --force), run restore:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/restore.ts" $ARGUMENTS
   ```

3. Show restore summary:
   ```
   ## Restored

   Backup: project-memory-backup-2024-01-10.tar.gz

   Restored:
   - config.json
   - index.json
   - embeddings.db
   - 10 session files

   *Project memory restored successfully*
   ```
