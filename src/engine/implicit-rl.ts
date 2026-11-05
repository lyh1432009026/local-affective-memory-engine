import Database from 'better-sqlite3';
import { PADState } from './affective-ssm';
import { cosineSimilarity } from './embedding';

export interface PendingTurnSnapshot {
  turnId: string;
  userPrompt: string;
  userPromptEmbedding: number[]; // 用于下一轮检测是否为话题硬切换
  assistantReply: string;
  moodAtTurn: PADState;
  actionPolicy: string;
  referencedEpisodeIds: number[];
  referencedPolicyIds: number[]; // 用于闭环更新 behavioral_policies 的置信度
  timestampMs: number;
}

function clampScore(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** 清洗代码块与特殊标记，并提取结构元签名，严禁截断出未闭合的 ``` 或 <tag> 污染 Prompt */
export function buildStructuralDigest(raw: string, maxLen: number = 140): string {
  const hasCode = /```/.test(raw);
  const lineCount = raw.split('\n').length;
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, '[代码块]')
    .replace(/`+/g, "'")
    .replace(/[<>"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);

  return `[行数:${lineCount}|含代码:${hasCode ? '是' : '否'}] ${cleaned}`;
}

export class ImplicitRLManager {
  constructor(private db: Database.Database, private personaId: string = 'default') {}

  public savePendingTurn(snapshot: PendingTurnSnapshot): void {
    this.db
      .prepare('UPDATE affective_state SET pending_turn_json = ? WHERE persona_id = ?')
      .run(JSON.stringify(snapshot), this.personaId);
  }

  /**
   * 事务原子取出并清空上一轮快照（Global Exactly-Once 消费，彻底根绝并发双结算）
   */
  public consumePendingTurnAtomically(): PendingTurnSnapshot | null {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT pending_turn_json FROM affective_state WHERE persona_id = ?')
        .get(this.personaId) as { pending_turn_json: string | null } | undefined;

      if (!row || !row.pending_turn_json) return null;

      this.db
        .prepare('UPDATE affective_state SET pending_turn_json = NULL WHERE persona_id = ?')
        .run(this.personaId);

      return row.pending_turn_json;
    });

    const rawJson = tx();
    if (!rawJson) return null;
    try {
      return JSON.parse(rawJson) as PendingTurnSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * 本地客观交互信号校准：
   * 1. 排障贴新报错堆栈免除负分误判；
   * 2. 结合显式采纳/抱怨词对 LLM 自评做纠偏。
   */
  private calibrateFeedbackScore(rawLlmScore: number, currentUserInput: string): number {
    const isStackTraceOrLog =
      /(Error:|Exception|at\s+\S+\s+\(|Traceback|ERR!|failed with exit code)/i.test(currentUserInput);
    const hasExplicitComplaint = /(不对|别废话|太啰嗦|重新写|没用|错的|别演)/.test(currentUserInput);
    const hasExplicitApproval = /(可以|好的|就按这个|完美|牛|搞定|推送吧)/.test(currentUserInput);

    if (isStackTraceOrLog && !hasExplicitComplaint && rawLlmScore < 0) {
      return 0.1; // 排障正常推进，免除态度负分
    }
    if (hasExplicitComplaint) {
      return Math.min(rawLlmScore, -0.5);
    }
    if (hasExplicitApproval) {
      return Math.max(rawLlmScore, 0.65);
    }
    return Math.max(-1.0, Math.min(1.0, rawLlmScore));
  }

  public settlePreviousTurnReward(
    pending: PendingTurnSnapshot | null,
    rawLlmFeedbackScore: number,
    currentUserInput: string,
    currentUserEmbedding?: Float32Array,
    nowMs: number = Date.now()
  ): void {
    if (!pending) return;
    if (nowMs - pending.timestampMs > 2 * 3600 * 1000) return;

    // 【话题硬切换门控 (Topic-Shift Gating)】
    // 若本轮用户输入与上一轮语义余弦相似度 < 0.18 且不含显式评价词，且非技术排障日志，说明用户开启了全新无关话题，不奖惩上一轮标本
    const hasExplicitFeedbackWord = /(不对|别废话|太啰嗦|重新写|没用|错的|别演|可以|好的|就按这个|完美|牛|搞定|推送吧)/.test(currentUserInput);
    const isStackTrace = /(Error:|Exception|at\s+\S+\s+\(|Traceback|ERR!|failed with exit code)/i.test(currentUserInput);
    if (
      currentUserEmbedding &&
      pending.userPromptEmbedding?.length === currentUserEmbedding.length &&
      !hasExplicitFeedbackWord &&
      !isStackTrace
    ) {
      const topicSim = cosineSimilarity(pending.userPromptEmbedding, currentUserEmbedding);
      if (topicSim < 0.18) {
        return; // 无关新话题，直接跳过结算
      }
    }

    const score = this.calibrateFeedbackScore(rawLlmFeedbackScore, currentUserInput);

    const tx = this.db.transaction(() => {
      // 1. EMA 平滑更新上一轮参考过的 organic_episodes 权重（use_count >= 3 且权重 < 0.38 才物理淘汰，下界保护 >= 0.10）
      if (pending.referencedEpisodeIds.length > 0) {
        const targetReward = 1.0 + score * 0.8;
        const updateEpStmt = this.db.prepare(
          `UPDATE organic_episodes
           SET reward_weight = MIN(2.2, MAX(0.10, reward_weight * 0.75 + ? * 0.25)),
               use_count = use_count + 1,
               last_used_ms = ?
           WHERE id = ?`
        );
        for (const epId of pending.referencedEpisodeIds) {
          updateEpStmt.run(targetReward, nowMs, epId);
        }
        this.db
          .prepare(
            'DELETE FROM organic_episodes WHERE persona_id = ? AND use_count >= 3 AND reward_weight < 0.38'
          )
          .run(this.personaId);
      }

      // 2. [闭环补齐] 在线更新上一轮激活过的 behavioral_policies 置信度，低于 0.35 自动淘汰僵尸铁律
      if (pending.referencedPolicyIds?.length > 0) {
        const targetConf = clampScore(0.65 + score * 0.35, 0.1, 0.99);
        const updatePolicyStmt = this.db.prepare(
          `UPDATE behavioral_policies
           SET confidence = MIN(0.99, MAX(0.10, confidence * 0.82 + ? * 0.18)),
               use_count = use_count + 1,
               updated_at_ms = ?
           WHERE id = ?`
        );
        for (const polId of pending.referencedPolicyIds) {
          updatePolicyStmt.run(targetConf, nowMs, polId);
        }
        this.db
          .prepare(
            'DELETE FROM behavioral_policies WHERE persona_id = ? AND use_count >= 3 AND confidence < 0.35'
          )
          .run(this.personaId);
      }

      // 3. 强正反馈 (>= 0.55) 晋升或合并入库
      if (score >= 0.55 && pending.assistantReply.length >= 12) {
        const triggerDigest = buildStructuralDigest(pending.userPrompt, 70);
        const replyDigest = buildStructuralDigest(pending.assistantReply, 140);

        // 检查同一姿态桶、三维 PAD 距离平方 < 0.05 是否已有相近标本，有则合并强化
        const existing = this.db
          .prepare(
            `SELECT id FROM organic_episodes
             WHERE persona_id = ? AND action_policy = ?
               AND ((emotion_p - ?) * (emotion_p - ?) +
                    (emotion_a - ?) * (emotion_a - ?) +
                    (emotion_d - ?) * (emotion_d - ?)) < 0.05
             LIMIT 1`
          )
          .get(
            this.personaId,
            pending.actionPolicy,
            pending.moodAtTurn.p, pending.moodAtTurn.p,
            pending.moodAtTurn.a, pending.moodAtTurn.a,
            pending.moodAtTurn.d, pending.moodAtTurn.d
          ) as { id: number } | undefined;

        if (existing) {
          this.db
            .prepare(
              `UPDATE organic_episodes
               SET reward_weight = MIN(2.2, reward_weight + 0.15),
                   assistant_response_digest = ?,
                   last_used_ms = ?
               WHERE id = ?`
            )
            .run(replyDigest, nowMs, existing.id);
        } else {
          this.db
            .prepare(
              `INSERT INTO organic_episodes
               (persona_id, emotion_p, emotion_a, emotion_d, action_policy,
                user_trigger_summary, assistant_response_digest, reward_weight, created_at_ms, last_used_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              this.personaId,
              pending.moodAtTurn.p,
              pending.moodAtTurn.a,
              pending.moodAtTurn.d,
              pending.actionPolicy,
              triggerDigest,
              replyDigest,
              1.0 + (score - 0.5) * 0.4,
              nowMs,
              nowMs
            );

          // 按 action_policy 分桶保留 Top-20，防止高频日常姿态冲刷低频关键姿态
          this.db
            .prepare(
              `DELETE FROM organic_episodes
               WHERE persona_id = ? AND action_policy = ? AND id NOT IN (
                 SELECT id FROM organic_episodes
                 WHERE persona_id = ? AND action_policy = ?
                 ORDER BY reward_weight DESC, last_used_ms DESC
                 LIMIT 20
               )`
            )
            .run(this.personaId, pending.actionPolicy, this.personaId, pending.actionPolicy);
        }
      }
    });

    tx();
  }
}
