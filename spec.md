```markdown
# Tenax Plugin: Complete Specification

## 1. Overview

### Problem Statement
Claude Code sessions lose accumulated project knowledge when sessions end or when auto-compact triggers. This forces users to repeatedly re-explain context, decisions, patterns, tasks, and insights. There is no built-in way to query past decisions ("why did we choose X?") or retrieve full session transcripts without manual copying.

### Solution
A **skill-based Claude plugin** that provides persistent, searchable, on-demand Tenax with minimal token overhead.

Key features:
- Automatically captures decisions, patterns, tasks, insights, and full session transcripts
- Stores knowledge in per-project files (`.claude/tenax/`)
- Proactively checks history before Claude proposes architecture, libraries, or patterns
- Retrieves knowledge on-demand (never pre-loaded)
- Gives users full control: load all, load specific sessions, load recent N, start fresh
- Shows exact token impact before any load
- Works reliably with auto-compact (does not fight it)

## 2. Design Principles

| Principle                  | Implementation                                                                 |
|----------------------------|---------------------------------------------------------------------------------|
| Progressive Disclosure     | Only skill description (~50 tokens) loads at startup. SKILL.md (~800 tokens) loads only when triggered. Full sessions only on explicit request. |
| External Script Execution  | All scripts run outside the context window. Only their output enters context.   |
| Proactive Behavior         | Claude automatically checks history before proposing solutions.                 |
| User Control               | Slash commands for loading specific/recent/all sessions, starting fresh, configuring behavior. |
| Token Transparency         | Every load action shows exact token counts and budget percentage. No dollar estimates by default (optional user-configured). |
| Automatic Recording        | Claude records decisions as they are made. Hooks capture full session on end.   |
| Auto-Compact Compatibility | Design assumes auto-compact is always on and unreliable to disable. Retrieval-based approach survives compaction. |

## 3. Directory Structure

```
tenax/
├── .claude-plugin/
│   └── plugin.json                    # Plugin manifest
├── skills/
│   └── tenax/
│       ├── SKILL.md                   # Core skill instructions (auto-triggered)
│       ├── scripts/                   # External execution (output only in context)
│       │   ├── search.ts
│       │   ├── get-summary.ts
│       │   ├── get-session.ts
│       │   ├── get-sessions.ts
│       │   ├── list-sessions.ts
│       │   ├── record-decision.ts
│       │   ├── record-pattern.ts
│       │   ├── add-task.ts
│       │   ├── complete-task.ts
│       │   ├── add-insight.ts
│       │   ├── capture-session.ts
│       │   ├── track-file.ts
│       │   └── init.ts
│       ├── context/                   # Loaded only when needed
│       │   ├── check-triggers.md
│       │   ├── recording-guide.md
│       │   └── conflict-resolution.md
│       └── lib/                       # Shared TypeScript utilities
│           ├── types.ts
│           ├── storage.ts
│           ├── extractor.ts
│           └── tokenizer.ts
├── commands/                          # User-facing slash commands
│   ├── status.md
│   ├── list.md
│   ├── search.md
│   ├── load-session.md
│   ├── load-sessions.md
│   ├── settings.md
│   ├── record.md
│   ├── forget.md
│   └── export.md
├── hooks/
│   └── hooks.json
├── package.json
├── tsconfig.json
└── README.md
```

Data is stored per-project in:
```
.claude/tenax/
├── config.json
├── index.json
└── sessions/
    ├── 001.json
    ├── 002.json
    └── ...
```

## 4. Data Structures

### 4.1 config.json
```typescript
interface Config {
  tokenBudget: number;                 // Default: 80000
  showCostEstimates: boolean;          // Default: false
  pricing?: {
    inputPer1MTokens: number | null;   // e.g., 3.00
    outputPer1MTokens: number | null;  // e.g., 15.00
    lastUpdated?: string;
  };
  autoLoad: 'none' | 'summary' | 'recent-3' | 'recent-5' | 'prompt'; // Default: 'summary'
  autoCheckBeforeDecisions: boolean;   // Default: true
  autoRecordDecisions: boolean;        // Default: true
  maxSessionsStored: number;           // Default: 100
}
```

### 4.2 index.json (Accumulated Knowledge)
Contains quick reference + full accumulated decisions/patterns/insights + session metadata.

### 4.3 sessions/NNN.json
Full session data: transcript, extracted decisions/tasks/insights, file changes, summary, token count.

(Full interfaces are in `lib/types.ts` – see architecture plan in conversation for details.)

## 5. Skill Definition

### 5.1 skills/tenax/SKILL.md
```markdown
---
name: tenax
description: |
  Manages accumulated project knowledge across all sessions.
  
  IMPORTANT: Before proposing architecture, libraries, patterns, or solutions,
  ALWAYS run the search script to check existing decisions.
  
  Records decisions automatically when confirmed.
  
  Use /pm commands for manual control.
---

# Tenax Skill

## CRITICAL: Check Before Deciding
(before any architecture/library/pattern proposal, run search.ts)

## How to Check
bun .claude/skills/tenax/scripts/search.ts "query"

## How to Record
bun .claude/skills/tenax/scripts/record-decision.ts "topic" "decision" "rationale"

## Quick Reference
bun .claude/skills/tenax/scripts/get-summary.ts

## Conflict Handling
Surface previous decisions and ask user before overriding.
```

### 5.2 context/*.md
- `check-triggers.md`: Detailed list of when to auto-check
- `recording-guide.md`: Guidelines for what/when to record
- `conflict-resolution.md`: How to handle contradictions

## 6. Token Economics

| Component                  | Tokens       | When Loaded                          |
|----------------------------|--------------|--------------------------------------|
| Skill description          | ~50         | Always (startup)                     |
| SKILL.md                   | ~800        | First trigger in conversation        |
| Search result (typical)    | ~200–500    | Each auto-check or /pm search        |
| Quick summary              | ~500        | Auto-load or /pm                     |
| Full single session        | ~5k–20k     | Explicit load only                   |

First auto-check: ~1,050–1,350 tokens  
Subsequent checks: ~200–500 tokens each

## 7. Commands

All commands are defined in `commands/*.md` with detailed instructions for Claude on how to respond, run scripts, show previews, and ask for confirmation.

Key commands:
- `/tenax:status` → status + quick summary
- `/tenax:list` → table of sessions with token counts
- `/tenax:search "topic"`
- `/tenax:load-session N`
- `/tenax:load-sessions 1,3,5` (or `--recent N` for recent sessions)
- `/tenax:settings`

## 8. Hooks

`hooks/hooks.json` captures:
- File modifications on PostToolUse (Edit/Write/MultiEdit)
- Full session on Stop and SessionEnd

## 9. Auto-Compact Compatibility

As of January 2026, there is **no reliable way** to disable auto-compact. The plugin is designed to work *with* auto-compact:
- Minimal baseline (~50 tokens) survives compaction
- Knowledge stored in files, not context
- Retrieval adds only what is needed

Guidance provided to users on managing large loads (start fresh, use search first, etc.).

## 10. Implementation Notes

- All scripts are written in TypeScript/Bun
- Shared utilities in `lib/`
- No hardcoded pricing – cost estimates are optional and user-configured
- Thorough error handling and edge-case coverage
- Extensive README with setup, usage examples, and troubleshooting

This specification consolidates every element discussed throughout our conversation: skill-based progressive disclosure, external script execution, automatic checking/recording, full user control, token transparency, hook-based capture, and auto-compact resilience.

The plugin is now fully specified and ready for implementation.
```