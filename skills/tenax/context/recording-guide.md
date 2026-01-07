# Recording Guidelines

This document provides detailed guidance on what to record and when.

## Decisions

### What to Record as Decisions

Record when the user explicitly approves or confirms:

| Category | Examples |
|----------|----------|
| Technology choices | "Let's use TypeScript", "Go with PostgreSQL" |
| Architectural approaches | "Monolith for now", "Event-driven architecture" |
| Library selections | "Use Zustand for state", "Axios for HTTP" |
| API design choices | "REST over GraphQL", "Version in URL path" |
| Database schema decisions | "Normalize the user table", "Use UUIDs for IDs" |
| File/folder organization | "Components in src/components", "One file per component" |
| Coding standards | "Use functional components", "Prefer const over let" |

### Decision Recording Format

```bash
record-decision.ts -t "<topic>" -r "<rationale>" "<decision>"
```

**Good example:**
```bash
record-decision.ts -t "state-management" \
  -r "Simpler than Redux, TypeScript-first, minimal boilerplate" \
  "Use Zustand for client state management"
```

**Bad example:**
```bash
record-decision.ts -t "code" -r "" "Use Zustand"  # Too vague, no rationale
```

### Decision Topics

Use consistent topic names:
- `architecture`
- `frontend`
- `backend`
- `database`
- `api`
- `authentication`
- `authorization`
- `testing`
- `deployment`
- `styling`
- `state-management`
- `error-handling`
- `caching`
- `logging`
- `monitoring`
- `security`

## Patterns

### What to Record as Patterns

Record when establishing reusable approaches:

| Pattern Type | Examples |
|--------------|----------|
| Code patterns | "Repository pattern for data access" |
| Component patterns | "Container/Presenter pattern" |
| Error patterns | "Centralized error handling in middleware" |
| Naming patterns | "Use kebab-case for files, PascalCase for components" |
| Testing patterns | "One test file per component" |

### Pattern Recording Format

```bash
record-pattern.ts -n "<name>" -u "<usage>" "<description>"
```

**Good example:**
```bash
record-pattern.ts -n "API Error Handler" \
  -u "Wrap all async route handlers" \
  "All API routes use asyncHandler wrapper that catches errors and passes to error middleware"
```

## Tasks

### What to Record as Tasks

- Acknowledged work items
- Follow-up actions
- Technical debt items
- Future improvements

### Task Recording Format

```bash
add-task.ts -d "<description>" -p "<priority>" "<title>"
```

Priorities: `low`, `medium`, `high`, `critical`

## Insights

### What to Record as Insights

- Lessons learned
- Non-obvious discoveries
- Caveats or gotchas
- Performance findings

### Insight Recording Format

```bash
add-insight.ts -c "<context>" "<content>"
```

## What NOT to Record

### Temporary Items
- "Just for now" solutions
- Debugging code
- Exploratory implementations
- Placeholder logic

### Obvious Things
- Standard language features
- Well-known best practices
- Things documented elsewhere

### User-Rejected Items
- Suggestions the user declined
- Alternatives not chosen (unless comparing)

## Recording Timing

### Record Immediately When:
- User explicitly confirms a decision
- User says "let's go with X"
- User approves a proposed approach
- A new pattern is established and used

### Don't Record Until:
- Decision is confirmed (not just proposed)
- Pattern is actually implemented
- User acknowledges the approach

## Superseding Decisions

When a decision changes:

1. Find the original decision ID
2. Record new decision with `--supersedes`:
   ```bash
   record-decision.ts -t "database" \
     --supersedes "uuid-of-original" \
     -r "Requirements changed, need document flexibility" \
     "Switch from PostgreSQL to MongoDB"
   ```

3. The original decision remains in history for context

## Quality Checklist

Before recording, verify:

- [ ] User explicitly confirmed this decision
- [ ] Topic is specific and searchable
- [ ] Rationale explains the "why"
- [ ] Description is clear and actionable
- [ ] Not a temporary/exploratory item
