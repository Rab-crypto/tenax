# When to Auto-Check Project Memory

This document details when Claude should automatically search project memory before proceeding.

## Always Check Before

### 1. Architecture Proposals
Trigger phrases:
- "Let's use microservices..."
- "We should structure the app as..."
- "The architecture should be..."
- "For the overall design..."

Search terms: `architecture`, `structure`, `design`, `monolith`, `microservices`

### 2. Library/Framework Recommendations
Trigger phrases:
- "I recommend using..."
- "We should use [library]..."
- "For this, I suggest..."
- "[Library] would be good for..."

Search terms: The specific library name + its category (e.g., `react frontend`, `express server`)

### 3. Database Decisions
Trigger phrases:
- "For the database..."
- "We should store this in..."
- "The data model should..."
- "Let's use [database]..."

Search terms: `database`, `storage`, `schema`, specific DB names

### 4. API Design
Trigger phrases:
- "The API should..."
- "For this endpoint..."
- "REST vs GraphQL..."
- "The response format..."

Search terms: `api`, `endpoint`, `rest`, `graphql`, `response`

### 5. Authentication/Authorization
Trigger phrases:
- "For authentication..."
- "Users should login via..."
- "The auth flow..."
- "Permissions should..."

Search terms: `auth`, `authentication`, `authorization`, `login`, `jwt`, `oauth`

### 6. Testing Strategy
Trigger phrases:
- "For testing..."
- "We should test with..."
- "The test approach..."

Search terms: `testing`, `test`, `jest`, `vitest`, `e2e`, `unit`

### 7. State Management
Trigger phrases:
- "For state management..."
- "We should use [Redux/Zustand/etc]..."
- "The global state..."

Search terms: `state`, `redux`, `zustand`, `context`, `store`

### 8. Deployment/Infrastructure
Trigger phrases:
- "For deployment..."
- "We'll deploy to..."
- "The CI/CD pipeline..."

Search terms: `deploy`, `infrastructure`, `ci`, `cd`, `docker`, `kubernetes`

### 9. Naming Conventions
Trigger phrases:
- "Let's name this..."
- "The convention for..."
- "Files should be named..."

Search terms: `naming`, `convention`, `pattern`, relevant entity type

### 10. Error Handling
Trigger phrases:
- "For error handling..."
- "Errors should be..."
- "The error response..."

Search terms: `error`, `exception`, `handling`, `validation`

## Search Query Examples

| Context | Search Query |
|---------|-------------|
| Recommending React | `"frontend framework react vue"` |
| Designing REST API | `"api design rest endpoint"` |
| Choosing PostgreSQL | `"database postgres sql nosql"` |
| Setting up auth | `"authentication login oauth jwt"` |
| Adding tests | `"testing strategy unit e2e"` |
| State solution | `"state management redux zustand"` |
| Deploying app | `"deployment hosting vercel aws"` |
| File naming | `"naming convention file component"` |

## Do NOT Check For

- Simple code completions
- Syntax questions
- Documentation lookups
- Bug fixes with clear solutions
- User explicitly says "ignore previous decisions"

## After Checking

1. **If matches found:** Present them before proceeding
2. **If no matches:** Proceed normally, consider recording if decision is made
3. **If conflict found:** Surface conflict and ask user
