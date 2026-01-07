#!/usr/bin/env bun

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
                    additionalContext: `⚠️ TENAX NOT INITIALIZED - Run: bun "\${CLAUDE_PLUGIN_ROOT}/skills/tenax/scripts/init.ts"`
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

        // Build context string
        let context = `📚 TENAX PROJECT MEMORY\nStats: ${totalSessions} sessions | ${totalDecisions} decisions | ${totalPatterns} patterns | ${pendingTasks} pending tasks | ${totalInsights} insights`;

        if (recentDecisions) {
            context += `\n\nRecent decisions:\n${recentDecisions}`;
        }

        if (pendingTasksList) {
            context += `\n\nPending tasks:\n${pendingTasksList}`;
        }

        context += `\n\nPROTOCOL: Use [D] [P] [T] [I] markers in responses. Search before decisions.`;

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
