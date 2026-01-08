#!/usr/bin/env tsx

/**
 * UserPromptSubmit hook - runs on first user message
 * Outputs JSON with hookSpecificOutput.additionalContext for reliable context injection
 */

import { getProjectRoot, loadIndex, isMemoryInitialized } from "../lib/storage";

async function main(): Promise<void> {
    try {
        // Get cwd from hook input file (Claude Code passes this)
        let projectRoot = getProjectRoot();
        const inputFile = process.argv[2];
        if (inputFile) {
            try {
                const fs = await import("fs/promises");
                const input = JSON.parse(await fs.readFile(inputFile, "utf8"));
                if (input.cwd) {
                    projectRoot = input.cwd;
                }
            } catch {}
        }

        // Check if memory is initialized
        if (!(await isMemoryInitialized(projectRoot))) {
            const output = {
                hookSpecificOutput: {
                    hookEventName: "UserPromptSubmit",
                    additionalContext: `⚠️ TENAX NOT INITIALIZED - Run /tenax:status to initialize`
                }
            };
            console.log(JSON.stringify(output));
            return;
        }

        // Load the project index
        const index = await loadIndex(projectRoot);

        // Calculate stats
        const totalSessions = index.sessions.length;
        const totalDecisions = index.decisions.length;
        const totalPatterns = index.patterns.length;
        const pendingTasks = index.tasks.filter(t => t.status === "pending").length;
        const totalInsights = index.insights.length;

        // Get recent decisions (last 3)
        const recentDecisions = index.decisions
            .slice(-3)
            .map(d => `  - [${d.topic}] ${d.decision}`)
            .join("\n");

        // Get pending tasks
        const pendingTasksList = index.tasks
            .filter(t => t.status === "pending")
            .slice(0, 3)
            .map(t => `  - ${t.title}`)
            .join("\n");

        // Build context string - MANDATORY instruction to load full context
        let context = `🔴 TENAX MANDATORY - DO NOT SKIP:
1. YOUR FIRST ACTION must be: Invoke the Skill tool with skill="tenax:status" to load full session context
2. ONLY AFTER loading context, respond to the user
3. Include markers inline for any choices/findings: [D] topic: | [P] name: | [T] | [I]

Stats preview: ${totalSessions} sessions, ${totalDecisions} decisions, ${pendingTasks} pending tasks`;

        if (recentDecisions) {
            context += `\n\nRecent decisions:\n${recentDecisions}`;
        }

        if (pendingTasksList) {
            context += `\n\nPending tasks:\n${pendingTasksList}`;
        }

        // Output JSON format for reliable context injection
        const output = {
            hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: context
            }
        };
        console.log(JSON.stringify(output));

    } catch (error) {
        // Output error as JSON too
        const output = {
            hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: `Tenax hook error: ${error}`
            }
        };
        console.log(JSON.stringify(output));
    }
}

main();
