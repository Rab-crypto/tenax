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

        // Build compact reminder - emphasize using tools to retrieve context
        const context = `⚠️ CONTEXT COMPACTED - Project memory available via Tenax:
• Run /tenax:search <topic> before answering questions about prior decisions or patterns
• Run /tenax:status for full overview of project knowledge
• Use [D] [P] [T] [I] markers for any new decisions, patterns, tasks, insights

Available: ${totalSessions} sessions | ${totalDecisions} decisions | ${totalPatterns} patterns | ${pendingTasks} pending tasks | ${totalInsights} insights`;

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
