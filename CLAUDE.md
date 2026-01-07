# Tenax Plugin

A Claude Code plugin that provides persistent, searchable Tenax across sessions.

## Project Overview

This plugin stores decisions, patterns, tasks, insights, and full session transcripts in per-project files (`.claude/tenax/`). It uses local embeddings for semantic search and proactively checks history before Claude proposes architecture or patterns.

## Tech Stack

- **Runtime**: Bun (TypeScript)
- **Embeddings**: `@huggingface/transformers` with `Xenova/all-MiniLM-L6-v2` model
- **Vector Storage**: `sqlite-vec` with Bun's native SQLite
- **Data Format**: JSON for processed data, JSONL for raw transcripts

## Directory Structure

```
tenax/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── skills/
│   └── tenax/
│       ├── SKILL.md             # Core skill (auto-triggers on architecture discussions)
│       ├── scripts/             # TypeScript scripts (run outside context)
│       ├── context/             # Additional context files (loaded on demand)
│       └── lib/                 # Shared utilities
├── commands/                    # Slash command definitions
├── hooks/
│   └── hooks.json               # Hook configuration
├── package.json
└── tsconfig.json
```

## Key Patterns

### Scripts Execute Outside Context
All scripts in `scripts/` run externally - only their stdout enters the context window. This keeps token usage minimal.

### Progressive Disclosure
- Skill description (~50 tokens) loads at startup
- SKILL.md (~800 tokens) loads on first trigger
- Full sessions load only on explicit request

### Proactive Checking
The skill's description triggers Claude to check history before proposing:
- Architecture decisions
- Library/framework choices
- Design patterns
- API structures

## Commands (Namespaced)

All commands use the `tenax:` namespace:
- `/tenax:status` - Quick summary
- `/tenax:search <query>` - Semantic search
- `/tenax:list` - List all sessions
- `/tenax:load-session <N>` - Load specific session
- `/tenax:load-recent <N>` - Load N recent sessions
- `/tenax:fresh` - Start without history

## Data Storage (Per-Project)

Data is stored in the user's project at `.claude/tenax/`:
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

## Setup

### Install Bun (Required)
```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
irm bun.sh/install.ps1 | iex
```

### Install Dependencies
```bash
cd tenax
bun install
```

### Test Locally
```bash
claude --plugin-dir .
```

## Development Commands

```bash
# Type check
bun run typecheck

# Run a script directly
bun skills/tenax/scripts/init.ts
```

## Key Implementation Notes

1. **Hooks receive JSON via stdin** - Parse with `JSON.parse(await Bun.stdin.text())`
2. **Use `${CLAUDE_PLUGIN_ROOT}`** for plugin-relative paths in hooks/commands
3. **Embedding model downloads on first use** (~23MB, cached at `~/.cache/huggingface/`)
4. **sqlite-vec requires platform-specific binary** - handled by npm package

## Testing

Test the plugin by:
1. Running `claude --plugin-dir .` in the plugin directory
2. Having a conversation with decisions
3. Ending the session and starting a new one
4. Verifying `/tenax:status` shows captured data
5. Testing `/tenax:search` returns relevant results
