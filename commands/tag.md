# /project-memory:tag

Add or remove tags from sessions for better organization.

> **CRITICAL**: You MUST follow the exact bash commands specified below. Do NOT assume, modify, or substitute commands. Execute EXACTLY as documented.

## Usage

```
/project-memory:tag 5 feature-auth security
/project-memory:tag 12 bug-fix --remove
```

## Arguments

- First argument: Session ID
- Following arguments: Tags to add/remove
- `-r, --remove` - Remove tags instead of adding

## Instructions for Claude

1. Run the tag script:
   ```bash
   bun "${CLAUDE_PLUGIN_ROOT}/skills/project-memory/scripts/tag-session.ts" $ARGUMENTS
   ```

2. Show updated tags:
   ```
   ## Session 005 Tags Updated

   Added: feature-auth, security

   Current tags: feature-auth, security, backend

   *Use tags to filter and organize sessions*
   ```

3. For removal:
   ```
   ## Session 005 Tags Updated

   Removed: deprecated

   Current tags: feature-auth, security
   ```

4. Tags can be used for:
   - Categorizing sessions by feature area
   - Marking sessions for review
   - Filtering in exports
