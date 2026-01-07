#!/usr/bin/env tsx

/**
 * UserPromptSubmit hook - runs on first user message
 * Outputs JSON with hookSpecificOutput.additionalContext for reliable context injection
 */

import { getProjectRoot, loadIndex, isMemoryInitialized } from "../lib/storage";

async function main(): Promise<void> {
    try {
        const projectRoot = getProjectRoot();

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

        // Build context string - clear instruction for natural response + markers
        let context = `🔴 TENAX REQUIRED: Respond naturally to user, then end with markers for any choices/findings:
[D] topic: decisions | [P] name: patterns | [T] tasks | [I] insights
Unmarked knowledge is lost forever.

📚 ${totalSessions} sessions | ${totalDecisions} decisions | ${totalPatterns} patterns | ${pendingTasks} pending | ${totalInsights} insights`;

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
