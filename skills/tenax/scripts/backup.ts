#!/usr/bin/env tsx

/**
 * Create a backup of all Tenax data
 * Creates a cross-platform JSON backup with base64-encoded file contents
 */

import { parseArgs } from "util";
import { join, relative } from "node:path";
import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import type { ScriptOutput } from "../lib/types";
import { getProjectRoot, getMemoryPath, isMemoryInitialized } from "../lib/storage";

interface BackupFile {
  path: string;
  content: string; // base64 encoded
  size: number;
}

interface BackupData {
  version: "1.0";
  timestamp: string;
  projectPath: string;
  files: BackupFile[];
}

interface BackupOutput {
  backupPath: string;
  size: number;
  timestamp: string;
  fileCount: number;
}

async function collectFilesRecursively(dir: string, baseDir: string): Promise<BackupFile[]> {
  const files: BackupFile[] = [];

  async function walkDir(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        const content = await readFile(fullPath);
        const stats = await stat(fullPath);
        const relativePath = relative(baseDir, fullPath);

        files.push({
          path: relativePath.replace(/\\/g, "/"), // Normalize path separators
          content: content.toString("base64"),
          size: stats.size,
        });
      }
    }
  }

  await walkDir(dir);
  return files;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output: { type: "string", short: "o" },
    },
    strict: false,
    allowPositionals: true,
  });

  const output: ScriptOutput<BackupOutput> = {
    success: false,
    message: "",
  };

  const projectRoot = getProjectRoot();

  if (!(await isMemoryInitialized(projectRoot))) {
    output.message = "Project memory not initialized - nothing to backup";
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }

  try {
    const memoryPath = getMemoryPath(projectRoot);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const defaultBackupName = `tenax-backup-${timestamp}.json`;
    const backupPath = (values.output as string) || join(projectRoot, defaultBackupName);

    // Collect all files from memory directory
    const files = await collectFilesRecursively(memoryPath, projectRoot);

    // Create backup data structure
    const backupData: BackupData = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      projectPath: projectRoot,
      files,
    };

    // Write backup file
    const backupContent = JSON.stringify(backupData, null, 2);
    await writeFile(backupPath, backupContent, "utf8");

    const stats = await stat(backupPath);
    const size = stats.size;

    const backupOutput: BackupOutput = {
      backupPath,
      size,
      timestamp,
      fileCount: files.length,
    };

    output.success = true;
    output.message = `Backup created: ${backupPath} (${formatSize(size)}, ${files.length} files)`;
    output.data = backupOutput;

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    output.success = false;
    output.message = `Backup failed: ${error instanceof Error ? error.message : String(error)}`;
    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

main();
