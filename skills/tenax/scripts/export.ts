#!/usr/bin/env bun

/**
 * Export Tenax to various formats
 * Supports: markdown, json, obsidian
 */

import { parseArgs } from "util";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { ScriptOutput, ExportFormat, ExportOptions } from "../lib/types";
import { loadIndex, loadSession, getProjectRoot, isMemoryInitialized } from "../lib/storage";

interface ExportOutput {
  format: ExportFormat;
  outputPath: string;
  itemsExported: number;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      format: { type: "string", short: "f" },
      output: { type: "string", short: "o" },
      sessions: { type: "boolean", short: "s" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<ExportOutput> = {
    success: false,
    message: "",
  };

  const format = ((values.format as string) || "markdown") as ExportFormat;
  const includeSessions = values.sessions as boolean | undefined;

  if (!["markdown", "json", "obsidian", "notion"].includes(format)) {
    output.message = "Supported formats: markdown, json, obsidian, notion";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  const projectRoot = getProjectRoot();

  if (!(await isMemoryInitialized(projectRoot))) {
    output.message = "Project memory not initialized";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  try {
    const index = await loadIndex(projectRoot);
    const timestamp = new Date().toISOString().split("T")[0];
    const outputDir = (values.output as string) || join(projectRoot, `tenax-export-${timestamp}`);

    await mkdir(outputDir, { recursive: true });

    let itemsExported = 0;

    switch (format) {
      case "markdown":
        itemsExported = await exportMarkdown(index, outputDir, includeSessions, projectRoot);
        break;
      case "json":
        itemsExported = await exportJson(index, outputDir, includeSessions, projectRoot);
        break;
      case "obsidian":
        itemsExported = await exportObsidian(index, outputDir, includeSessions, projectRoot);
        break;
      case "notion":
        itemsExported = await exportMarkdown(index, outputDir, includeSessions, projectRoot); // Notion uses markdown
        break;
    }

    const exportOutput: ExportOutput = {
      format,
      outputPath: outputDir,
      itemsExported,
    };

    output.success = true;
    output.message = `Exported ${itemsExported} items to ${outputDir}`;
    output.data = exportOutput;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Export failed: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

async function exportMarkdown(
  index: Awaited<ReturnType<typeof loadIndex>>,
  outputDir: string,
  includeSessions: boolean | undefined,
  projectRoot: string
): Promise<number> {
  let count = 0;

  // Export decisions
  if (index.decisions.length > 0) {
    let md = "# Decisions\n\n";
    for (const decision of index.decisions) {
      md += `## ${decision.topic}\n\n`;
      md += `**Decision:** ${decision.decision}\n\n`;
      if (decision.rationale) {
        md += `**Rationale:** ${decision.rationale}\n\n`;
      }
      md += `*Recorded: ${decision.timestamp}*\n\n---\n\n`;
      count++;
    }
    await Bun.write(join(outputDir, "decisions.md"), md);
  }

  // Export patterns
  if (index.patterns.length > 0) {
    let md = "# Patterns\n\n";
    for (const pattern of index.patterns) {
      md += `## ${pattern.name}\n\n`;
      md += `${pattern.description}\n\n`;
      if (pattern.usage) {
        md += `**Usage:** ${pattern.usage}\n\n`;
      }
      md += `*Recorded: ${pattern.timestamp}*\n\n---\n\n`;
      count++;
    }
    await Bun.write(join(outputDir, "patterns.md"), md);
  }

  // Export tasks
  if (index.tasks.length > 0) {
    let md = "# Tasks\n\n";
    const pending = index.tasks.filter((t) => t.status === "pending");
    const completed = index.tasks.filter((t) => t.status === "completed");

    if (pending.length > 0) {
      md += "## Pending\n\n";
      for (const task of pending) {
        md += `- [ ] ${task.title}${task.priority ? ` (${task.priority})` : ""}\n`;
        count++;
      }
      md += "\n";
    }

    if (completed.length > 0) {
      md += "## Completed\n\n";
      for (const task of completed) {
        md += `- [x] ${task.title}\n`;
        count++;
      }
      md += "\n";
    }
    await Bun.write(join(outputDir, "tasks.md"), md);
  }

  // Export insights
  if (index.insights.length > 0) {
    let md = "# Insights\n\n";
    for (const insight of index.insights) {
      md += `- ${insight.content}`;
      if (insight.context) {
        md += ` *(${insight.context})*`;
      }
      md += "\n";
      count++;
    }
    await Bun.write(join(outputDir, "insights.md"), md);
  }

  // Export sessions (optional)
  if (includeSessions && index.sessions.length > 0) {
    await mkdir(join(outputDir, "sessions"), { recursive: true });
    for (const sessionMeta of index.sessions) {
      const session = await loadSession(sessionMeta.id, projectRoot);
      if (session) {
        let md = `# Session ${session.metadata.id}\n\n`;
        md += `**Date:** ${session.metadata.endTime}\n`;
        md += `**Summary:** ${session.metadata.summary}\n\n`;

        if (session.decisions.length > 0) {
          md += "## Decisions\n\n";
          for (const d of session.decisions) {
            md += `- **${d.topic}:** ${d.decision}\n`;
          }
          md += "\n";
        }

        if (session.fileChanges.length > 0) {
          md += "## Files Modified\n\n";
          for (const f of session.fileChanges) {
            md += `- ${f.action}: ${f.path}\n`;
          }
        }

        await Bun.write(join(outputDir, "sessions", `${session.metadata.id}.md`), md);
        count++;
      }
    }
  }

  return count;
}

async function exportJson(
  index: Awaited<ReturnType<typeof loadIndex>>,
  outputDir: string,
  includeSessions: boolean | undefined,
  projectRoot: string
): Promise<number> {
  let count = 0;

  // Export full index
  await Bun.write(join(outputDir, "index.json"), JSON.stringify(index, null, 2));
  count = index.decisions.length + index.patterns.length + index.tasks.length + index.insights.length;

  // Export sessions (optional)
  if (includeSessions) {
    await mkdir(join(outputDir, "sessions"), { recursive: true });
    for (const sessionMeta of index.sessions) {
      const session = await loadSession(sessionMeta.id, projectRoot);
      if (session) {
        await Bun.write(
          join(outputDir, "sessions", `${session.metadata.id}.json`),
          JSON.stringify(session, null, 2)
        );
        count++;
      }
    }
  }

  return count;
}

async function exportObsidian(
  index: Awaited<ReturnType<typeof loadIndex>>,
  outputDir: string,
  includeSessions: boolean | undefined,
  projectRoot: string
): Promise<number> {
  let count = 0;

  // Create Obsidian-style vault structure
  await mkdir(join(outputDir, "Decisions"), { recursive: true });
  await mkdir(join(outputDir, "Patterns"), { recursive: true });
  await mkdir(join(outputDir, "Tasks"), { recursive: true });
  await mkdir(join(outputDir, "Insights"), { recursive: true });

  // Export decisions as individual notes
  for (const decision of index.decisions) {
    const filename = `${decision.topic.replace(/[^a-zA-Z0-9]/g, "-")}-${decision.id.slice(0, 8)}.md`;
    let md = `---\ntags: [decision, ${decision.topic}]\ndate: ${decision.timestamp}\n---\n\n`;
    md += `# ${decision.topic}\n\n`;
    md += `${decision.decision}\n\n`;
    if (decision.rationale) {
      md += `## Rationale\n\n${decision.rationale}\n`;
    }
    await Bun.write(join(outputDir, "Decisions", filename), md);
    count++;
  }

  // Export patterns
  for (const pattern of index.patterns) {
    const filename = `${pattern.name.replace(/[^a-zA-Z0-9]/g, "-")}-${pattern.id.slice(0, 8)}.md`;
    let md = `---\ntags: [pattern]\ndate: ${pattern.timestamp}\n---\n\n`;
    md += `# ${pattern.name}\n\n`;
    md += `${pattern.description}\n\n`;
    if (pattern.usage) {
      md += `## Usage\n\n${pattern.usage}\n`;
    }
    await Bun.write(join(outputDir, "Patterns", filename), md);
    count++;
  }

  // Export tasks as a single file
  let tasksMd = "# Tasks\n\n";
  for (const task of index.tasks) {
    const checkbox = task.status === "completed" ? "[x]" : "[ ]";
    tasksMd += `- ${checkbox} ${task.title}`;
    if (task.priority) tasksMd += ` #${task.priority}`;
    tasksMd += "\n";
    count++;
  }
  await Bun.write(join(outputDir, "Tasks", "all-tasks.md"), tasksMd);

  // Export insights
  for (const insight of index.insights) {
    const filename = `insight-${insight.id.slice(0, 8)}.md`;
    let md = `---\ntags: [insight]\ndate: ${insight.timestamp}\n---\n\n`;
    md += insight.content;
    if (insight.context) {
      md += `\n\n## Context\n\n${insight.context}`;
    }
    await Bun.write(join(outputDir, "Insights", filename), md);
    count++;
  }

  return count;
}

main();
