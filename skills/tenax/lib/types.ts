// ============================================
// CONFIGURATION
// ============================================

export interface Config {
  version: string;
  tokenBudget: number;
  showCostEstimates: boolean;
  pricing?: {
    inputPer1MTokens: number | null;
    outputPer1MTokens: number | null;
    lastUpdated?: string;
  };
  autoLoad: "none" | "summary" | "recent-3" | "recent-5" | "prompt";
  autoCheckBeforeDecisions: boolean;
  autoRecordDecisions: boolean;
  maxSessionsStored: number;
  embeddingModel: string;
  sessionIdPadding: number; // Number of digits for session IDs (default: 3 = max 999)
}

export const DEFAULT_CONFIG: Config = {
  version: "1.0.0",
  tokenBudget: 80000,
  showCostEstimates: false,
  autoLoad: "summary",
  autoCheckBeforeDecisions: true,
  autoRecordDecisions: true,
  maxSessionsStored: 100,
  embeddingModel: "Xenova/all-MiniLM-L6-v2",
  sessionIdPadding: 3, // Supports up to 999 sessions; increase for larger projects
};

// ============================================
// KNOWLEDGE TYPES
// ============================================

export interface Decision {
  id: string;
  topic: string;
  decision: string;
  rationale: string;
  alternatives?: string[];
  sessionId: string;
  timestamp: string;
  tags?: string[];
  supersedes?: string;
}

export interface Pattern {
  id: string;
  name: string;
  description: string;
  usage: string;
  examples?: string[];
  sessionId: string;
  timestamp: string;
  tags?: string[];
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in-progress" | "completed" | "cancelled";
  priority?: "low" | "medium" | "high" | "critical";
  sessionCreated: string;
  sessionCompleted?: string;
  timestampCreated: string;
  timestampCompleted?: string;
  tags?: string[];
}

export interface Insight {
  id: string;
  content: string;
  context?: string;
  sessionId: string;
  timestamp: string;
  tags?: string[];
}

// ============================================
// SESSION DATA
// ============================================

export interface FileChange {
  path: string;
  action: "created" | "modified" | "deleted";
  timestamp: string;
}

export interface SessionMetadata {
  id: string;
  claudeSessionId: string;
  startTime: string;
  endTime: string;
  tokenCount: number;
  summary: string;
  decisionsCount: number;
  tasksCount: number;
  patternsCount: number;
  insightsCount: number;
  filesModified: number;
  tags?: string[];
}

export interface ProcessedSession {
  metadata: SessionMetadata;
  decisions: Decision[];
  patterns: Pattern[];
  tasks: Task[];
  insights: Insight[];
  fileChanges: FileChange[];
  keyTopics: string[];
  fullTranscript?: string;
}

// ============================================
// ACCUMULATED INDEX
// ============================================

export interface ProjectIndex {
  version: string;
  lastUpdated: string;
  projectPath: string;

  totalSessions: number;
  totalDecisions: number;
  totalPatterns: number;
  totalTasks: { pending: number; completed: number; cancelled?: number };
  totalInsights: number;

  decisions: Decision[];
  patterns: Pattern[];
  tasks: Task[];
  insights: Insight[];

  sessions: SessionMetadata[];

  topics: Record<string, string[]>;
}

export const DEFAULT_INDEX: ProjectIndex = {
  version: "1.0.0",
  lastUpdated: new Date().toISOString(),
  projectPath: "",

  totalSessions: 0,
  totalDecisions: 0,
  totalPatterns: 0,
  totalTasks: { pending: 0, completed: 0 },
  totalInsights: 0,

  decisions: [],
  patterns: [],
  tasks: [],
  insights: [],

  sessions: [],

  topics: {},
};

// ============================================
// EMBEDDING / VECTOR TYPES
// ============================================

export interface EmbeddingEntry {
  id: string;
  type: "decision" | "pattern" | "task" | "insight" | "session";
  text: string;
  sessionId?: string;
}

export interface SearchResult {
  id: string;
  type: "decision" | "pattern" | "task" | "insight" | "session";
  score: number;
  snippet?: string;
  content?: Decision | Pattern | Task | Insight | SessionMetadata;
}

// ============================================
// HOOK INPUT TYPES
// ============================================

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  tool_use_id?: string;
  reason?: string;
}

// ============================================
// SCRIPT OUTPUT TYPES
// ============================================

export interface ScriptOutput<T = unknown> {
  success: boolean;
  message?: string;
  tokenCount?: number;
  data?: T;
}

// ============================================
// TRANSCRIPT TYPES
// ============================================

export interface TranscriptMessage {
  type: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export interface TranscriptToolUse {
  type: "tool_use";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  timestamp?: string;
}

export interface TranscriptToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
  timestamp?: string;
}

export type TranscriptEntry =
  | TranscriptMessage
  | TranscriptToolUse
  | TranscriptToolResult;

// ============================================
// EXPORT TYPES
// ============================================

export type ExportFormat = "markdown" | "json" | "notion" | "obsidian";

export interface ExportOptions {
  format: ExportFormat;
  includeSessions?: boolean;
  includeTranscripts?: boolean;
  sessionIds?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
}

// ============================================
// STATS TYPES
// ============================================

export interface MemoryStats {
  totalSessions: number;
  totalDecisions: number;
  totalPatterns: number;
  totalTasks: { pending: number; completed: number; cancelled: number };
  totalInsights: number;
  totalTokens: number;
  oldestSession?: string;
  newestSession?: string;
  topTopics: Array<{ topic: string; count: number }>;
  sessionsPerMonth: Array<{ month: string; count: number }>;
  storageSize: {
    index: number;
    sessions: number;
    embeddings: number;
    total: number;
  };
}

// ============================================
// UTILITY TYPES
// ============================================

export type KnowledgeType = "decision" | "pattern" | "task" | "insight";

export interface ConflictInfo {
  existingId: string;
  existingContent: Decision | Pattern;
  newContent: Partial<Decision | Pattern>;
  similarity: number;
}

// ============================================
// EXTRACTION QUALITY TYPES
// ============================================

export interface QualityScore {
  score: number; // 0-1 similarity score
  passed: boolean;
  reasons?: string[];
}

export interface TextSegment {
  type: "prose" | "header" | "bullet" | "code" | "blockquote";
  content: string;
  level?: number; // For headers/bullets
}

export interface ExtractionCandidate {
  text: string;
  matchIndex: number;
  fullSentence: string;
  rationale?: string;
}
