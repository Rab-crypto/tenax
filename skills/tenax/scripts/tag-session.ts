#!/usr/bin/env tsx

/**
 * Add or remove tags from a session
 */

import { parseArgs } from "util";
import type { ScriptOutput, SessionMetadata } from "../lib/types";
import { loadIndex, saveIndex, getProjectRoot, isMemoryInitialized, normalizeSessionId, loadConfig } from "../lib/storage";

interface TagOutput {
  sessionId: string;
  tags: string[];
  action: "added" | "removed";
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      remove: { type: "boolean", short: "r" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<TagOutput> = {
    success: false,
    message: "",
  };

  const sessionId = positionals[0];
  const tags = positionals.slice(1);
  const remove = values.remove as boolean | undefined;

  if (!sessionId || tags.length === 0) {
    output.message = "Usage: tag-session.ts <session-id> <tag1> [tag2...] [--remove]";
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
    const config = await loadConfig(projectRoot);
    const index = await loadIndex(projectRoot);
    const paddedId = normalizeSessionId(sessionId, config.sessionIdPadding);

    const sessionIndex = index.sessions.findIndex((s) => s.id === paddedId);
    if (sessionIndex === -1) {
      output.message = `Session ${paddedId} not found`;
      console.log(JSON.stringify(output, null, 2));
      process.exit(1);
    }

    const session = index.sessions[sessionIndex]!;

    if (!session.tags) {
      session.tags = [];
    }

    if (remove) {
      // Remove tags
      session.tags = session.tags.filter((t: string) => !tags.includes(t));
    } else {
      // Add tags (avoid duplicates)
      for (const tag of tags) {
        if (!session.tags.includes(tag)) {
          session.tags.push(tag);
        }
      }
    }

    await saveIndex(index, projectRoot);

    const tagOutput: TagOutput = {
      sessionId: paddedId,
      tags: session.tags,
      action: remove ? "removed" : "added",
    };

    output.success = true;
    output.message = `Tags ${remove ? "removed from" : "added to"} session ${paddedId}: ${tags.join(", ")}`;
    output.data = tagOutput;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Failed to tag session: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
