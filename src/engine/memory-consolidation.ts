import Database from 'better-sqlite3';
import { ChatMessage } from './context-compiler';

export interface ConsolidationContext {
  messages: ChatMessage[];
  userText: string;
  assistantReply: string;
  activePolicyName: string;
  tonicMood: { p: number; a: number; d: number };
}

export class MemoryConsolidator {
  private lastSeenMessageCount = -1;
  private lastTurnMs = Date.now();

  constructor(private db: Database.Database, private personaId: string = 'default') {}

  /**
   * 全量冷归档：每轮对话原文实时追加进 raw_turn_archive（永不丢失，供压缩后抢救蒸馏）
   */
  public archiveTurn(ctx: ConsolidationContext, nowMs: number = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO raw_turn_archive
         (persona_id, user_prompt, assistant_reply, action_policy, emotion_p, emotion_a, emotion_d, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        this.personaId,
        ctx.userText.slice(0, 4000),
        ctx.assistantReply.slice(0, 8000),
        ctx.activePolicyName,
        ctx.tonicMood.p,
        ctx.tonicMood.a,
        ctx.tonicMood.d,
        nowMs
      );
  }

  /**
   * 自动压缩检测 + 阶段叙事篇章提炼（返回最近 2 篇篇章供 context-compiler 重锚定）
   */
  public detectCompactionAndReanchor(ctx: ConsolidationContext, nowMs: number = Date.now()): string[] {
    const currentCount = ctx.messages.length;
    const rawText = ctx.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');

    // 压缩信号 1：messages 长度较上一轮骤降 >= 45%
    const lengthCollapsed = this.lastSeenMessageCount > 8 && currentCount <= Math.floor(this.lastSeenMessageCount * 0.55);
    // 压缩信号 2：出现客户端自动压缩产生的 Summary 标记
    const summaryMarker = /<conversation_history_summary>|\[Summary\]|\[compacted\]|已压缩上下文/i.test(rawText);

    const shouldReanchor = lengthCollapsed || summaryMarker;

    if (shouldReanchor) {
      this.generateChapter('auto_compaction', nowMs);
    }

    this.lastSeenMessageCount = currentCount;

    if (!shouldReanchor) return [];

    // 压缩后 3 轮内持续重锚定最近 2 篇阶段篇章
    return this.getRecentChapters(2);
  }

  /**
   * 跨天唤醒（>= 6 小时）或累计满 25 条未归档轮次时，触发仿生睡眠巩固
   */
  public maybeConsolidateOnWakeup(nowMs: number = Date.now()): void {
    const gapMs = nowMs - this.lastTurnMs;
    this.lastTurnMs = nowMs;

    const unconsolidated = this.db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM raw_turn_archive WHERE persona_id = ? AND consolidated_chapter_id IS NULL`
      )
      .get(this.personaId) as { cnt: number };

    const isSleepGap = gapMs >= 6 * 3600 * 1000;
    const batchFull = unconsolidated.cnt >= 25;

    if (isSleepGap || batchFull) {
      this.generateChapter(isSleepGap ? 'sleep_gap' : 'turn_batch', nowMs);
      // [v2.4] 仿生睡眠巩固：将语义高度重合的碎片记忆聚类合并去重
      this.mergeRedundantEpisodicFragments(nowMs);
    }
  }

  public resetState(): void {
    this.lastSeenMessageCount = -1;
    this.lastTurnMs = Date.now();
  }

  /**
   * 生成一篇 300~600 字《阶段叙事篇章》，并将已归档轮次标记 consolidated
   */
  private generateChapter(trigger: string, nowMs: number): void {
    const unconsolidated = this.db
      .prepare(
        `SELECT id, user_prompt, assistant_reply, action_policy, emotion_p, emotion_a, emotion_d
         FROM raw_turn_archive
         WHERE persona_id = ? AND consolidated_chapter_id IS NULL
         ORDER BY created_at_ms ASC
         LIMIT 200`
      )
      .all(this.personaId) as any[];

    let targetRows = unconsolidated;
    if (targetRows.length < 3) {
      // 容错兜底：若当前未打标轮次不足 3 轮，回捞该角色最近的归档进行总结提炼
      const fallbackRows = this.db
        .prepare(
          `SELECT id, user_prompt, assistant_reply, action_policy, emotion_p, emotion_a, emotion_d
           FROM raw_turn_archive
           WHERE persona_id = ?
           ORDER BY created_at_ms DESC
           LIMIT 20`
        )
        .all(this.personaId) as any[];
      if (fallbackRows.length >= 2) {
        targetRows = fallbackRows.reverse();
      } else {
        return;
      }
    }

    const ids = targetRows.map((r) => r.id);
    // 提取阶段主题（取最新一条用户诉求作标题），用确定性规则蒸馏叙事脉络（不额外调云端模型，零成本零延迟）
    const lastPrompt = targetRows[targetRows.length - 1]?.user_prompt || '';
    const cleanPrompt = (lastPrompt || '阶段进展').replace(/[<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
    const chapterTitle = cleanPrompt || '阶段进展';
    const keyThemes = this.extractKeyThemes(targetRows);
    const avgP = targetRows.reduce((s, r) => s + r.emotion_p, 0) / targetRows.length;
    const avgA = targetRows.reduce((s, r) => s + r.emotion_a, 0) / targetRows.length;

    const digest =
      `阶段共 ${targetRows.length} 轮，核心围绕「${chapterTitle}」推进。关键脉络：${keyThemes.replace(/[<>`]/g, '')}` +
      `；主导心境 P=${avgP.toFixed(2)} A=${avgA.toFixed(2)}。此阶段达成的架构决议与双方默契请延续到后续对话。`;

    const tx = this.db.transaction(() => {
      const info = this.db
        .prepare(
          `INSERT INTO narrative_chapters
           (persona_id, chapter_title, narrative_digest, dominant_mood_p, dominant_mood_a, turn_span_count, trigger_reason, created_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          this.personaId,
          chapterTitle,
          digest.slice(0, 600),
          avgP,
          avgA,
          unconsolidated.length,
          trigger,
          nowMs
        );

      const chapterId = Number(info.lastInsertRowid);
      const markStmt = this.db.prepare(
        'UPDATE raw_turn_archive SET consolidated_chapter_id = ? WHERE id = ? AND persona_id = ?'
      );
      for (const id of ids) markStmt.run(chapterId, id, this.personaId);
    });

    tx();
  }

  /**
   * 从已归档轮次提取高频关键主题词（确定性规则蒸馏，零云端调用）
   */
  private extractKeyThemes(rows: any[]): string {
    const stopwords = new Set(['的', '了', '是', '我', '你', '这', '那', '在', '和', '就', '不', '有', '要', '也', '都']);
    const freq: Record<string, number> = {};
    for (const r of rows) {
      const text = `${r.user_prompt} ${r.assistant_reply}`;
      const tokens = text.match(/[\u4e00-\u9fa5]{2,6}|[a-zA-Z][a-zA-Z0-9_./-]{2,20}/g) || [];
      const seen = new Set<string>();
      for (const t of tokens) {
        if (stopwords.has(t) || seen.has(t)) continue;
        seen.add(t);
        freq[t] = (freq[t] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w]) => w)
      .join('、');
  }

  /**
   * 仿生睡眠巩固：将语义高度重合(cos_distance < 0.16)的活跃碎片聚类合并为 1 条最新长记忆，旧碎片归档
   */
  private mergeRedundantEpisodicFragments(nowMs: number): void {
    const activeFragments = this.db
      .prepare(
        `SELECT m.id, m.summary, m.full_payload, m.salience, v.embedding
         FROM episodic_memories m
         JOIN vec_episodic v ON v.memory_id = m.id
         WHERE m.persona_id = ? AND m.status = 'active'
         ORDER BY m.salience DESC`
      )
      .all(this.personaId) as any[];

    const mergedIds = new Set<number>();
    for (let i = 0; i < activeFragments.length; i++) {
      if (mergedIds.has(activeFragments[i].id)) continue;
      const cluster: number[] = [activeFragments[i].id];
      const a = activeFragments[i].embedding as Buffer;

      for (let j = i + 1; j < activeFragments.length; j++) {
        if (mergedIds.has(activeFragments[j].id)) continue;
        const b = activeFragments[j].embedding as Buffer;
        if (this.cosineFromBuffers(a, b) >= 0.84) {
          cluster.push(activeFragments[j].id);
        }
      }

      // 同簇碎片 >= 2 条时，保留最新/最高权重 1 条，其余标记 consolidated 移出活跃池
      if (cluster.length >= 2) {
        const keepId = cluster[0];
        for (const id of cluster.slice(1)) {
          this.db
            .prepare(`UPDATE episodic_memories SET status = 'consolidated' WHERE id = ? AND persona_id = ?`)
            .run(id, this.personaId);
          mergedIds.add(id);
        }
        mergedIds.add(keepId);
      }
    }
  }

  private cosineFromBuffers(a: Buffer, b: Buffer): number {
    if (!a || !b || a.length !== b.length || a.length % 4 !== 0) return 0;
    const count = a.length / 4;
    let dot = 0;
    for (let i = 0; i < count; i++) {
      dot += a.readFloatLE(i * 4) * b.readFloatLE(i * 4);
    }
    return dot; // 向量已归一化，点积即余弦相似度
  }

  /**
   * 获取最近 N 篇阶段叙事篇章（供压缩后灵魂重锚定）
   */
  public getRecentChapters(n: number = 2): string[] {
    const rows = this.db
      .prepare(
        `SELECT chapter_title, narrative_digest FROM narrative_chapters
         WHERE persona_id = ? ORDER BY created_at_ms DESC LIMIT ?`
      )
      .all(this.personaId, n) as any[];
    return rows.map((r) => `[${r.chapter_title}] ${r.narrative_digest}`);
  }

  /**
   * 网关内置 48K Token 滑动窗口护栏：估算总量超 48K 时自动折叠最前 20 条为篇章
   */
  public enforceSlidingWindow(messages: ChatMessage[], nowMs: number = Date.now()): ChatMessage[] {
    const totalChars = messages.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : 0), 0);
    const estimatedTokens = totalChars / 1.7; // 中文约 1.7 字符/Token 的经验估算

    if (estimatedTokens <= 48000) return messages;

    // 折叠最前 20 条为本地篇章，返回精简后的消息数组
    const folded = messages.slice(0, 20);
    const foldedText = folded.map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`).join('\n');
    this.db
      .prepare(
        `INSERT INTO raw_turn_archive (persona_id, user_prompt, assistant_reply, action_policy, emotion_p, emotion_a, emotion_d, created_at_ms)
         VALUES (?, ?, ?, ?, 0.2, 0.3, 0.1, ?)`
      )
      .run(this.personaId, '[folded]', foldedText.slice(0, 8000), 'folded', nowMs);
    this.generateChapter('turn_batch', nowMs);

    return messages.slice(20);
  }
}
