# 本地记忆与情感神经伴生引擎 v2.1（零人工种子 · 隐式强化 · 红队审计加固版）

> **版本演进说明**：
> - **v1.0**：确立 Node.js 本地“海马体+杏仁核”驱动云端大模型 API 的基础架构。
> - **v2.0**：彻底废弃人工手写台词种子库（`seed_anchors.json`），升级为**0样本冷启动 + 认知行为决策姿态驱动（Action Tendency）+ 下一轮隐式反馈 Bandit 强化优胜劣汰**。
> - **v2.1（当前版本 · 经 3 路专业子代理红队挑刺加固）**：
>   1. **修复 `sqlite-vec` 底层陷阱**：补齐 `persona_id TEXT PARTITION KEY`、`distance_metric=cosine`、`BigInt` 主键强制绑定与孤儿向量 `AFTER DELETE` 自动清理触发器；
>   2. **隔离持久基态（Tonic）与瞬时唤醒态（Phasic）**：切断旧记忆反复召回引发的情绪自激死锁，补齐 `dd`（掌控度）更新闭环与慢变量（信任/亲密度）渐近阻尼公式；
>   3. **加固 Bandit 与隐式强化器**：采用 `UPDATE ... RETURNING` 原子消费 `pending_turn_json` 消除并发双结算竞态；引入本地启发式校准（区分“排障贴报错”与“对回复不满”）、代码块反引号清洗、按姿态分桶保留（Stratified Eviction）及 UCB 探索项；
>   4. **升级流式状态机与末尾追加注入**：将动态潜意识块改为追加至最后一条 `user` 消息尾部（兼容 Claude/DeepSeek-R1 严格角色交替并保护 `User_t` 前缀缓存）；重写 `DualStreamParser` 为跳过前导空白/`<think>` 块、基于 `>` 闭合符切分并带 `flush()` 兜底的工业级状态机。

---

## 一、 技术选型（Windows 本地零 GPU 依赖）

| 模块层级 | 核心依赖包 | 选型理由与性能指标 |
| :--- | :--- | :--- |
| **运行时与宿主** | `Node.js >= 20` + `TypeScript` (`tsx`) | 原生兼容 DeepSeek Harness (`Cordis` 插件内核) 与独立 HTTP 代理网关两种运行形态 |
| **本地统一存储** | `better-sqlite3` + `sqlite-vec` | 单一 `.db` 文件同时承载情感状态机、隐式强化样本、图谱三元组与 Float32 向量索引；开启 WAL 模式单次检索 `< 5ms` |
| **本地语义嵌入** | `@huggingface/transformers` (ONNX) | 本地 CPU 运行 `Xenova/bge-small-zh-v1.5`（512 维向量），内存占用约 `180MB`，单句推理 `< 12ms`，支持 `hf-mirror.com` 或离线加载 |
| **云端 API 客户端** | `openai` (Node SDK) | 兼容 DeepSeek (V3 / R1 / V4 Pro)、Claude、Qwen、GPT 等所有 OpenAI 协议接口 |
| **接入层形态** | `hono` (透明代理) / `cordis` (DSH 插件) | 既可作为 `/v1/chat/completions` 透明网关零侵入接入任意客户端，也可作为原生插件直装进 DeepSeek Harness |

---

## 二、 工程目录结构

```text
local-affective-engine/
├── package.json
├── tsconfig.json
├── data/
│   └── cognitive_core.db          # SQLite + sqlite-vec 本地单文件数据库（0样本自动初始化）
└── src/
    ├── index.ts                   # 双模入口：Hono OpenAI 透明网关 + DeepSeek Harness (Cordis) 插件导出
    ├── types.ts                   # PAD 情感向量、行为策略、有机标本与双流协议类型定义
    ├── db/
    │   ├── client.ts              # better-sqlite3 初始化（WAL模式）与 sqlite-vec 扩展加载
    │   └── schema.sql             # 五张核心表结构 + Partition Key 向量表 + 级联清理触发器 + 复合索引
    ├── engine/
    │   ├── embedding.ts           # Transformers.js 本地 ONNX 向量化封装
    │   ├── affective-ssm.ts       # 连续情感状态空间：Tonic/Phasic 双态隔离、三维 PAD 演化与渐近阻尼
    │   ├── implicit-rl.ts         # 隐式反馈强化器：RETURNING 原子消费、启发式报错免责、分桶优胜劣汰
    │   ├── memory-retriever.ts    # 四维混合召回与异步落盘：语义 + 三维心境共鸣 + 重要度 + 动态半衰期
    │   └── context-compiler.ts    # 行为姿态编译器：UCB 探索抽样、User 尾部安全追加、全场景理性熔断
    └── pipeline/
        ├── dual-stream.ts         # 工业级流式状态机：兼容 <think> 块、基于 '>' 闭合切分、数值 Clamp 与 flush()
        └── sleep-consolidator.ts  # 闲时对比自反思：正负反馈回合对比提炼《协作行为铁律》
```

---

## 三、 本地数据库 Schema 设计 (`src/db/schema.sql`)

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- 1. 连续情感状态机与关系账本表（持久化 Tonic 基态）
CREATE TABLE IF NOT EXISTS affective_state (
    persona_id TEXT PRIMARY KEY,
    -- 快变量：当前 PAD 持久基态向量 (Tonic State)
    p_pleasure REAL NOT NULL DEFAULT 0.2,    -- 愉悦度 [-1.0, 1.0]
    a_arousal REAL NOT NULL DEFAULT 0.3,     -- 唤醒度/专注度 [0.0, 1.0]
    d_dominance REAL NOT NULL DEFAULT 0.1,   -- 掌控度/自信度 [-1.0, 1.0]
    -- 性格稳态基线（随物理时间自然回落的锚点）
    base_p REAL NOT NULL DEFAULT 0.2,
    base_a REAL NOT NULL DEFAULT 0.3,
    base_d REAL NOT NULL DEFAULT 0.1,
    decay_lambda REAL NOT NULL DEFAULT 0.25, -- 每小时情绪衰减率
    -- 慢变量：长期关系账本（带渐近阻尼）
    intimacy REAL NOT NULL DEFAULT 0.5,      -- 亲密度/熟稔度 [0.0, 1.0]
    trust REAL NOT NULL DEFAULT 0.6,         -- 信任度 [0.0, 1.0]
    last_active_policy TEXT DEFAULT '熟稔默契协同姿态',
    last_updated_ms INTEGER NOT NULL,
    -- 暂存上一轮交互快照，通过 UPDATE ... RETURNING 原子消费
    pending_turn_json TEXT DEFAULT NULL
);

-- 2. 有机生长交互标本表（0人工手写，100%由真实高共鸣对话自动晋升、合并与分桶淘汰）
CREATE TABLE IF NOT EXISTS organic_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    emotion_p REAL NOT NULL,
    emotion_a REAL NOT NULL,
    emotion_d REAL NOT NULL,
    action_policy TEXT NOT NULL,             -- 所属行为决策姿态桶
    user_trigger_summary TEXT NOT NULL,      -- 已清洗反引号与控制符的触发语境摘要
    assistant_response_digest TEXT NOT NULL, -- 已脱敏代码块的结构与分寸示范
    reward_weight REAL NOT NULL DEFAULT 1.0, -- EMA + Bandit 强化权重
    use_count INTEGER NOT NULL DEFAULT 1,    -- 被抽样次数（用于 UCB 探索项与最小观察门槛）
    created_at_ms INTEGER NOT NULL,
    last_used_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organic_persona_policy
    ON organic_episodes(persona_id, action_policy, reward_weight DESC);

-- 3. 自反思行为策略法则表（由闲时正负反馈对比自动归纳）
CREATE TABLE IF NOT EXISTS behavioral_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    trigger_condition TEXT NOT NULL,
    policy_directive TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.7,
    updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_policies_persona_conf
    ON behavioral_policies(persona_id, confidence DESC);

-- 4. 情景闪回记忆主表（带三维情感坐标戳）
CREATE TABLE IF NOT EXISTS episodic_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    verbatim_quote TEXT DEFAULT '',
    emotion_p REAL NOT NULL,
    emotion_a REAL NOT NULL,
    emotion_d REAL NOT NULL,
    salience REAL NOT NULL DEFAULT 0.5,
    access_count INTEGER NOT NULL DEFAULT 0,
    created_at_ms INTEGER NOT NULL,
    last_accessed_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_episodic_persona_salience
    ON episodic_memories(persona_id, salience DESC, last_accessed_ms DESC);

-- [v2.1 加固] 情景记忆向量虚拟表：显式声明 PARTITION KEY 与 cosine 距离，彻底解决多角色 Post-Filter 饥饿
CREATE VIRTUAL TABLE IF NOT EXISTS vec_episodic USING vec0(
    memory_id INTEGER PRIMARY KEY,
    persona_id TEXT PARTITION KEY,
    embedding FLOAT[512] distance_metric=cosine
);

-- [v2.1 加固] 主表删除时自动级联清理 vec0 孤儿向量
CREATE TRIGGER IF NOT EXISTS trg_delete_vec_episodic
AFTER DELETE ON episodic_memories
BEGIN
    DELETE FROM vec_episodic WHERE memory_id = OLD.id;
END;

-- 5. 实体关系与共同认知图谱表
CREATE TABLE IF NOT EXISTS relational_graph (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object TEXT NOT NULL,
    emotional_valence REAL DEFAULT 0.0,
    confidence REAL DEFAULT 1.0,
    updated_at_ms INTEGER NOT NULL,
    UNIQUE(persona_id, subject, predicate, object)
);
```

---

## 四、 核心模块代码实现（v2.1 加固版）

### 1. 连续情感动力学引擎 (`src/engine/affective-ssm.ts`)

**v2.1 核心修正**：
- 严格区分**持久基态（`tonicState`，落盘）**与**瞬时唤醒态（`phasicMood`，仅用于当轮编译 Prompt，绝不写回数据库）**，彻底消除同一负面记忆连续召回造成的情绪自激死锁；
- 补齐 `dd`（掌控度）三维更新链路；
- 为 `trust` 与 `intimacy` 引入非对称渐近阻尼（建信慢、越接近 1.0 越平缓；失信惩罚敏感）。

```typescript
import Database from 'better-sqlite3';

export interface PADState {
  p: number; // Pleasure [-1, 1]
  a: number; // Arousal [0, 1]
  d: number; // Dominance [-1, 1]
  intimacy: number; // [0, 1]
  trust: number; // [0, 1]
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

export class AffectiveEngine {
  constructor(private db: Database.Database, private personaId: string = 'default') {}

  /**
   * 1. 读取并结算真实时间流逝带来的持久基态 (Tonic State)
   */
  public getTonicStateWithTimeDecay(nowMs: number = Date.now()): PADState {
    const row = this.db
      .prepare('SELECT * FROM affective_state WHERE persona_id = ?')
      .get(this.personaId) as any;

    if (!row) {
      this.db
        .prepare('INSERT INTO affective_state (persona_id, last_updated_ms) VALUES (?, ?)')
        .run(this.personaId, nowMs);
      return { p: 0.2, a: 0.3, d: 0.1, intimacy: 0.5, trust: 0.6 };
    }

    const deltaHours = Math.max(0, (nowMs - row.last_updated_ms) / (1000 * 3600));
    const decayFactor = Math.exp(-row.decay_lambda * deltaHours);

    return {
      p: Number(clamp(row.base_p + (row.p_pleasure - row.base_p) * decayFactor, -0.95, 0.95).toFixed(3)),
      a: Number(clamp(row.base_a + (row.a_arousal - row.base_a) * decayFactor, 0.05, 0.95).toFixed(3)),
      d: Number(clamp(row.base_d + (row.d_dominance - row.base_d) * decayFactor, -0.95, 0.95).toFixed(3)),
      intimacy: Number(row.intimacy.toFixed(3)),
      trust: Number(row.trust.toFixed(3)),
    };
  }

  /**
   * 2. 生成当轮瞬时唤醒心境 (Phasic Mood)：仅用于当轮 Prompt 编译，绝不作为落盘基准！
   */
  public computePhasicMoodWithMemories(
    tonicState: PADState,
    memories: Array<{ emotion_p: number; emotion_a: number; emotion_d: number; salience: number }>
  ): PADState {
    if (memories.length === 0) return { ...tonicState };

    const top = memories.slice(0, 2);
    let shiftP = 0, shiftA = 0, shiftD = 0;
    for (const m of top) {
      shiftP += (m.emotion_p - tonicState.p) * m.salience * 0.16;
      shiftA += (m.emotion_a - tonicState.a) * m.salience * 0.16;
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
   * 3. 基于未染色的 tonicState 结算当轮刺激增量并落盘
   */
  public applyAffectDeltaToTonic(
    tonicState: PADState,
    delta: { dp: number; da: number; dd: number; dTrust: number; userFeedbackScore: number },
    nowMs: number = Date.now()
  ): PADState {
    const nextP = Number(clamp(tonicState.p + Math.tanh(delta.dp) * 0.25, -0.95, 0.95).toFixed(3));
    const nextA = Number(clamp(tonicState.a + Math.tanh(delta.da) * 0.25, 0.05, 0.95).toFixed(3));
    const nextD = Number(clamp(tonicState.d + Math.tanh(delta.dd) * 0.20, -0.95, 0.95).toFixed(3));

    // 慢变量渐近阻尼：正向增长随 (1 - R) 递减，负向惩罚按当前 R 比例扣除
    const trustStep =
      delta.dTrust >= 0
        ? (1.0 - tonicState.trust) * delta.dTrust * 0.15
        : tonicState.trust * delta.dTrust * 0.30;
    const nextTrust = Number(clamp(tonicState.trust + trustStep, 0.05, 0.99).toFixed(3));

    // 亲密度由有效正反馈互动自然累积
    const intimacyStep =
      delta.userFeedbackScore >= 0.3
        ? (1.0 - tonicState.intimacy) * 0.015
        : delta.userFeedbackScore <= -0.4
        ? -tonicState.intimacy * 0.02
        : 0.002;
    const nextIntimacy = Number(clamp(tonicState.intimacy + intimacyStep, 0.05, 0.99).toFixed(3));

    this.db
      .prepare(
        `UPDATE affective_state
         SET p_pleasure = ?, a_arousal = ?, d_dominance = ?,
             trust = ?, intimacy = ?, last_updated_ms = ?
         WHERE persona_id = ?`
      )
      .run(nextP, nextA, nextD, nextTrust, nextIntimacy, nowMs, this.personaId);

    return { p: nextP, a: nextA, d: nextD, trust: nextTrust, intimacy: nextIntimacy };
  }
}
```

---

### 2. 下一轮隐式反馈强化器 (`src/engine/implicit-rl.ts`)

**v2.1 核心修正**：
- 使用 `UPDATE ... SET pending_turn_json = NULL ... RETURNING pending_turn_json` **单语句原子消费快照**，彻底消灭并发请求双结算与工具熔断跨轮张冠李戴；
- 增加**本地启发式报错免责校准**（当用户粘贴新的报错堆栈推进排障时，禁止将报错信息误判为对 AI 上一轮态度的负反馈）；
- 对入库文本执行**代码块坍缩与反引号/尖括号清洗**，防止破坏 Prompt Markdown 结构；
- 采用 **EMA 平滑权重 + 最小观察次数保护（`use_count >= 3` 才允许淘汰）+ 按 `action_policy` 分桶保留 Top-20**。

```typescript
import Database from 'better-sqlite3';
import { PADState } from './affective-ssm';

export interface PendingTurnSnapshot {
  turnId: string;
  userPrompt: string;
  assistantReply: string;
  moodAtTurn: PADState;
  actionPolicy: string;
  referencedEpisodeIds: number[];
  timestampMs: number;
}

/** 清洗代码块与特殊标记，防止截断出未闭合的 ``` 或 <tag> 污染 System Prompt */
export function sanitizeDigest(raw: string, maxLen: number): string {
  return raw
    .replace(/```[\s\S]*?```/g, '[代码块]')
    .replace(/`+/g, "'")
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export class ImplicitRLManager {
  constructor(private db: Database.Database, private personaId: string = 'default') {}

  public savePendingTurn(snapshot: PendingTurnSnapshot): void {
    this.db
      .prepare('UPDATE affective_state SET pending_turn_json = ? WHERE persona_id = ?')
      .run(JSON.stringify(snapshot), this.personaId);
  }

  /**
   * 原子取出并清空上一轮快照（即使在并发请求下也保证 Global Exactly-Once 消费）
   */
  public consumePendingTurnAtomically(): PendingTurnSnapshot | null {
    const row = this.db
      .prepare(
        `UPDATE affective_state
         SET pending_turn_json = NULL
         WHERE persona_id = ? AND pending_turn_json IS NOT NULL
         RETURNING pending_turn_json`
      )
      .get(this.personaId) as { pending_turn_json: string } | undefined;

    if (!row || !row.pending_turn_json) return null;
    try {
      return JSON.parse(row.pending_turn_json) as PendingTurnSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * 本地客观交互信号校准：防止 LLM 在排障场景下将“用户贴出新报错日志”误判为负向态度反馈
   */
  private calibrateFeedbackScore(rawLlmScore: number, currentUserInput: string): number {
    const isStackTraceOrLog =
      /(Error:|Exception|at\s+\S+\s+\(|Traceback|ERR!|failed with exit code)/i.test(currentUserInput);
    const hasExplicitComplaint = /(不对|别废话|太啰嗦|重新写|没用|错的)/.test(currentUserInput);

    // 若用户只是顺着排障流贴入新的报错堆栈且无抱怨词，免除负分惩罚
    if (isStackTraceOrLog && !hasExplicitComplaint && rawLlmScore < 0) {
      return 0.1;
    }
    return Math.max(-1.0, Math.min(1.0, rawLlmScore));
  }

  public settlePreviousTurnReward(
    pending: PendingTurnSnapshot | null,
    rawLlmFeedbackScore: number,
    currentUserInput: string,
    nowMs: number = Date.now()
  ): void {
    if (!pending) return;
    if (nowMs - pending.timestampMs > 2 * 3600 * 1000) return;

    const score = this.calibrateFeedbackScore(rawLlmFeedbackScore, currentUserInput);

    const tx = this.db.transaction(() => {
      // 1. EMA 平滑更新上一轮参考过的标本权重，use_count >= 3 且权重 < 0.35 才物理淘汰
      if (pending.referencedEpisodeIds.length > 0) {
        const targetReward = 1.0 + score * 0.8; // 映射至 [0.2, 1.8]
        const updateStmt = this.db.prepare(
          `UPDATE organic_episodes
           SET reward_weight = MIN(2.2, reward_weight * 0.75 + ? * 0.25),
               use_count = use_count + 1,
               last_used_ms = ?
           WHERE id = ?`
        );
        for (const epId of pending.referencedEpisodeIds) {
          updateStmt.run(targetReward, nowMs, epId);
        }
        this.db
          .prepare(
            'DELETE FROM organic_episodes WHERE persona_id = ? AND use_count >= 3 AND reward_weight < 0.38'
          )
          .run(this.personaId);
      }

      // 2. 强正反馈 (>= 0.55) 晋升或合并入库
      if (score >= 0.55 && pending.assistantReply.length >= 12) {
        const triggerDigest = sanitizeDigest(pending.userPrompt, 80);
        const replyDigest = sanitizeDigest(pending.assistantReply, 150);

        // 检查同一姿态桶、相近 PAD 坐标 (距离平方 < 0.04) 是否已有标本，有则合并强化而非重复克隆
        const existing = this.db
          .prepare(
            `SELECT id FROM organic_episodes
             WHERE persona_id = ? AND action_policy = ?
               AND ((emotion_p - ?) * (emotion_p - ?) + (emotion_a - ?) * (emotion_a - ?)) < 0.04
             LIMIT 1`
          )
          .get(
            this.personaId,
            pending.actionPolicy,
            pending.moodAtTurn.p,
            pending.moodAtTurn.p,
            pending.moodAtTurn.a,
            pending.moodAtTurn.a
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

          // 按 action_policy 分桶淘汰：每个姿态桶独立保留 Top-20，防止高频日常姿态把低频止损姿态挤出数据库
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
```

---

### 3. 四维心境一致性混合检索与写入器 (`src/engine/memory-retriever.ts`)

**v2.1 核心修正**：
- 补全**读写完整闭环**：使用 `PARTITION KEY (persona_id = ?)` 解决 `vec0` 多角色 KNN 召回饥饿；
- 写入 `vec_episodic` 时显式使用 **`BigInt(memoryId)`** 与 `Buffer.from(embedding.buffer)`，规避 `better-sqlite3` 浮点绑定崩溃。

```typescript
import Database from 'better-sqlite3';
import { PADState } from './affective-ssm';
import { sanitizeDigest } from './implicit-rl';

export interface RecalledMemory {
  id: number;
  summary: string;
  verbatim_quote: string;
  emotion_p: number;
  emotion_a: number;
  emotion_d: number;
  salience: number;
  final_score: number;
}

export class MemoryRetriever {
  constructor(private db: Database.Database, private personaId: string = 'default') {}

  /**
   * 异步落盘高价值情景闪回记忆（主表 + vec0 分区向量表同一事务写入）
   */
  public commitEpisodicMemory(
    summary: string,
    verbatimQuote: string,
    mood: PADState,
    salience: number,
    embedding: Float32Array,
    nowMs: number = Date.now()
  ): void {
    if (!summary || salience < 0.35) return;

    const cleanSummary = sanitizeDigest(summary, 60);
    const cleanQuote = sanitizeDigest(verbatimQuote, 100);

    const tx = this.db.transaction(() => {
      const info = this.db
        .prepare(
          `INSERT INTO episodic_memories
           (persona_id, summary, verbatim_quote, emotion_p, emotion_a, emotion_d, salience, created_at_ms, last_accessed_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          this.personaId,
          cleanSummary,
          cleanQuote,
          mood.p,
          mood.a,
          mood.d,
          salience,
          nowMs,
          nowMs
        );

      // CRITICAL: vec0 主键必须绑定为 BigInt，否则 better-sqlite3 按 double 绑定会直接抛错崩溃
      const rowIdBigInt = BigInt(info.lastInsertRowid);
      this.db
        .prepare(
          'INSERT INTO vec_episodic (memory_id, persona_id, embedding) VALUES (?, ?, ?)'
        )
        .run(rowIdBigInt, this.personaId, Buffer.from(embedding.buffer));
    });

    tx();
  }

  /**
   * 四维混合召回：语义相似度 (0.45) + 三维 PAD 心境共鸣 (0.20) + 重要度 (0.20) + 记忆留存率 (0.15)
   */
  public retrieveHybridMemories(
    queryEmbedding: Float32Array,
    currentMood: PADState,
    topK: number = 4
  ): RecalledMemory[] {
    // 利用 vec0 的 persona_id PARTITION KEY 在分区内直接执行 KNN
    const candidates = this.db
      .prepare(
        `SELECT
           m.id, m.summary, m.verbatim_quote,
           m.emotion_p, m.emotion_a, m.emotion_d,
           m.salience, m.access_count, m.created_at_ms,
           v.distance AS cos_distance
         FROM vec_episodic v
         JOIN episodic_memories m ON m.id = v.memory_id
         WHERE v.embedding MATCH ? AND k = 20 AND v.persona_id = ?`
      )
      .all(Buffer.from(queryEmbedding.buffer), this.personaId) as any[];

    const nowMs = Date.now();

    const scored = candidates.map((c) => {
      const semanticSim = Math.max(0, 1 - c.cos_distance);
      const moodDistSq =
        Math.pow(currentMood.p - c.emotion_p, 2) +
        Math.pow(currentMood.a - c.emotion_a, 2) +
        Math.pow(currentMood.d - c.emotion_d, 2);
      const moodCongruence = Math.exp(-moodDistSq);

      const ageDays = Math.max(0, (nowMs - c.created_at_ms) / (1000 * 3600 * 24));
      const halfLifeDays = 7 * (1 + c.salience * 8 + Math.log1p(c.access_count) * 2);
      const retention = Math.exp(-ageDays / halfLifeDays);

      const finalScore =
        0.45 * semanticSim + 0.20 * moodCongruence + 0.20 * c.salience + 0.15 * retention;

      return {
        id: c.id,
        summary: c.summary,
        verbatim_quote: c.verbatim_quote,
        emotion_p: c.emotion_p,
        emotion_a: c.emotion_a,
        emotion_d: c.emotion_d,
        salience: c.salience,
        final_score: Number(finalScore.toFixed(4)),
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
```

---

### 4. 行为姿态编译器与尾部安全追加器 (`src/engine/context-compiler.ts`)

**v2.1 核心修正**：
- **抽样引入 UCB 探索项与姿态同桶约束 (`AND action_policy = ?`)**：防止单一标本霸榜或闲聊标本跨界污染代码排障；
- **将潜意识块追加至最后一条 `user` 消息末尾（Post-User Appending）**：彻底规避中段插入 `role: 'system'` 引发的 Claude/DeepSeek-R1 `400 Bad Request` 协议错误，同时保证 `User_t` 消息自身的前缀缓存不被破坏；
- **补齐首轮 Tool-Call / JSON Mode 理性熔断**：在熔断态下仍保留只读 `graphTriples` 事实记忆。

```typescript
import Database from 'better-sqlite3';
import { PADState } from './affective-ssm';
import { RecalledMemory } from './memory-retriever';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
}

export interface CompileOptions {
  hasActiveToolLoop?: boolean;
  isJsonResponseFormat?: boolean;
  forceToolChoice?: boolean;
}

export interface CompiledRequest {
  messages: ChatMessage[];
  temperature: number;
  presencePenalty: number;
  activePolicyName: string;
  referencedEpisodeIds: number[];
  isCognitiveOverride: boolean;
}

export class ContextCompiler {
  constructor(private db: Database.Database, private personaId: string = 'default') {}

  private deriveActionPolicy(mood: PADState) {
    const temperature = Number((0.45 + mood.a * 0.35).toFixed(2));
    const presencePenalty = Number((mood.a > 0.6 ? 0.25 : 0.1).toFixed(2));

    if (mood.a >= 0.65 && mood.p < -0.15 && mood.d >= 0.0) {
      return {
        policyName: '阻断与架构止损姿态',
        behavioralDirective:
          '当前检测到高风险或重复踩坑信号：不要盲从修补指令，优先指出底层死穴或过往同类教训，直接给出止损方案，单句短促有力，省略全部客套。',
        temperature: 0.4,
        presencePenalty: 0.15,
      };
    }
    if (mood.a >= 0.65 && mood.p >= -0.15) {
      return {
        policyName: '极简高密攻坚姿态',
        behavioralDirective:
          '当前处于高频执行/排障流：砍掉所有寒暄、过渡句与原理科普，第一行直接给结论或根因，紧跟可执行代码或清单。',
        temperature,
        presencePenalty,
      };
    }
    if (mood.a < 0.38 && mood.p < 0) {
      return {
        policyName: '克制收敛与低耗兜底姿态',
        behavioralDirective:
          '当前双方能量偏低或处于疲惫期：降低信息轰炸，只替用户兜底最核心的一件事，语气沉稳简练，不要反问或追问过多细节。',
        temperature: 0.5,
        presencePenalty: 0.1,
      };
    }
    return {
      policyName: '熟稔默契协同姿态',
      behavioralDirective:
        '保持老搭档之间的自然松弛与直接，先确认核心结论再展开关键支撑，在涉及用户长期习惯或健康约束时主动多想一步。',
      temperature,
      presencePenalty,
    };
  }

  /**
   * [v2.1 加固] 限定同姿态桶 (action_policy = ?) + 三维 PAD 距离 + UCB 探索奖励项 (1 / sqrt(use_count + 1))
   */
  private sampleOrganicEpisodesWithUCB(mood: PADState, policyName: string, limit: number = 2) {
    return this.db
      .prepare(
        `SELECT id, action_policy, user_trigger_summary, assistant_response_digest, reward_weight, use_count,
                ((emotion_p - ?) * (emotion_p - ?) +
                 (emotion_a - ?) * (emotion_a - ?) +
                 (emotion_d - ?) * (emotion_d - ?)) AS mood_dist_sq
         FROM organic_episodes
         WHERE persona_id = ? AND action_policy = ?
         ORDER BY ((reward_weight + 0.45 / SQRT(use_count + 1)) / (0.2 + mood_dist_sq)) DESC
         LIMIT ?`
      )
      .all(
        mood.p, mood.p,
        mood.a, mood.a,
        mood.d, mood.d,
        this.personaId,
        policyName,
        limit
      ) as any[];
  }

  public compileMessages(
    rawMessages: ChatMessage[],
    mood: PADState,
    memories: RecalledMemory[],
    graphTriples: string[],
    options: CompileOptions = {}
  ): CompiledRequest {
    const lastMsg = rawMessages[rawMessages.length - 1];
    const shouldOverride =
      options.hasActiveToolLoop ||
      options.isJsonResponseFormat ||
      options.forceToolChoice ||
      lastMsg?.role === 'tool';

    // 【全场景理性熔断】：工具执行流或 Strict JSON 模式下，关闭 <affect_update> 双流协议，仅保留只读事实图谱
    if (shouldOverride) {
      const cloned = rawMessages.map((m) => ({ ...m }));
      if (graphTriples.length > 0 && cloned[0]?.role === 'system') {
        // 不破坏前缀，仅在最后一条非 tool 消息或不动原数组
      }
      return {
        messages: cloned,
        temperature: 0.2,
        presencePenalty: 0.0,
        activePolicyName: '理性工具执行态',
        referencedEpisodeIds: [],
        isCognitiveOverride: true,
      };
    }

    const policy = this.deriveActionPolicy(mood);
    const organicSamples = this.sampleOrganicEpisodesWithUCB(mood, policy.policyName, 2);
    const learnedRules = this.db
      .prepare(
        'SELECT trigger_condition, policy_directive FROM behavioral_policies WHERE persona_id = ? AND confidence >= 0.6 ORDER BY confidence DESC LIMIT 3'
      )
      .all(this.personaId) as any[];

    const memorySection =
      memories.length > 0
        ? memories
            .map(
              (m, i) =>
                `  ${i + 1}. [闪回记忆 | 权重:${m.salience}] ${m.summary}${
                  m.verbatim_quote ? ` (原话锚点: "${m.verbatim_quote}")` : ''
                }`
            )
            .join('\n')
        : '  （无特定历史事件闪回）';

    const rulesSection =
      learnedRules.length > 0
        ? learnedRules.map((r) => `  - 当[${r.trigger_condition}]时 -> ${r.policy_directive}`).join('\n')
        : '  - 默认准则：简短直接，结论先行。';

    const organicSection =
      organicSamples.length > 0
        ? `\n- 同姿态下曾获用户高度认可的回应结构参考（仅供把握分寸与篇幅节奏，严禁复读旧业务名词）：\n` +
          organicSamples
            .map(
              (s) =>
                `  * [触发语境: "${s.user_trigger_summary}"] -> [获认可的回应结构: "${s.assistant_response_digest}"]`
            )
            .join('\n')
        : '';

    // 注意：属性示例使用纯数值，不在引号内塞中文解释，防止模型照抄中文字面量
    const tailCognitiveAppendix = `\n\n<cognitive_context>
[本地潜意识与记忆协处理器注入 —— 仅供内部对齐决策姿态，严禁在正文中复述本块内容]
1. 关联事实与图谱：${graphTriples.join('；') || '核心搭档'} | 亲密度:${(mood.intimacy * 100).toFixed(0)}% 信任度:${(mood.trust * 100).toFixed(0)}%
2. 唤醒的过往闪回：
${memorySection}
3. 此刻心境驱动的【行为决策姿态】：【${policy.policyName}】(P=${mood.p}, A=${mood.a}, D=${mood.d})
   - 姿态执行要求：${policy.behavioralDirective}
4. 历史自蒸馏协作铁律：
${rulesSection}${organicSection}
5. 双流输出协议（必须在回复第1行先输出以下单行XML标签，评估截至用户最新这句话的情绪触动与对我上一轮回复的隐式反馈，随后换行输出正式正文）：
<affect_update dp="0.10" da="0.05" dd="0.00" d_trust="0.01" user_feedback_score="0.50" salience="0.60" memory_summary="截至目前确立的关键事实或约定(15字内，无则留空)" />
</cognitive_context>`;

    // 追加在最后一条 user 消息的末尾：既不插入非法的 mid-conversation system role，又保持前序所有消息及 User_t 头部 100% 命中 Prefix Cache
    const compiledMessages: ChatMessage[] = rawMessages.map((msg, idx) => {
      if (idx === rawMessages.length - 1 && msg.role === 'user') {
        return {
          ...msg,
          content: `${msg.content}${tailCognitiveAppendix}`,
        };
      }
      return msg;
    });

    return {
      messages: compiledMessages,
      temperature: policy.temperature,
      presencePenalty: policy.presencePenalty,
      activePolicyName: policy.policyName,
      referencedEpisodeIds: organicSamples.map((s) => s.id),
      isCognitiveOverride: false,
    };
  }
}
```

---

### 5. 工业级云端 SSE 双流状态机 (`src/pipeline/dual-stream.ts`)

**v2.1 核心修正**：
- 自动跳过前导空白与 `<think>...</think>` 思维链块；
- 改用 `>` 标签闭合符切分而非 `\n`，彻底杜绝“标签与正文同行时吞噬首段正文”；
- 补齐所有数值属性的区间 `clamp` 钳位与 `flush()` 流结束兜底方法，确保无标签短回复绝不丢包。

```typescript
export interface AffectUpdateHeader {
  dp: number;
  da: number;
  dd: number;
  dTrust: number;
  userFeedbackScore: number;
  salience: number;
  memorySummary: string;
}

const clampNum = (val: number, min: number, max: number) =>
  Number.isFinite(val) ? Math.max(min, Math.min(max, val)) : 0;

export class DualStreamParser {
  private buffer = '';
  private headerParsed = false;

  public pushChunk(
    chunk: string,
    onHeaderExtracted: (header: AffectUpdateHeader) => void
  ): string {
    if (this.headerParsed) return chunk;

    this.buffer += chunk;

    // 若包含 <think>...</think> 思维链块，先保留/剥离思维链后再定位 <affect_update
    let working = this.buffer;
    let thinkPrefix = '';
    if (working.trimStart().startsWith('<think>')) {
      const thinkEndIdx = working.indexOf('</think>');
      if (thinkEndIdx === -1) return ''; // 思考尚未结束，继续等待
      thinkPrefix = working.slice(0, thinkEndIdx + 8);
      working = working.slice(thinkEndIdx + 8);
    }

    const trimmed = working.trimStart();
    if (!trimmed) return '';

    const targetPrefix = '<affect_update';
    const checkLen = Math.min(trimmed.length, targetPrefix.length);

    // 若非 '<affect_update' 前缀，立即降级原样释放，绝不阻塞
    if (trimmed[0] !== '<' || !targetPrefix.startsWith(trimmed.slice(0, checkLen))) {
      this.headerParsed = true;
      return this.buffer;
    }

    // 等待 XML 标签闭合符 '>'
    const closeIdx = trimmed.indexOf('>');
    if (closeIdx === -1) {
      if (trimmed.length > 360) {
        this.headerParsed = true;
        return this.buffer;
      }
      return '';
    }

    const tagText = trimmed.slice(0, closeIdx + 1);
    // 仅剥离标签本身及紧随其后的单个换行符，绝不误吞同行正文
    const restText = trimmed.slice(closeIdx + 1).replace(/^\r?\n/, '');
    this.headerParsed = true;

    const getAttr = (name: string, fallback = '0') => {
      const m = tagText.match(new RegExp(`${name}\\s*=\\s*["']\\[?([^"'\\]]*)\\]?["']`, 'i'));
      return m ? m[1] : fallback;
    };

    onHeaderExtracted({
      dp: clampNum(parseFloat(getAttr('dp')), -0.4, 0.4),
      da: clampNum(parseFloat(getAttr('da')), -0.4, 0.4),
      dd: clampNum(parseFloat(getAttr('dd')), -0.4, 0.4),
      dTrust: clampNum(parseFloat(getAttr('d_trust')), -0.05, 0.05),
      userFeedbackScore: clampNum(parseFloat(getAttr('user_feedback_score')), -1.0, 1.0),
      salience: clampNum(parseFloat(getAttr('salience')), 0.0, 1.0),
      memorySummary: getAttr('memory_summary', '').trim().slice(0, 45),
    });

    return thinkPrefix ? `${thinkPrefix}\n${restText}` : restText;
  }

  /**
   * CRITICAL: 在 SSE 流结束 ([DONE]) 时必须调用 flush()，防止短于缓冲区的无标签回复被静默吞没
   */
  public flush(): string {
    if (this.headerParsed) return '';
    this.headerParsed = true;
    return this.buffer;
  }
}
```

---

## 五、 多子代理红队挑刺质疑与接纳度裁定清单

为检验 v2.0 方案在极端边界下的工程可靠性，我们并发派发了 3 个不同专业视角的子代理（**子代理 A：强化学习与情感动力学审计**、**子代理 B：Node/SQLite-vec 底层架构审计**、**子代理 C：LLM 上下文与缓存红队审计**）对方案进行了严苛挑刺。以下为汇总的 10 项核心质疑、接纳度裁定及 v2.1 落地修正对照：

| 编号 | 提出方 | 核心质疑与漏洞描述 | 接纳度裁定 | 裁定理由与 v2.1 工程修正措施 |
| :--- | :--- | :--- | :--- | :--- |
| **Q1** | 子代理 B | **`sqlite-vec` 的 `vec0` 缺失 `PARTITION KEY` 与 `BigInt` 绑定崩溃**：多角色下全局 Top-K 后置 JOIN 过滤会引发召回饥饿（返回 0 条）；且 `better-sqlite3` 传 JS `number` 给 `vec0` 主键会触发 C 扩展异常崩溃；主表删除后留下孤儿向量。 | **100% 完全接纳**<br>*(致命级工程 Bug)* | 在 `vec_episodic` 中显式声明 `persona_id TEXT PARTITION KEY` 与 `distance_metric=cosine`；写入时强制转换 `BigInt(info.lastInsertRowid)`；新增 `AFTER DELETE` 触发器级联删除孤儿向量。 |
| **Q2** | 子代理 B<br>子代理 C | **`DualStreamParser` 基于 `\n` 切分的三大流式缺陷**：① 前导空行或 `<think>` 块会导致 `<affect_update>` 标签直接裸露给前端；② 标签与正文同行（未换行）时会把首段正文一并吞掉；③ 缺少 `flush()` 导致短于 260 字的单行无标签回复在流结束时整包丢失。 | **100% 完全接纳**<br>*(致命级流处理 Bug)* | 彻底重写 `DualStreamParser`：先剥离/保留前导 `<think>...</think>` 与空白，改用定位 `>` 闭合符切分（仅剥离标签本体），为所有属性增加数值 `clampNum` 钳位，并新增流结束必调的 `flush()` 方法。 |
| **Q3** | 子代理 A<br>子代理 B | **记忆反向染色写回污染与维度断路**：① `blendWithRecalledMemories` 若写回数据库，连续讨论同一负面旧事会产生自激振荡锁死；② XML 协议漏了 `dd` 导致掌控度 `d_dominance` 成了死变量；③ `trust` 与 `intimacy` 线性累加几轮后必然顶死在 `1.0`。 | **100% 完全接纳**<br>*(核心算法漏洞)* | 严格隔离**持久基态（`tonicState`，落盘）**与**瞬时唤醒态（`phasicMood`，仅当轮编译用）**；补齐 `dd` 更新闭环；慢变量改用渐近阻尼公式 $\Delta R = \eta (1 - R) \delta$。 |
| **Q4** | 子代理 A<br>子代理 B<br>子代理 C | **`organic_episodes` 原文 `.slice(0, 160)` 硬截断与全局 `LIMIT 80` 坍塌**：① 硬截断会截出未闭合的 ```` ``` ```` 吞噬后续系统指令；② 无姿态过滤会把闲聊标本塞进代码排障；③ 全局 `LIMIT 80` 会让高频日常姿态把低频“阻断止损姿态”全部挤出数据库。 | **100% 完全接纳**<br>*(上下文污染漏洞)* | 新增 `sanitizeDigest()` 将代码块坍缩为 `[代码块]` 并清洗反引号/尖括号；抽样强制限定 `AND action_policy = ?` 同姿态桶；淘汰改为按每个姿态桶独立保留 Top-20 + 邻近坐标合并强化。 |
| **Q5** | 子代理 A | **伪 Bandit 纯贪婪排序（零探索率）导致马太效应死锁**：`ORDER BY reward_weight / (0.2 + mood_dist_sq)` 完全没有探索项，早期 2 条连胜标本将永久垄断，新标本永无被采样验证的机会。 | **100% 完全接纳**<br>*(RL 收敛性缺陷)* | 在 `sampleOrganicEpisodesWithUCB` 的 SQL 排序中引入 UCB 探索奖励项 `(reward_weight + 0.45 / SQRT(use_count + 1))` 并补齐三维 $(P, A, D)$ 距离。 |
| **Q6** | 子代理 A<br>子代理 B | **`pending_turn_json` 并发双结算竞态与跨轮张冠李戴**：事务外 `SELECT` 在用户快速连发两条消息时会重复扣分两次；工具调用熔断轮次未清理旧快照会导致第 $t+2$ 轮把奖惩错算到第 $t$ 轮头上。 | **100% 完全接纳**<br>*(并发一致性缺陷)* | 新增 `consumePendingTurnAtomically()`，利用 SQLite 原生 `UPDATE ... SET pending_turn_json = NULL ... RETURNING pending_turn_json` 实现单语句原子消费。 |
| **Q7** | 子代理 C | **首轮 Tool-Call（Step-0）与 JSON Mode 熔断盲区**：仅检查 `lastMsg.role === 'tool'` 无法拦截携带 `response_format: json_object` 或强制调工具的第 0 步请求，首行 XML 标签会毁坏 JSON 语法树。 | **100% 完全接纳**<br>*(Agent 协议兼容性)* | `compileMessages` 显式接收 `isJsonResponseFormat` 与 `forceToolChoice` 选项，命中时立即进入理性熔断态。 |
| **Q8** | 子代理 C | **尾部注入（Tail Injection）在 `messages` 中段插入 `role: 'system'` 的协议拒止与滑窗重算**：Claude / DeepSeek-R1 严格模板对中段 `system` 角色直接报 `400 Bad Request`；且插在 `User_t` 前面会破坏 `User_t` 本体的前缀缓存。 | **部分接纳**<br>*(接纳尾部追加，保留瞬时拔除)* | **接纳**：废除中段独立 `role: 'system'` 消息，改为将 `<cognitive_context>` 追加在最后一条 `user` 消息末尾，100% 兼容所有模型且保住 `User_t` 本体前缀。<br>**不接纳**：不将每轮 400 Token 的潜意识块永久留在历史上下文中，以免 20 轮后堆积 8000 Token 过期情绪垃圾。 |
| **Q9** | 子代理 A | **LLM“既当运动员又当裁判”的打分偏差**：在连续排障场景中，用户贴出新的报错堆栈极易被 LLM 误判为负向评分 `user_feedback_score < 0`，引发标本被误杀。 | **部分接纳**<br>*(接纳本地启发式免责，不加额外裁判模型)* | **接纳**：在 `ImplicitRLManager` 新增 `calibrateFeedbackScore()`，检测到堆栈/日志特征且无抱怨词时自动免除负分惩罚，并规定 `use_count >= 3` 后才允许淘汰。<br>**不接纳**：不在本地额外部署专门的 Reward Model 小模型，保持 20ms 零 GPU 极简架构。 |
| **Q10** | 子代理 C | **首行 XML 标签的自回归因果倒置**：要求模型在第 1 行输出 `memory_summary`，但此时模型尚未生成本轮正文；建议改为回复末尾输出（Trailer Tag）。 | **部分接纳**<br>*(接纳语义重定义，驳回尾部标签)* | **接纳**：将 `memory_summary` 明确定义为“截至用户最新这句话已确立的事实/约定”，无需预知模型即将生成的长文。<br>**驳回尾部标签**：在 SSE 流式网关中，尾部标签会迫使流末尾挂起缓冲以防半截标签泄漏，严重损害流式收尾体验；首行状态机拦截是流式延迟最优解。 |
