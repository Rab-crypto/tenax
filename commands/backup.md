# /tenax:backup

Create a backup of all project memory data.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/tenax:backup
/tenax:backup -o ./my-backup.tar.gz
```

## Arguments

- `-o, --output` - Output file path (default: tenax-backup-TIMESTAMP.tar.gz)

## Instructions for Claude

1. Run the backup script:
   ```bash
   npx tsx "${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/backup.ts" $ARGUMENTS
   ```

2. Show backup summary:
   ```
   ## Backup Created

   File: tenax-backup-2024-01-15T10-30-00.tar.gz
   Size: 4.2 MB
   Location: /path/to/project/

   Contents backed up:
   - config.json
   - index.json
   - embeddings.db
   - 12 session files

   *Restore with `/tenax:restore <file>`*
   ```

3. Recommend regular backups before major changes.
