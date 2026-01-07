# Why I Built Tenax: Persistent Memory for Claude Code

## The Name

*Tenax* is Latin for "holding fast" or "tenacious" - from the same root as *tenacious* and *retain*. It's about grip, persistence, not letting go.

That's what this plugin does: it holds onto knowledge that would otherwise slip away between sessions.

## The Problem

Every time I started a new Claude Code session, I found myself re-explaining the same decisions. "We're using Bun, not Node." "The API follows this pattern." "We decided against that approach last week because..."

Claude is brilliant within a session. But between sessions? Total amnesia. Context resets. Decisions forgotten. Patterns lost.

I got tired of repeating myself.

## What Tenax Does

Tenax gives Claude Code persistent project memory. It automatically captures:

- **Decisions** - Technology choices, architecture approaches, why you picked X over Y
- **Patterns** - Code conventions, naming standards, how things should be done in this project
- **Tasks** - Work that needs to happen, follow-ups, TODOs
- **Insights** - Gotchas, learnings, things discovered along the way

When you start a new session, Claude sees what was decided before. When it's about to propose an architecture, it checks if you've already made that choice. No more groundhog day.

## Why Use It

If you use Claude Code regularly on the same projects, you've felt this pain. You've typed "as I mentioned before" knowing Claude has no idea what you mentioned before.

Tenax fixes that. Your project builds up institutional knowledge over time. New sessions start with context, not confusion.

The memory is searchable. Claude can query past decisions semantically. Asked about authentication? It finds the auth decisions you made three weeks ago.

## How to Use It

Install takes 30 seconds:

**macOS/Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/Rab-crypto/tenax/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/Rab-crypto/tenax/main/install.ps1 | iex
```

That's it. Restart Claude Code. The plugin loads automatically.

As you work, use simple markers in your conversation:
- `[D] api: Using REST over GraphQL` - records a decision
- `[P] naming: Use camelCase for functions` - records a pattern
- `[T] Add unit tests for auth module` - records a task
- `[I] Rate limiting should be per-user` - records an insight

Or just work naturally and run `/tenax:save` to capture the session.

Check your memory anytime with `/tenax:status` or search with `/tenax:search <topic>`.

## Rough Around the Edges

Fair warning: this is early software. I built it for my own workflow and decided to release it in case others find it useful.

You might hit bugs. Some features might not work perfectly on every platform. The documentation could be better. Edge cases exist that I haven't encountered yet.

If something breaks, open an issue. Or fix it and submit a PR. That's the beauty of open source.

I'm actively using this daily, so it will keep improving. But don't expect polish - expect utility.

## Other Solutions Exist

I'm not claiming this is the only way to solve context persistence. There are other approaches - some use external databases, some integrate differently with Claude.

I built Tenax for myself. It solves my specific workflow. Local-first, no external services, works offline, stores everything in your project directory.

If it helps you too, great. If another solution fits better, use that. The code is open source at [github.com/Rab-crypto/tenax](https://github.com/Rab-crypto/tenax) - fork it, modify it, make it yours.

## Try It

If you're tired of re-explaining your project to Claude every session, give Tenax a try. Thirty seconds to install. Your future self will thank you.

---

*Built by [@phil_mybags](https://x.com/phil_mybags). Released under MIT license.*
