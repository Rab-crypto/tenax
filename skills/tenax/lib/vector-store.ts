/**
 * Vector store using sqlite-vec for efficient similarity search
 * Falls back to in-memory cosine similarity if sqlite-vec fails
 */

import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import type { EmbeddingEntry, SearchResult } from "./types";
import { EMBEDDING_DIM, cosineSimilarity } from "./embeddings";

export class VectorStore {
  private db: Database;
  private usingSqliteVec: boolean = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    // Create metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        session_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create JSON embeddings table (fallback)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_vectors (
        id TEXT PRIMARY KEY,
        vector TEXT NOT NULL,
        FOREIGN KEY (id) REFERENCES embeddings(id) ON DELETE CASCADE
      );
    `);

    // Try to load sqlite-vec extension
    try {
      sqliteVec.load(this.db);

      // Create virtual table for vector search with explicit id column
      // Using id as integer for vec_embeddings to match rowid semantics
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings
        USING vec0(
          embedding float[${EMBEDDING_DIM}]
        );
      `);

      // Create mapping table to link vec_embeddings rowid to embeddings id
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS vec_id_map (
          vec_rowid INTEGER PRIMARY KEY,
          embedding_id TEXT NOT NULL UNIQUE,
          FOREIGN KEY (embedding_id) REFERENCES embeddings(id) ON DELETE CASCADE
        );
      `);

      this.usingSqliteVec = true;
      console.error("sqlite-vec loaded successfully");
    } catch (error) {
      console.error("sqlite-vec not available, using fallback:", error);
      this.usingSqliteVec = false;
    }
  }

  /**
   * Insert an embedding entry
   */
  async insert(entry: EmbeddingEntry, embedding: Float32Array): Promise<void> {
    // Insert metadata
    const insertMeta = this.db.prepare(`
      INSERT OR REPLACE INTO embeddings (id, type, text, session_id)
      VALUES (?, ?, ?, ?)
    `);
    insertMeta.run(entry.id, entry.type, entry.text, entry.sessionId || null);

    if (this.usingSqliteVec) {
      // Check if we already have a mapping for this id
      const existingMap = this.db.prepare(
        "SELECT vec_rowid FROM vec_id_map WHERE embedding_id = ?"
      ).get(entry.id) as { vec_rowid: number } | null;

      if (existingMap) {
        // Update existing vector
        const updateVec = this.db.prepare(`
          UPDATE vec_embeddings SET embedding = vec_f32(?) WHERE rowid = ?
        `);
        updateVec.run(Buffer.from(embedding.buffer), existingMap.vec_rowid);
      } else {
        // Insert new vector and create mapping
        const insertVec = this.db.prepare(`
          INSERT INTO vec_embeddings (embedding) VALUES (vec_f32(?))
        `);
        const result = insertVec.run(Buffer.from(embedding.buffer));
        const vecRowid = result.lastInsertRowid;

        // Create mapping
        const insertMap = this.db.prepare(`
          INSERT INTO vec_id_map (vec_rowid, embedding_id) VALUES (?, ?)
        `);
        insertMap.run(vecRowid, entry.id);
      }
    } else {
      // Fallback: store as JSON
      const insertVec = this.db.prepare(`
        INSERT OR REPLACE INTO embedding_vectors (id, vector)
        VALUES (?, ?)
      `);
      insertVec.run(entry.id, JSON.stringify(Array.from(embedding)));
    }
  }

  /**
   * Insert multiple embeddings in a transaction
   */
  async insertBatch(
    entries: Array<{ entry: EmbeddingEntry; embedding: Float32Array }>
  ): Promise<void> {
    const transaction = this.db.transaction(() => {
      for (const { entry, embedding } of entries) {
        // Insert metadata
        const insertMeta = this.db.prepare(`
          INSERT OR REPLACE INTO embeddings (id, type, text, session_id)
          VALUES (?, ?, ?, ?)
        `);
        insertMeta.run(entry.id, entry.type, entry.text, entry.sessionId || null);

        if (this.usingSqliteVec) {
          // Check if we already have a mapping for this id
          const existingMap = this.db.prepare(
            "SELECT vec_rowid FROM vec_id_map WHERE embedding_id = ?"
          ).get(entry.id) as { vec_rowid: number } | null;

          if (existingMap) {
            // Update existing vector
            const updateVec = this.db.prepare(`
              UPDATE vec_embeddings SET embedding = vec_f32(?) WHERE rowid = ?
            `);
            updateVec.run(Buffer.from(embedding.buffer), existingMap.vec_rowid);
          } else {
            // Insert new vector and create mapping
            const insertVec = this.db.prepare(`
              INSERT INTO vec_embeddings (embedding) VALUES (vec_f32(?))
            `);
            const result = insertVec.run(Buffer.from(embedding.buffer));
            const vecRowid = result.lastInsertRowid;

            // Create mapping
            const insertMap = this.db.prepare(`
              INSERT INTO vec_id_map (vec_rowid, embedding_id) VALUES (?, ?)
            `);
            insertMap.run(vecRowid, entry.id);
          }
        } else {
          const insertVec = this.db.prepare(`
            INSERT OR REPLACE INTO embedding_vectors (id, vector)
            VALUES (?, ?)
          `);
          insertVec.run(entry.id, JSON.stringify(Array.from(embedding)));
        }
      }
    });

    transaction();
  }

  /**
   * Search for similar embeddings
   */
  async search(
    queryEmbedding: Float32Array,
    limit: number = 10,
    typeFilter?: string
  ): Promise<SearchResult[]> {
    if (this.usingSqliteVec) {
      return this.searchWithVec(queryEmbedding, limit, typeFilter);
    } else {
      return this.searchFallback(queryEmbedding, limit, typeFilter);
    }
  }

  private searchWithVec(
    queryEmbedding: Float32Array,
    limit: number,
    typeFilter?: string
  ): SearchResult[] {
    let query: string;
    let results: Array<{
      id: string;
      type: string;
      text: string;
      distance: number;
    }>;

    // Use vec_id_map to reliably join vec_embeddings to embeddings
    if (typeFilter) {
      query = `
        SELECT
          e.id,
          e.type,
          e.text,
          v.distance
        FROM vec_embeddings v
        JOIN vec_id_map m ON m.vec_rowid = v.rowid
        JOIN embeddings e ON e.id = m.embedding_id
        WHERE v.embedding MATCH ?
          AND k = ?
          AND e.type = ?
        ORDER BY v.distance
      `;
      results = this.db.prepare(query).all(Buffer.from(queryEmbedding.buffer), limit, typeFilter) as typeof results;
    } else {
      query = `
        SELECT
          e.id,
          e.type,
          e.text,
          v.distance
        FROM vec_embeddings v
        JOIN vec_id_map m ON m.vec_rowid = v.rowid
        JOIN embeddings e ON e.id = m.embedding_id
        WHERE v.embedding MATCH ?
          AND k = ?
        ORDER BY v.distance
      `;
      results = this.db.prepare(query).all(Buffer.from(queryEmbedding.buffer), limit) as typeof results;
    }

    return results.map((r) => ({
      id: r.id,
      type: r.type as SearchResult["type"],
      score: 1 - r.distance, // Convert distance to similarity
      snippet: r.text.substring(0, 200),
    }));
  }

  private searchFallback(
    queryEmbedding: Float32Array,
    limit: number,
    typeFilter?: string
  ): SearchResult[] {
    // Load all embeddings for comparison
    let query = `
      SELECT e.id, e.type, e.text, v.vector
      FROM embeddings e
      JOIN embedding_vectors v ON e.id = v.id
    `;

    if (typeFilter) {
      query += ` WHERE e.type = ?`;
    }

    const rows = typeFilter
      ? (this.db.prepare(query).all(typeFilter) as Array<{
          id: string;
          type: string;
          text: string;
          vector: string;
        }>)
      : (this.db.prepare(query).all() as Array<{
          id: string;
          type: string;
          text: string;
          vector: string;
        }>);

    // Calculate similarities
    const scored = rows.map((row) => {
      const vector = new Float32Array(JSON.parse(row.vector));
      const score = cosineSimilarity(queryEmbedding, vector);
      return {
        id: row.id,
        type: row.type as SearchResult["type"],
        score,
        snippet: row.text.substring(0, 200),
      };
    });

    // Sort by score descending and return top results
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * Delete an embedding by ID
   */
  async delete(id: string): Promise<void> {
    // Get vec_rowid from mapping table for vec_embeddings
    if (this.usingSqliteVec) {
      const mapResult = this.db.prepare(
        "SELECT vec_rowid FROM vec_id_map WHERE embedding_id = ?"
      ).get(id) as { vec_rowid: number } | null;

      if (mapResult) {
        this.db.prepare("DELETE FROM vec_embeddings WHERE rowid = ?").run(mapResult.vec_rowid);
        this.db.prepare("DELETE FROM vec_id_map WHERE embedding_id = ?").run(id);
      }
    }

    // Delete from fallback table
    this.db.prepare("DELETE FROM embedding_vectors WHERE id = ?").run(id);

    // Delete metadata
    this.db.prepare("DELETE FROM embeddings WHERE id = ?").run(id);
  }

  /**
   * Delete all embeddings for a session
   */
  async deleteBySession(sessionId: string): Promise<void> {
    const ids = this.db
      .prepare("SELECT id FROM embeddings WHERE session_id = ?")
      .all(sessionId) as Array<{ id: string }>;

    for (const { id } of ids) {
      await this.delete(id);
    }
  }

  /**
   * Get count of embeddings
   */
  getCount(): number {
    const result = this.db.prepare("SELECT COUNT(*) as count FROM embeddings").get() as {
      count: number;
    };
    return result.count;
  }

  /**
   * Get count by type
   */
  getCountByType(): Record<string, number> {
    const results = this.db
      .prepare("SELECT type, COUNT(*) as count FROM embeddings GROUP BY type")
      .all() as Array<{ type: string; count: number }>;

    const counts: Record<string, number> = {};
    for (const { type, count } of results) {
      counts[type] = count;
    }
    return counts;
  }

  /**
   * Check if an ID exists
   */
  exists(id: string): boolean {
    const result = this.db.prepare("SELECT 1 FROM embeddings WHERE id = ?").get(id);
    return result !== null;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Create a new vector store instance
 */
export function createVectorStore(dbPath: string): VectorStore {
  return new VectorStore(dbPath);
}
