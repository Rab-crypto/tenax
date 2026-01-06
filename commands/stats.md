# /project-memory:stats

Show detailed statistics about project memory.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/project-memory:stats
```

## Instructions for Claude

1. Run the stats script:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/stats.ts"
   ```

2. Display comprehensive statistics:

   ```
   ## Project Memory Statistics

   ### Overview
   | Metric | Count |
   |--------|-------|
   | Sessions | 12 |
   | Decisions | 34 |
   | Patterns | 8 |
   | Tasks (pending) | 5 |
   | Tasks (completed) | 12 |
   | Insights | 10 |
   | Total Tokens | 45,230 |

   ### Timeline
   - First session: 2024-01-01
   - Latest session: 2024-01-15
   - Active days: 15

   ### Sessions per Month
   - January 2024: 12 sessions

   ### Top Topics
   1. api (12 decisions)
   2. authentication (8 decisions)
   3. database (5 decisions)
   4. testing (4 decisions)
   5. deployment (3 decisions)

   ### Storage
   | Component | Size |
   |-----------|------|
   | Index | 125 KB |
   | Sessions | 2.1 MB |
   | Embeddings | 450 KB |
   | **Total** | **2.7 MB** |
   ```

3. This command is useful for understanding project history and memory usage.
