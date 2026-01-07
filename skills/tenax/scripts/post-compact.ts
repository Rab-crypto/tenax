#!/usr/bin/env tsx

/**
 * SessionStart hook (compact matcher) - runs after context compaction
 * Outputs a light reminder to use Tenax tools for context retrieval
 */

import { getProjectRoot, loadIndex, isMemoryInitialized } from "../lib/storage";

async function main(): Promise<void> {
    try {
        const projectRoot = getProjectRoot();

        // Check if memory is initialized
        if (!(await isMemoryInitialized(projectRoot))) {
            const output = {
                hookSpecificOutput: {
                    hookEventName: "SessionStart",
                    additionalContext: ""
                }
            };
            console.log(JSON.stringify(output));
            return;
        }

        // Load the project index for stats
        const index = await loadIndex(projectRoot);

        // Calculate stats
        const totalSessions = index.sessions.length;
        const totalDecisions = index.decisions.length;
        const totalPatterns = index.patterns.length;
        const pendingTasks = index.tasks.filter(t => t.status === "pending").length;
        const totalInsights = index.insights.length;

        // Build compact reminder - consistent with session-start
        const context = `⚠️ CONTEXT COMPACTED - Use /tenax:search <topic> for prior decisions.
🔴 REQUIRED: Include markers inline - [D] topic: | [P] name: | [T] | [I]

📚 ${totalSessions} sessions | ${totalDecisions} decisions | ${totalPatterns} patterns | ${pendingTasks} pending`;

        // Output JSON format for reliable context injection
        const output = {
            hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: context
            }
        };
        console.log(JSON.stringify(output));

    } catch (error) {
        // Silent fail - don't disrupt session
        const output = {
            hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: ""
            }
        };
        console.log(JSON.stringify(output));
    }
}

main();
