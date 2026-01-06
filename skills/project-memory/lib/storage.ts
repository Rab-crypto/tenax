import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  Config,
  ProjectIndex,
  ProcessedSession,
  SessionMetadata,
} from "./types";
import { DEFAULT_CONFIG as defaultConfig, DEFAULT_INDEX as defaultIndex } from "./types";

// ============================================
// PATH UTILITIES
// ============================================

/**
 * Get the project root directory.
 * Priority:
 * 1. PROJECT_ROOT environment variable (set by hook context)
 * 2. CLAUDE_CWD environment variable (set by Claude Code)
 * 3. Current working directory (fallback)
 */
export function getProjectRoot(): string {
  return process.env.PROJECT_ROOT || process.env.CLAUDE_CWD || process.cwd();
}

/**
 * Set the project root (useful when processing hook input)
 */
export function setProjectRoot(path: string): void {
  process.env.PROJECT_ROOT = path;
}

export function getMemoryPath(projectRoot?: string): string {
  const root = projectRoot || getProjectRoot();
  return join(root, ".claude", "project-memory");
}

export function getConfigPath(projectRoot?: string): string {
  return join(getMemoryPath(projectRoot), "config.json");
}

export function getIndexPath(projectRoot?: string): string {
  return join(getMemoryPath(projectRoot), "index.json");
}

export function getSessionsPath(projectRoot?: string): string {
  return join(getMemoryPath(projectRoot), "sessions");
}

export function getSessionPath(sessionId: string, projectRoot?: string): string {
  return join(getSessionsPath(projectRoot), `${sessionId}.json`);
}

export function getSessionTranscriptPath(sessionId: string, projectRoot?: string): string {
  return join(getSessionsPath(projectRoot), `${sessionId}.jsonl`);
}

export function getEmbeddingsDbPath(projectRoot?: string): string {
  return join(getMemoryPath(projectRoot), "embeddings.db");
}

export function getTempFilePath(projectRoot?: string): string {
  return join(getMemoryPath(projectRoot), "temp-file-changes.json");
}

// ============================================
// DIRECTORY INITIALIZATION
// ============================================

export async function ensureDirectoryExists(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function initializeMemoryDirectory(projectRoot?: string): Promise<void> {
  const memoryPath = getMemoryPath(projectRoot);
  const sessionsPath = getSessionsPath(projectRoot);

  await ensureDirectoryExists(memoryPath);
  await ensureDirectoryExists(sessionsPath);
}

// ============================================
// CONFIG OPERATIONS
// ============================================

export async function loadConfig(projectRoot?: string): Promise<Config> {
  const configPath = getConfigPath(projectRoot);
  try {
    const file = Bun.file(configPath);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // Config doesn't exist or is invalid
  }
  return { ...defaultConfig };
}

export async function saveConfig(config: Config, projectRoot?: string): Promise<void> {
  const configPath = getConfigPath(projectRoot);
  await Bun.write(configPath, JSON.stringify(config, null, 2));
}

// ============================================
// INDEX OPERATIONS
// ============================================

export async function loadIndex(projectRoot?: string): Promise<ProjectIndex> {
  const indexPath = getIndexPath(projectRoot);
  try {
    const file = Bun.file(indexPath);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // Index doesn't exist or is invalid
  }
  return {
    ...defaultIndex,
    projectPath: projectRoot || getProjectRoot(),
    lastUpdated: new Date().toISOString(),
  };
}

export async function saveIndex(index: ProjectIndex, projectRoot?: string): Promise<void> {
  const indexPath = getIndexPath(projectRoot);
  index.lastUpdated = new Date().toISOString();
  await Bun.write(indexPath, JSON.stringify(index, null, 2));
}

// ============================================
// SESSION OPERATIONS
// ============================================

// Default padding length for session IDs
const DEFAULT_SESSION_ID_PADDING = 3;

export function generateSessionId(index: ProjectIndex, padding: number = DEFAULT_SESSION_ID_PADDING): string {
  return String(index.totalSessions + 1).padStart(padding, "0");
}

/**
 * Normalize a session ID to use consistent padding
 */
export function normalizeSessionId(id: string, padding: number = DEFAULT_SESSION_ID_PADDING): string {
  // Remove any leading zeros and re-pad
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return id; // Return as-is if not a number
  }
  return String(numericId).padStart(padding, "0");
}

/**
 * Find a session by its Claude session ID (for detecting pre-compact duplicates)
 */
export function findSessionByClaudeId(
  index: ProjectIndex,
  claudeSessionId: string
): SessionMetadata | undefined {
  return index.sessions.find((s) => s.claudeSessionId === claudeSessionId);
}

export async function loadSession(
  sessionId: string,
  projectRoot?: string
): Promise<ProcessedSession | null> {
  const sessionPath = getSessionPath(sessionId, projectRoot);
  try {
    const file = Bun.file(sessionPath);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // Session doesn't exist or is invalid
  }
  return null;
}

export async function saveSession(
  session: ProcessedSession,
  projectRoot?: string
): Promise<void> {
  const sessionPath = getSessionPath(session.metadata.id, projectRoot);
  await Bun.write(sessionPath, JSON.stringify(session, null, 2));
}

export async function loadSessions(
  sessionIds: string[],
  projectRoot?: string
): Promise<ProcessedSession[]> {
  const sessions: ProcessedSession[] = [];
  for (const id of sessionIds) {
    const session = await loadSession(id, projectRoot);
    if (session) {
      sessions.push(session);
    }
  }
  return sessions;
}

export async function sessionExists(sessionId: string, projectRoot?: string): Promise<boolean> {
  const sessionPath = getSessionPath(sessionId, projectRoot);
  const file = Bun.file(sessionPath);
  return await file.exists();
}

export async function listSessionFiles(projectRoot?: string): Promise<string[]> {
  const sessionsPath = getSessionsPath(projectRoot);
  const glob = new Bun.Glob("*.json");
  const files: string[] = [];

  for await (const file of glob.scan({ cwd: sessionsPath })) {
    // Extract session ID from filename (e.g., "001.json" -> "001")
    const id = file.replace(".json", "");
    files.push(id);
  }

  return files.sort();
}

/**
 * Delete a session and its associated data
 */
export async function deleteSession(sessionId: string, projectRoot?: string): Promise<void> {
  const fs = await import("node:fs/promises");

  // Delete session JSON file
  const sessionPath = getSessionPath(sessionId, projectRoot);
  await fs.unlink(sessionPath).catch(() => {});

  // Delete transcript JSONL file
  const transcriptPath = getSessionTranscriptPath(sessionId, projectRoot);
  await fs.unlink(transcriptPath).catch(() => {});
}

/**
 * Prune old sessions when maxSessionsStored is exceeded
 * Deletes oldest sessions first (by endTime)
 */
export async function pruneOldSessions(
  config: Config,
  index: ProjectIndex,
  projectRoot?: string
): Promise<{ pruned: number; remaining: number }> {
  const maxSessions = config.maxSessionsStored;

  if (maxSessions <= 0 || index.sessions.length <= maxSessions) {
    return { pruned: 0, remaining: index.sessions.length };
  }

  // Sort sessions by endTime (oldest first)
  const sortedSessions = [...index.sessions].sort(
    (a, b) => new Date(a.endTime).getTime() - new Date(b.endTime).getTime()
  );

  const sessionsToDelete = sortedSessions.slice(0, index.sessions.length - maxSessions);
  const sessionIdsToDelete = new Set(sessionsToDelete.map(s => s.id));

  // Delete session files
  for (const session of sessionsToDelete) {
    await deleteSession(session.id, projectRoot);
  }

  // Update index - remove deleted sessions
  index.sessions = index.sessions.filter(s => !sessionIdsToDelete.has(s.id));
  index.totalSessions = index.sessions.length;

  // Note: We don't delete the associated decisions/patterns/tasks/insights
  // as they may still be valuable even without the full session context
  // The embeddings are also kept for search functionality

  return { pruned: sessionsToDelete.length, remaining: index.sessions.length };
}

// ============================================
// RAW TRANSCRIPT OPERATIONS
// ============================================

export async function copyTranscript(
  sourcePath: string,
  sessionId: string,
  projectRoot?: string
): Promise<void> {
  const destPath = getSessionTranscriptPath(sessionId, projectRoot);
  const sourceFile = Bun.file(sourcePath);

  if (await sourceFile.exists()) {
    const content = await sourceFile.text();
    await Bun.write(destPath, content);
  }
}

export async function loadTranscript(
  sessionId: string,
  projectRoot?: string
): Promise<string | null> {
  const transcriptPath = getSessionTranscriptPath(sessionId, projectRoot);
  try {
    const file = Bun.file(transcriptPath);
    if (await file.exists()) {
      return await file.text();
    }
  } catch {
    // Transcript doesn't exist
  }
  return null;
}

// ============================================
// TEMPORARY FILE CHANGES
// ============================================

export interface TempFileChange {
  path: string;
  action: "created" | "modified";
  timestamp: string;
  toolName: string;
}

function getLockFilePath(projectRoot?: string): string {
  return join(getMemoryPath(projectRoot), ".temp-changes.lock");
}

/**
 * Simple file-based lock with timeout and retry
 */
async function acquireLock(projectRoot?: string, maxWaitMs: number = 5000): Promise<boolean> {
  const lockPath = getLockFilePath(projectRoot);
  const startTime = Date.now();
  const retryInterval = 50;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const lockFile = Bun.file(lockPath);
      if (await lockFile.exists()) {
        // Check if lock is stale (older than 30 seconds)
        const lockContent = await lockFile.text();
        const lockTime = parseInt(lockContent, 10);
        if (!isNaN(lockTime) && Date.now() - lockTime > 30000) {
          // Stale lock, remove it
          await Bun.write(lockPath, String(Date.now()));
          return true;
        }
        // Lock exists and is fresh, wait and retry
        await new Promise(resolve => setTimeout(resolve, retryInterval));
        continue;
      }
      // Create lock
      await Bun.write(lockPath, String(Date.now()));
      return true;
    } catch {
      // Retry on error
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
  return false;
}

async function releaseLock(projectRoot?: string): Promise<void> {
  const lockPath = getLockFilePath(projectRoot);
  try {
    const file = Bun.file(lockPath);
    if (await file.exists()) {
      // Use unlink equivalent - write empty and let it be overwritten
      await Bun.write(lockPath, "");
      // Actually remove the file by using the fs module
      const fs = await import("node:fs/promises");
      await fs.unlink(lockPath).catch(() => {});
    }
  } catch {
    // Ignore errors during lock release
  }
}

export async function loadTempFileChanges(projectRoot?: string): Promise<TempFileChange[]> {
  const tempPath = getTempFilePath(projectRoot);
  try {
    const file = Bun.file(tempPath);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return [];
}

export async function saveTempFileChanges(
  changes: TempFileChange[],
  projectRoot?: string
): Promise<void> {
  const tempPath = getTempFilePath(projectRoot);
  await Bun.write(tempPath, JSON.stringify(changes, null, 2));
}

export async function appendTempFileChange(
  change: TempFileChange,
  projectRoot?: string
): Promise<void> {
  // Acquire lock to prevent race conditions
  const acquired = await acquireLock(projectRoot);
  if (!acquired) {
    console.error("Warning: Could not acquire lock for temp file changes, proceeding anyway");
  }

  try {
    const changes = await loadTempFileChanges(projectRoot);
    changes.push(change);
    await saveTempFileChanges(changes, projectRoot);
  } finally {
    if (acquired) {
      await releaseLock(projectRoot);
    }
  }
}

export async function clearTempFileChanges(projectRoot?: string): Promise<void> {
  const tempPath = getTempFilePath(projectRoot);
  try {
    await Bun.write(tempPath, "[]");
  } catch {
    // Ignore errors
  }
}

// ============================================
// MEMORY CHECK
// ============================================

export async function isMemoryInitialized(projectRoot?: string): Promise<boolean> {
  const indexPath = getIndexPath(projectRoot);
  const file = Bun.file(indexPath);
  return await file.exists();
}

// ============================================
// STORAGE SIZE UTILITIES
// ============================================

export async function getStorageSize(projectRoot?: string): Promise<{
  index: number;
  sessions: number;
  embeddings: number;
  total: number;
}> {
  const indexFile = Bun.file(getIndexPath(projectRoot));
  const embeddingsFile = Bun.file(getEmbeddingsDbPath(projectRoot));

  const indexSize = (await indexFile.exists()) ? indexFile.size : 0;
  const embeddingsSize = (await embeddingsFile.exists()) ? embeddingsFile.size : 0;

  let sessionsSize = 0;
  const sessionIds = await listSessionFiles(projectRoot);
  for (const id of sessionIds) {
    const sessionFile = Bun.file(getSessionPath(id, projectRoot));
    const transcriptFile = Bun.file(getSessionTranscriptPath(id, projectRoot));

    if (await sessionFile.exists()) {
      sessionsSize += sessionFile.size;
    }
    if (await transcriptFile.exists()) {
      sessionsSize += transcriptFile.size;
    }
  }

  return {
    index: indexSize,
    sessions: sessionsSize,
    embeddings: embeddingsSize,
    total: indexSize + sessionsSize + embeddingsSize,
  };
}

// ============================================
// UUID GENERATION
// ============================================

export function generateId(): string {
  return crypto.randomUUID();
}
