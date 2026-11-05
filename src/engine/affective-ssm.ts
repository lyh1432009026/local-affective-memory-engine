import Database from 'better-sqlite3';

export interface PADState {
  p: number; // Pleasure [-1, 1]
  a: number; // Arousal [0, 1]
  d: number; // Dominance [-1, 1]
  intimacy: number; // [0.05, 0.99]
  trust: number; // [0.05, 0.99]
  lastActivePolicy: string;
}

export const safeClamp = (val: number, min: number, max: number, defaultVal: number = min): number => {
  if (!Number.isFinite(val)) return defaultVal;
  return Math.max(min, Math.min(max, val));
};

const clamp = safeClamp;

export class AffectiveEngine {
  constructor(private db: Database.Database, private personaId: string = 'default') {}

  /**
   * 1. 读取并按真实物理时间差结算持久基态 (Tonic State)
   */
  public getTonicStateWithTimeDecay(nowMs: number = Date.now()): PADState {
    const row = this.db
      .prepare('SELECT * FROM affective_state WHERE persona_id = ?')
      .get(this.personaId) as any;

    if (!row) {
      this.db
        .prepare('INSERT INTO affective_state (persona_id, last_updated_ms) VALUES (?, ?)')
        .run(this.personaId, nowMs);
      return {
        p: 0.2,
        a: 0.3,
        d: 0.1,
        intimacy: 0.5,
        trust: 0.6,
        lastActivePolicy: '熟稔默契协同姿态',
      };
    }

    const deltaHours = Math.max(0, (nowMs - row.last_updated_ms) / (1000 * 3600));
    const decayFactor = Math.exp(-row.decay_lambda * deltaHours);

    return {
      p: Number(clamp(row.base_p + (row.p_pleasure - row.base_p) * decayFactor, -0.95, 0.95).toFixed(3)),
      a: Number(clamp(row.base_a + (row.a_arousal - row.base_a) * decayFactor, 0.05, 0.95).toFixed(3)),
      d: Number(clamp(row.base_d + (row.d_dominance - row.base_d) * decayFactor, -0.95, 0.95).toFixed(3)),
      intimacy: Number(row.intimacy.toFixed(3)),
      trust: Number(row.trust.toFixed(3)),
      lastActivePolicy: row.last_active_policy || '熟稔默契协同姿态',
    };
  }

  /**
   * 2. 生成当轮瞬时唤醒心境 (Phasic Mood)：仅用于当轮 Prompt 编译，绝不落盘！
   */
  public computePhasicMoodWithMemories(
    tonicState: PADState,
    memories: Array<{ emotion_p: number; emotion_a: number; emotion_d: number; salience: number }>
  ): PADState {
    if (memories.length === 0) return { ...tonicState };

    const top = memories.slice(0, 2);
    let shiftP = 0, shiftA = 0, shiftD = 0;
    for (const m of top) {
      shiftP += (m.emotion_p - tonicState.p) * m.salience * 0.15;
      shiftA += (m.emotion_a - tonicState.a) * m.salience * 0.15;
      shiftD += (m.emotion_d - tonicState.d) * m.salience * 0.12;
    }

    return {
      ...tonicState,
      p: Number(clamp(tonicState.p + shiftP, -0.95, 0.95).toFixed(3)),
      a: Number(clamp(tonicState.a + shiftA, 0.05, 0.95).toFixed(3)),
      d: Number(clamp(tonicState.d + shiftD, -0.95, 0.95).toFixed(3)),
    };
  }

  /**
   * 3. 基于未染色的 tonicState 结算当轮刺激增量 + 单步稳态回归拉力并落盘
   */
  public applyAffectDeltaToTonic(
    tonicState: PADState,
    delta: {
      dp: number;
      da: number;
      dd: number;
      dTrust: number;
      userFeedbackScore?: number;
      activePolicyName?: string;
    },
    nowMs: number = Date.now()
  ): PADState {
    const baseRow = this.db
      .prepare('SELECT base_p, base_a, base_d FROM affective_state WHERE persona_id = ?')
      .get(this.personaId) as { base_p: number; base_a: number; base_d: number } | undefined;

    const baseP = baseRow?.base_p ?? 0.2;
    const baseA = baseRow?.base_a ?? 0.3;
    const baseD = baseRow?.base_d ?? 0.1;

    // 单步稳态回归拉力 (Per-Turn Homeostatic Pull = 0.06)：防止高频秒回对话下情绪单向锁死在极值
    const pullP = (baseP - tonicState.p) * 0.06;
    const pullA = (baseA - tonicState.a) * 0.06;
    const pullD = (baseD - tonicState.d) * 0.06;

    const nextP = Number(clamp(tonicState.p + pullP + Math.tanh(delta.dp) * 0.24, -0.95, 0.95).toFixed(3));
    const nextA = Number(clamp(tonicState.a + pullA + Math.tanh(delta.da) * 0.24, 0.05, 0.95).toFixed(3));
    const nextD = Number(clamp(tonicState.d + pullD + Math.tanh(delta.dd) * 0.20, -0.95, 0.95).toFixed(3));

    // 慢变量非对称渐近阻尼：越接近 1.0 越平缓，建立信任慢、失信扣减敏感
    const trustStep =
      delta.dTrust >= 0
        ? (1.0 - tonicState.trust) * delta.dTrust * 0.15
        : tonicState.trust * delta.dTrust * 0.30;
    const nextTrust = Number(clamp(tonicState.trust + trustStep, 0.05, 0.99).toFixed(3));

    const rawFb = delta.userFeedbackScore;
    const fbScore = Number.isFinite(rawFb) ? (rawFb as number) : 0;
    const intimacyStep =
      fbScore >= 0.3
        ? (1.0 - tonicState.intimacy) * 0.015 * Math.min(1.5, fbScore / 0.8)
        : fbScore <= -0.4
        ? -tonicState.intimacy * 0.02 * Math.min(1.5, Math.abs(fbScore) / 0.8)
        : (1.0 - tonicState.intimacy) * 0.002;
    const nextIntimacy = Number(safeClamp(tonicState.intimacy + intimacyStep, 0.05, 0.99, 0.5).toFixed(3));
    const nextPolicy = delta.activePolicyName || tonicState.lastActivePolicy;

    this.db
      .prepare(
        `UPDATE affective_state
         SET p_pleasure = ?, a_arousal = ?, d_dominance = ?,
             trust = ?, intimacy = ?, last_active_policy = ?, last_updated_ms = ?
         WHERE persona_id = ?`
      )
      .run(nextP, nextA, nextD, nextTrust, nextIntimacy, nextPolicy, nowMs, this.personaId);

    return {
      p: nextP,
      a: nextA,
      d: nextD,
      trust: nextTrust,
      intimacy: nextIntimacy,
      lastActivePolicy: nextPolicy,
    };
  }
}
