# /project-memory:export

Export project memory to various formats.

## Usage

```
/project-memory:export
/project-memory:export -f markdown
/project-memory:export -f obsidian -s
/project-memory:export -f json -o ./backup
```

## Arguments

- `-f, --format` - Export format: markdown, json, obsidian, notion (default: markdown)
- `-o, --output` - Output directory (default: project-memory-export-YYYY-MM-DD)
- `-s, --sessions` - Include full session data

## Formats

### Markdown (default)
Creates readable markdown files:
- `decisions.md` - All decisions grouped by topic
- `patterns.md` - All patterns
- `tasks.md` - Task list with checkboxes
- `insights.md` - All insights
- `sessions/` - (if -s flag) Individual session files

### JSON
Raw data export:
- `index.json` - Full project index
- `sessions/` - (if -s flag) Individual session JSON files

### Obsidian
Vault-ready structure with YAML frontmatter:
- `Decisions/` - Individual decision notes with tags
- `Patterns/` - Individual pattern notes
- `Tasks/all-tasks.md` - Consolidated task list
- `Insights/` - Individual insight notes

### Notion
Markdown format optimized for Notion import.

## Instructions for Claude

1. Run the export script:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/export.ts" -f $FORMAT -o $OUTPUT $ARGUMENTS
   ```

2. Show export summary:
   ```
   ## Export Complete

   Format: Obsidian
   Location: ./project-memory-export-2024-01-15/

   Exported:
   - 34 decisions
   - 8 patterns
   - 5 tasks
   - 10 insights
   - 12 sessions

   Total files: 69
   ```

3. Provide guidance for each format:
   - **Obsidian**: "Open this folder as an Obsidian vault"
   - **Notion**: "Import markdown files into Notion"
   - **JSON**: "Use for backup or programmatic access"
