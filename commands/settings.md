# /project-memory:settings

View or modify project memory settings.

## Usage

```
/project-memory:settings
/project-memory:settings tokenBudget 100000
/project-memory:settings autoLoad summary
```

## Arguments

- No args: Show current settings
- `<setting> <value>`: Update a setting

## Available Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| tokenBudget | number | 80000 | Max tokens for session loads |
| autoLoad | string | summary | What to load at start: none, summary, recent-3, recent-5 |
| autoCheckBeforeDecisions | boolean | true | Check history before proposing solutions |
| autoRecordDecisions | boolean | true | Automatically record confirmed decisions |
| showCostEstimates | boolean | false | Show cost estimates with token counts |
| maxSessionsStored | number | 100 | Maximum sessions to retain |

## Instructions for Claude

1. To view settings, read the config:
   ```bash
   cat $PROJECT_ROOT/.claude/project-memory/config.json
   ```

2. Display settings in a table format:
   ```
   ## Project Memory Settings

   | Setting | Value |
   |---------|-------|
   | tokenBudget | 80,000 |
   | autoLoad | summary |
   | autoCheckBeforeDecisions | true |
   | autoRecordDecisions | true |
   | showCostEstimates | false |
   | maxSessionsStored | 100 |

   *Edit: `/project-memory:settings <key> <value>`*
   ```

3. To update a setting, modify config.json:
   - Validate the value type
   - Save the updated config
   - Confirm the change

4. For `autoLoad` setting, valid values are:
   - `none` - Don't load anything at session start
   - `summary` - Load quick summary only
   - `recent-3` - Load 3 most recent sessions
   - `recent-5` - Load 5 most recent sessions
   - `prompt` - Ask user what to load
