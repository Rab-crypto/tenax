#!/usr/bin/env tsx

/**
 * Restore Tenax from a backup
 * Supports JSON backup format created by backup.ts
 */

import { parseArgs } from "util";
import { join, dirname } from "node:path";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import type { ScriptOutput } from "../lib/types";
import { getProjectRoot, getMemoryPath } from "../lib/storage";

interface BackupFile {
  path: string;
  content: string; // base64 encoded
  size: number;
}

interface BackupData {
  version: string;
  timestamp: string;
  projectPath: string;
  files: BackupFile[];
}

interface RestoreOutput {
  backupPath: string;
  restored: boolean;
  fileCount: number;
  backupTimestamp: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      force: { type: "boolean", short: "f" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<RestoreOutput> = {
    success: false,
    message: "",
  };

  const backupPath = positionals[0];
  const force = values.force as boolean | undefined;

  if (!backupPath) {
    output.message = "Usage: restore.ts <backup-file.json> [--force]";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  const projectRoot = getProjectRoot();

  try {
    if (!(await fileExists(backupPath))) {
      output.message = `Backup file not found: ${backupPath}`;
      console.log(JSON.stringify(output, null, 2));
      process.exit(1);
    }

    const memoryPath = getMemoryPath(projectRoot);

    // Check if memory already exists
    if (!force) {
      if (await fileExists(join(memoryPath, "index.json"))) {
        output.message = "Project memory already exists. Use --force to overwrite.";
        console.log(JSON.stringify(output, null, 2));
        process.exit(1);
      }
    }

    // Read and parse backup file
    const backupContent = await readFile(backupPath, "utf8");
    const backupData: BackupData = JSON.parse(backupContent);

    // Validate backup format
    if (!backupData.version || !backupData.files) {
      throw new Error("Invalid backup format: missing version or files");
    }

    // Restore each file
    let restoredCount = 0;
    for (const file of backupData.files) {
      const targetPath = join(projectRoot, file.path);
      const targetDir = dirname(targetPath);

      // Ensure directory exists
      await mkdir(targetDir, { recursive: true });

      // Decode and write file content
      const content = Buffer.from(file.content, "base64");
      await writeFile(targetPath, content);
      restoredCount++;
    }

    const restoreOutput: RestoreOutput = {
      backupPath,
      restored: true,
      fileCount: restoredCount,
      backupTimestamp: backupData.timestamp,
    };

    output.success = true;
    output.message = `Restored ${restoredCount} files from backup (${backupData.timestamp})`;
    output.data = restoreOutput;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Restore failed: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

main();
