#!/usr/bin/env bun

/**
 * Create a backup of all Tenax data
 * Creates a cross-platform JSON backup with base64-encoded file contents
 */

import { parseArgs } from "util";
import { join, relative } from "node:path";
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

async function collectFiles(dir: string, baseDir: string): Promise<BackupFile[]> {
  const files: BackupFile[] = [];
  const glob = new Bun.Glob("**/*");

  for await (const filePath of glob.scan({ cwd: dir, onlyFiles: true })) {
    const fullPath = join(dir, filePath);
    const file = Bun.file(fullPath);

    if (await file.exists()) {
      const content = await file.arrayBuffer();
      const relativePath = relative(baseDir, fullPath);

      files.push({
        path: relativePath.replace(/\\/g, "/"), // Normalize path separators
        content: Buffer.from(content).toString("base64"),
        size: file.size,
      });
    }
  }

  return files;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
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
    const files = await collectFiles(memoryPath, projectRoot);

    // Create backup data structure
    const backupData: BackupData = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      projectPath: projectRoot,
      files,
    };

    // Write backup file
    const backupContent = JSON.stringify(backupData, null, 2);
    await Bun.write(backupPath, backupContent);

    const backupFile = Bun.file(backupPath);
    const size = backupFile.size;

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
