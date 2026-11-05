import Database from 'better-sqlite3';
import { PADState } from './affective-ssm';
import { buildStructuralDigest } from './implicit-rl';

export interface RecalledMemory {
  id: number;
  summary: string;
  verbatim_quote: string;
  full_payload: string;   // [v2.4] Top-1 高匹配时展开的完整长文本载荷
  emotion_p: number;
  emotion_a: number;
  emotion_d: number;
  salience: number;
  final_score: number;
  semantic_sim: number;   // [v2.4] 归一化语义相似度，供 context-compiler 判定是否展开长文本
}

function toVectorBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export class MemoryRetriever {
  constructor(private db: Database.Database, private personaId: string = 'default') {}

  /**
   * 写入长期闪回记忆（v2.4：60字检索头 + 最长2000字长文本载荷 + 同主题旧记忆覆写）
   */
  public commitEpisodicMemory(
    summary: string,
    verbatimQuote: string,
    mood: PADState,
    salience: number,
    embedding: Float32Array,
    fullPayload: string = '',
    nowMs: number = Date.now()
  ): void {
    if (!summary || salience < 0.35 || !(embedding instanceof Float32Array) || embedding.length !== 512) return;

    const cleanSummary = summary.replace(/[<>`]/g, '').trim().slice(0, 60);
    const cleanQuote = buildStructuralDigest(verbatimQuote, 90);
    // [v2.4] 长文本载荷：保留完整长段技术规范/业务长文本，最多 2000 字，剥离尖括号防注入
    const cleanPayload = (fullPayload || verbatimQuote)
      .replace(/<[^>]+>/g, '')
      .replace(/[`]/g, "'")
      .trim()
      .slice(0, 2000);

    const safeP = Number.isFinite(mood.p) ? Math.max(-1, Math.min(1, mood.p)) : 0.2;
    const safeA = Number.isFinite(mood.a) ? Math.max(0, Math.min(1, mood.a)) : 0.3;
    const safeD = Number.isFinite(mood.d) ? Math.max(-1, Math.min(1, mood.d)) : 0.1;
    const safeSalience = Number.isFinite(salience) ? Math.max(0, Math.min(1, salience)) : 0.5;

    const tx = this.db.transaction(() => {
      // [v2.4] 覆写检测：语义高度重合(cos_distance < 0.30)的活跃旧记忆降级为 superseded
      const overlaps = this.db
        .prepare(
          `SELECT m.id, v.distance
           FROM vec_episodic v
           JOIN episodic_memories m ON m.id = v.memory_id
           WHERE v.embedding MATCH ? AND k = 3 AND v.persona_id = ? AND m.status = 'active'`
        )
        .all(toVectorBuffer(embedding), this.personaId) as any[];
      if (overlaps.length > 0) {
        const supersedeStmt = this.db.prepare(
          `UPDATE episodic_memories SET status = 'superseded' WHERE id = ? AND persona_id = ?`
        );
        for (const ov of overlaps) {
          const dist = (ov as any).distance;
          if (typeof dist === 'number' && Number.isFinite(dist) && dist < 0.30) {
            supersedeStmt.run(ov.id, this.personaId);
          }
        }
      }

      const info = this.db
        .prepare(
          `INSERT INTO episodic_memories
           (persona_id, summary, full_payload, verbatim_quote, emotion_p, emotion_a, emotion_d, salience, status, created_at_ms, last_accessed_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
        )
        .run(
          this.personaId,
          cleanSummary,
          cleanPayload,
          cleanQuote,
          safeP,
          safeA,
          safeD,
          safeSalience,
          nowMs,
          nowMs
        );

      // CRITICAL: vec0 主键必须绑定为 BigInt
      const rowIdBigInt = BigInt(info.lastInsertRowid);
      this.db
        .prepare(
          'INSERT INTO vec_episodic (memory_id, persona_id, embedding) VALUES (?, ?, ?)'
        )
        .run(rowIdBigInt, this.personaId, toVectorBuffer(embedding));
    });

    tx();
  }

  public retrieveHybridMemories(
    queryEmbedding: Float32Array,
    currentMood: PADState,
    topK: number = 4
  ): RecalledMemory[] {
    if (!queryEmbedding || !(queryEmbedding instanceof Float32Array) || queryEmbedding.length !== 512) {
      return [];
    }

    const candidates = this.db
      .prepare(
        `SELECT
           m.id, m.summary, m.verbatim_quote, m.full_payload,
           m.emotion_p, m.emotion_a, m.emotion_d,
           m.salience, m.access_count, m.created_at_ms, m.last_accessed_ms,
           v.distance AS cos_distance
         FROM vec_episodic v
         JOIN episodic_memories m ON m.id = v.memory_id
         WHERE v.embedding MATCH ? AND k = 20 AND v.persona_id = ? AND m.status = 'active'`
      )
      .all(toVectorBuffer(queryEmbedding), this.personaId) as any[];

    const nowMs = Date.now();

    const scored = candidates.map((c) => {
      const rawDist = c.cos_distance;
      const safeDist = typeof rawDist === 'number' && Number.isFinite(rawDist) ? rawDist : 1.0;
      const semanticSim = Math.max(0, Math.min(1, 1 - safeDist));
      const moodDistSq =
        Math.pow(currentMood.p - c.emotion_p, 2) +
        Math.pow(currentMood.a - c.emotion_a, 2) +
        Math.pow(currentMood.d - c.emotion_d, 2);

      // 闪回记忆不应期抑制：3 分钟内刚被唤醒过的记忆，心境共鸣权重乘以 0.35，防止连续反刍同一旧事
      const isInRefractoryPeriod = nowMs - c.last_accessed_ms < 3 * 60 * 1000 && c.access_count > 0;
      const refractoryMultiplier = isInRefractoryPeriod ? 0.35 : 1.0;
      const moodCongruence = Math.exp(-moodDistSq) * refractoryMultiplier;

      const ageDays = Math.max(0, (nowMs - c.created_at_ms) / (1000 * 3600 * 24));
      const halfLifeDays = 7 * (1 + c.salience * 8 + Math.log1p(c.access_count) * 2);
      const retention = Math.exp(-ageDays / halfLifeDays);

      const finalScore =
        0.45 * semanticSim + 0.20 * moodCongruence + 0.20 * c.salience + 0.15 * retention;

      return {
        id: c.id,
        summary: c.summary,
        verbatim_quote: c.verbatim_quote,
        full_payload: c.full_payload || '',
        emotion_p: c.emotion_p,
        emotion_a: c.emotion_a,
        emotion_d: c.emotion_d,
        salience: c.salience,
        final_score: Number(finalScore.toFixed(4)),
        semantic_sim: Number(semanticSim.toFixed(4)),
      };
    });

    scored.sort((a, b) => b.final_score - a.final_score);
    const selected = scored.slice(0, topK);

    if (selected.length > 0) {
      const stmt = this.db.prepare(
        'UPDATE episodic_memories SET access_count = access_count + 1, last_accessed_ms = ? WHERE id = ?'
      );
      for (const item of selected) stmt.run(nowMs, item.id);
    }

    return selected;
  }
}
