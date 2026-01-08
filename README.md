# Tenax Plugin for Claude Code

Persistent, searchable project knowledge that survives across Claude Code sessions.

**Website:** [tenax.wiki](https://tenax.wiki)

## Installation

In Claude Code, run:

```
/plugin marketplace add Rab-crypto/tenax
/plugin install tenax@tenax-marketplace
```

Then restart Claude Code or start a new session.

### Alternative: Script Install

If you prefer a one-liner:

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/Rab-crypto/tenax/master/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/Rab-crypto/tenax/master/install.ps1 | iex
```

## Overview

Claude Code sessions lose accumulated project knowledge when sessions end or when auto-compact triggers. This plugin solves that by:

- **Automatically capturing** decisions, patterns, tasks, insights, and full session transcripts
- **Storing knowledge** in per-project files (`.claude/tenax/`)
- **Proactively checking** history before Claude proposes architecture, libraries, or patterns
- **Retrieving on-demand** (never pre-loaded, minimal token overhead)
- **Semantic search** using local embeddings (no API calls required)

## Features

### Automatic Session Capture

Every session automatically captures:
- Full conversation transcript (raw JSONL)
- Extracted decisions with topics and rationale
- Patterns established during the session
- Tasks identified (pending/completed)
- Insights discovered
- Files modified

### Proactive History Checking

Before proposing architecture, libraries, or patterns, Claude automatically searches Tenax:

```
I found a previous decision on this topic:

**Session 005:** Decided to use PostgreSQL
**Rationale:** Team expertise, ACID compliance needs

Would you like to continue with this approach?
```

### Semantic Search

Find related knowledge using natural language:

```
/tenax:search "authentication approach"
```

Returns ranked results across decisions, patterns, tasks, insights, and sessions.

### Token Transparency

Every load operation shows exact token counts:

```
Loading session 003: 5,420 tokens (6.8% of budget)
```

## Commands

| Command | Description |
|---------|-------------|
| `/tenax:status` | Quick summary and stats |
| `/tenax:list` | List all sessions |
| `/tenax:search <query>` | Semantic search |
| `/tenax:load-session <ID>` | Load specific session |
| `/tenax:load-sessions [IDs]` | Load multiple sessions (defaults to last 3, use `--recent N` for N recent) |
| `/tenax:record` | Manual recording |
| `/tenax:settings` | Configure behavior |
| `/tenax:forget` | Remove entries |
| `/tenax:export` | Export to markdown/json/obsidian |
| `/tenax:backup` | Create backup |
| `/tenax:restore` | Restore from backup |
| `/tenax:stats` | Detailed statistics |
| `/tenax:tag` | Tag sessions |

## Data Storage

Data is stored per-project in `.claude/tenax/`:

```
.claude/tenax/
├── config.json           # User settings
├── index.json            # Accumulated knowledge index
├── embeddings.db         # Vector store (sqlite-vec)
└── sessions/
    ├── 001.json          # Processed session
    ├── 001.jsonl         # Raw transcript
    └── ...
```

## Configuration

Edit settings via `/tenax:settings` or directly in `config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `tokenBudget` | 80000 | Max tokens for session loads |
| `autoLoad` | "summary" | What to load at start |
| `autoCheckBeforeDecisions` | true | Check history before proposing |
| `autoRecordDecisions` | true | Auto-record confirmed decisions |
| `showCostEstimates` | false | Show cost with token counts |
| `maxSessionsStored` | 100 | Max sessions to retain |
| `embeddingModel` | "Xenova/all-MiniLM-L6-v2" | Local embedding model |

### autoLoad Options

- `none` - Don't load anything at session start
- `summary` - Load quick summary only (~500 tokens)
- `recent-3` - Load 3 most recent sessions
- `recent-5` - Load 5 most recent sessions
- `prompt` - Ask user what to load

## Token Economics

| Component | Tokens | When Loaded |
|-----------|--------|-------------|
| Skill description | ~50 | Always (startup) |
| SKILL.md | ~800 | First trigger |
| Search result | ~200-500 | Each search |
| Quick summary | ~500 | Auto-load or status |
| Full session | ~5k-20k | Explicit load only |

## Export Formats

### Markdown
Human-readable files with decisions, patterns, tasks, insights.

### JSON
Raw data for programmatic access or backup.

### Obsidian
Vault-ready structure with YAML frontmatter and tags.

### Notion
Markdown optimized for Notion import.

## Architecture

### Scripts (External Execution)
All scripts run outside the context window. Only their output enters context.

```
skills/tenax/scripts/
├── search.ts           # Semantic search
├── get-summary.ts      # Quick summary
├── get-session.ts      # Load single session
├── record-decision.ts  # Record decision
├── capture-session.ts  # Session end handler
└── ...
```

### Hooks
Automatically capture data on events:

- `PostToolUse` (Edit/Write) - Track file changes
- `SessionEnd` - Process and store session

### Embeddings
Local embeddings using Transformers.js:
- Model: `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- Storage: sqlite-vec for efficient similarity search
- No external API calls required

## Troubleshooting

### "Project memory not initialized"
Run any command to auto-initialize, or:
```bash
bun skills/tenax/scripts/init.ts
```

### Embedding model download slow
First run downloads ~23MB model. Subsequent runs use cache at `~/.cache/huggingface/`.

### sqlite-vec not loading
The plugin falls back to JSON-based cosine similarity if sqlite-vec fails. Performance may be slower for large datasets.

### Sessions not capturing
Check that hooks are configured in your settings. The `SessionEnd` hook triggers session capture.

### Search returns no results
- Try different keywords
- Use `/tenax:list` to see available sessions
- Check if sessions have been captured

## Development

### Project Structure

```
tenax/
├── .claude-plugin/plugin.json    # Plugin manifest
├── skills/tenax/
│   ├── SKILL.md                  # Skill definition
│   ├── scripts/                  # TypeScript scripts
│   ├── context/                  # Context documents
│   └── lib/                      # Shared utilities
├── commands/                     # Slash commands
├── hooks/hooks.json              # Hook configuration
├── package.json
└── tsconfig.json
```

### Hot-Reload Development

Claude Code v2.1.0+ supports skill hot-reload. For instant updates during development:

```bash
# Create symlink to your dev directory
# macOS/Linux:
ln -s /path/to/tenax/skills/tenax ~/.claude/skills/tenax

# Windows (run as admin):
mklink /D "%USERPROFILE%\.claude\skills\tenax" "C:\path\to\tenax\skills\tenax"
```

Skills in `~/.claude/skills/` are immediately available without restarting Claude Code.

### Recommended Permissions

For smoother development, add these wildcard permissions to your Claude Code settings:

```json
{
  "permissions": {
    "allow": [
      "Bash(npx tsx:*)",
      "Bash(npm install:*)",
      "Bash(bun:*)"
    ]
  }
}
```

This avoids repeated permission prompts for Tenax scripts.

### Type Checking

```bash
npm run typecheck
```

### Testing

```bash
# Test locally
claude --plugin-dir .

# Have a conversation with decisions
# End session and start new one
# Verify /tenax:status shows data
# Test /tenax:search
```

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
