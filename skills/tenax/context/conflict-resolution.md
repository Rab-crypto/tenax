# Conflict Resolution

This document provides guidance on handling conflicts between past decisions and current requests.

## Types of Conflicts

### 1. Direct Contradiction
Past decision directly conflicts with current proposal.

**Example:**
- Past: "Use PostgreSQL for all data"
- Current: "Let's use MongoDB for user profiles"

### 2. Partial Overlap
Past decision covers similar ground but different context.

**Example:**
- Past: "Use REST for public API"
- Current: "Should we use GraphQL for the admin dashboard?"

### 3. Outdated Decision
Circumstances have changed since the original decision.

**Example:**
- Past (6 months ago): "Use Create React App for simplicity"
- Current: Team has grown, need better build performance

### 4. Scope Expansion
Original decision didn't anticipate current needs.

**Example:**
- Past: "SQLite for local development"
- Current: "Need to support concurrent writes"

## Resolution Process

### Step 1: Surface the Conflict

Always present the existing decision clearly:

```
I found a previous decision related to this:

**Decision:** Use PostgreSQL for all persistent data
**Topic:** database
**Rationale:** Team expertise, ACID compliance needs
**Session:** 003 (2024-01-05)

Your current request suggests using MongoDB for user profiles.
```

### Step 2: Identify the Conflict Type

Determine which type of conflict this is:
- Direct contradiction?
- Different context?
- Changed circumstances?
- Expanded scope?

### Step 3: Ask for Clarification

Present options to the user:

```
How would you like to proceed?

1. **Keep existing decision** - Continue using PostgreSQL for all data
2. **Update the decision** - Switch to MongoDB (will supersede the previous decision)
3. **Create exception** - Use MongoDB specifically for user profiles while keeping PostgreSQL for other data
4. **Different context** - This is a separate concern (explain why)
```

### Step 4: Record the Outcome

Based on user's choice:

**If keeping existing:**
- No recording needed
- Proceed with existing approach

**If updating:**
```bash
record-decision.ts -t "database" \
  --supersedes "<original-id>" \
  -r "Switching to MongoDB for document flexibility" \
  "Use MongoDB for all persistent data"
```

**If creating exception:**
```bash
record-decision.ts -t "database-profiles" \
  -r "User profiles need flexible schema, main data stays in PostgreSQL" \
  "Use MongoDB specifically for user profile data"
```

## Conflict Conversation Templates

### Direct Contradiction

```
I need to flag a potential conflict:

**Previous Decision (Session 003):**
Topic: [topic]
Decision: [decision]
Rationale: [rationale]

**Current Proposal:**
[what user/I am suggesting]

These appear to conflict. Options:
1. Keep the existing decision
2. Update to the new approach
3. These are actually different concerns

Which would you prefer?
```

### Outdated Decision

```
I found a relevant past decision that may be outdated:

**Decision from [date]:**
[decision details]

**Current situation:**
[what has changed]

Should we:
1. Keep the original decision (it still applies)
2. Update based on new circumstances
3. Revisit and discuss the tradeoffs
```

### Ambiguous Overlap

```
I found a related decision, but I'm not sure if it applies here:

**Existing:** [decision]
**Current context:** [what we're doing now]

Is this:
1. The same concern (existing decision applies)
2. A different concern (new decision needed)
3. A special case (exception to the rule)
```

## Recording Superseded Decisions

When a decision is superseded:

1. **Keep the original** - It provides historical context
2. **Link the new to the old** - Use `--supersedes` flag
3. **Explain what changed** - In the rationale

```bash
record-decision.ts -t "api-versioning" \
  --supersedes "abc-123-original-id" \
  -r "Initial URL versioning caused routing complexity, headers are cleaner" \
  "Use header-based API versioning (Accept-Version header)"
```

## Special Cases

### User Says "Ignore Previous Decisions"

If user explicitly asks to ignore history:
- Acknowledge the request
- Proceed without checking
- Still record the new decision (without supersedes)
- Note in rationale: "Intentionally departing from previous approach"

### Multiple Conflicting Decisions

If multiple past decisions conflict with each other:
1. Surface all relevant decisions
2. Ask user to clarify which is current
3. Consider cleaning up outdated decisions

### Team/Context Switches

If the project has multiple contexts (e.g., frontend vs backend teams):
- Decisions may not conflict if scoped to different areas
- Use specific topics to differentiate
- Ask if decisions should be merged or kept separate

## Prevention

To minimize future conflicts:

1. **Use specific topics** - "api-public" vs "api-internal"
2. **Include context in rationale** - When this applies
3. **Review periodically** - `/tenax:stats` to see old decisions
4. **Update, don't duplicate** - Supersede rather than add parallel decisions
