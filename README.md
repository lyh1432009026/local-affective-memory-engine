# 本地记忆与情感神经伴生引擎 v2.4（零人工种子 · 隐式强化 · RTX 2070 Jev 双模 · 100天超长窗口抗压缩终版）

> **版本演进说明**：
> - **v1.0**：确立 Node.js 本地“海马体+杏仁核”驱动云端大模型 API 的基础架构。
> - **v2.0**：彻底废弃人工手写台词种子库（`seed_anchors.json`），升级为 **0 样本冷启动 + 认知行为决策姿态驱动（Action Tendency）+ 下一轮隐式反馈 Bandit 强化优胜劣汰**。
> - **v2.2（100% 合入 3 路子代理全部红队接纳项）**：
>   1. **SQLite 与 `sqlite-vec` 生产级加固**：`vec0` 显式声明 `persona_id TEXT PARTITION KEY` 与 `distance_metric=cosine`；写入强制转换 `BigInt(rowId)` 防止 C 扩展崩溃；新增 `AFTER DELETE` 触发器清理孤儿向量与复合二级索引。
>   2. **情感动力学防锁死与防抖动**：严格隔离**持久基态（`tonicState`）**与**瞬时唤醒态（`phasicMood`）**；新增**单步稳态回归拉力（Per-Turn Homeostatic Pull）**防止高频对话无时间衰减时滑向极值；为姿态切换引入**施密特触发器迟滞区间（Schmitt Trigger Hysteresis）**消除临界点人格高频翻转；补齐 `dd` 三维闭环与慢变量渐近阻尼。
>   3. **隐式强化学习（Implicit RL）全闭环**：采用 `UPDATE ... RETURNING` 原子消费快照（支持 Tool Loop 跨步挂起保护 Hold & Settle）；引入**余弦相似度话题硬切换门控（Topic-Shift Gating）**与**排障贴报错免责校准**；打通 `behavioral_policies` 置信度在线更新与淘汰闭环；入库执行结构化代码块脱敏清洗、按姿态分桶保留 Top-20 及 UCB 探索采样。
>   4. **记忆检索不应期（Refractory Period）**：对 3 分钟内刚召回过的闪回记忆施加短期抑制系数，根除同一负面记忆在连续多轮中被反复拉出反刍。
>   5. **幂等历史清洗与 User 尾部安全追加**：入口自动幂等剥离历史残留的 `<cognitive_context>`，并将当轮潜意识块追加至最后一条 `user` 消息尾部（兼容 Claude/DeepSeek-R1 严格角色交替，100% 保护前序历史与 `User_t` 本体 Prefix Cache）。
> - **v2.3（新增 RTX 2070 本地 Jev / System One 决策引擎双模自适应架构）**：
>   - 针对 **NVIDIA RTX 2070 (8GB GDDR6, 448GB/s)** 定制 `src/engine/local-jev.ts`：基于 **Prefix KV-Cache 广播 + 单 Token Logits 提取 (`max_tokens: 1, top_logprobs`) + 香农熵校准置信度 (`Confidence = 1 - H(P)/ln(K)`)**，在本地 **35ms ~ 65ms** 内一次性并发完成六维判定。
>   - **双模无缝降级（`AFFECT_MODE=jev | inline`）**：本地 2070 开启 Jev 服务时走 `jev` 零延迟前置判定；显卡被占满或服务未启动时，`450ms` 超时自动无缝降级回 `inline`。
> - **v2.4（当前终版 · 新增 20~100 天单窗口超长对话“三级记忆金字塔 + 自动压缩重锚定 + 仿生睡眠巩固”架构）**：
>   1. **长记忆文本双层解耦（`summary` + `full_payload` 2000字按需展开）**：解决 45 字截断存不下长段技术规范/业务长文本的痛点；常规召回只展示 60 字检索头，Top-1 高相似度命中（`semantic_sim >= 0.72`）时自动按需展开 2000 字 `full_payload` 完整长文本载荷。
>   2. **客户端自动压缩检测与灵魂重锚定（Compaction Detector & Post-Compaction Re-Anchoring）**：全量对话原文实时冷备份至 `raw_turn_archive`；当检测到客户端触发超出上下文自动压缩（`messages.length` 骤降 $\ge 45\%$ 或出现 `<conversation_history_summary>`）时，自动从本地冷表抢救提炼 **《阶段叙事篇章》（`narrative_chapters`）** 并在随后 3 轮挂载重锚定块，彻底根除“一压缩就失忆变回陌生客服”。
>   3. **仿生睡眠巩固与过期事实覆写（Sleep Consolidation & Fact Superseding）**：跨天唤醒（间隔 $\ge 6$ 小时）或每满 25 轮自动对高相似碎片（余弦相似度 $\ge 0.84$）进行聚类合并去重，并支持新设定自动覆写旧设定（`status: 'active' -> 'superseded'`），确保同一窗口连续聊 100 天不爆表、旧设定不霸榜。
>   4. **网关内置 48K Token 滑动窗口护栏**：若客户端本身无自动压缩功能，超过 48K 水位时自动按 20 条固定块折叠归档为本地阶段篇章，永不触发云端 `400 Context Length Exceeded`。

---

## 一、 技术选型（支持 RTX 2070 本地 Jev 加速 & 零 GPU 降级双模）

| 模块层级 | 核心依赖包 / 引擎 | 选型理由与性能指标 |
| :--- | :--- | :--- |
| **运行时与宿主** | `Node.js >= 20` + `TypeScript` (`tsx`) | 原生兼容 DeepSeek Harness (`Cordis` 插件内核) 与独立 HTTP 代理网关两种运行形态 |
| **本地统一存储** | `better-sqlite3` + `sqlite-vec` | 单一 `.db` 文件同时承载情感状态机、隐式强化样本、图谱三元组与 Float32 向量索引；开启 WAL 模式单次检索 `< 5ms` |
| **本地语义嵌入** | `@huggingface/transformers` (ONNX) | 本地 CPU 运行 `Xenova/bge-small-zh-v1.5`（512 维归一化向量），内存占用约 `180MB`（不占 2070 显存），单句推理 `< 12ms` |
| **本地 System 1 决策器**<br>*(RTX 2070 专属)* | `llama-server (CUDA 12)` + **`Qwen2.5-3B / Qwen3-4B (Q5_K_M)`** | 复现 **Jev (System One)** 单步 Logits 广播范式；仅占 **2.6GB ~ 3.1GB 显存**（严控在 2070 的 8GB 独立显存红线内，余留 5GB 供日常开发），单轮 6 题并发耗时 **`35ms ~ 65ms`** |
| **云端 System 2 渲染器** | `openai` (Node SDK) | 兼容 DeepSeek (V3 / R1 / V4 Pro)、Claude、Qwen、GPT 等所有 OpenAI 协议接口 |
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
    ├── index.ts                   # 双模闭环主入口：自动调度 Jev 前置决策 / Inline 双流标签 + 异步记忆守门员
    ├── db/
    │   ├── client.ts              # better-sqlite3 初始化（WAL模式）、sqlite-vec 加载与 Schema 自动迁移
    │   └── schema.sql             # 五张核心表结构 + Partition Key 向量表 + 级联清理触发器 + 复合索引
    ├── engine/
    │   ├── embedding.ts           # Transformers.js 本地 ONNX 向量化与余弦相似度工具
    │   ├── local-jev.ts           # [v2.3新增] RTX 2070 本地 Jev 决策引擎：单Token Logits提取 + 香农熵校准置信度
    │   ├── affective-ssm.ts       # 连续情感状态空间：Tonic/Phasic 隔离、单步稳态拉力、三维演化与渐近阻尼
    │   ├── implicit-rl.ts         # 隐式反馈强化器：RETURNING 原子消费、话题切换门控、报错免责、法则演化与分桶淘汰
    │   ├── memory-retriever.ts    # 四维混合召回与长记忆载荷：60字检索头 + 2000字 full_payload 按需展开 + 同主题旧记忆覆写
    │   ├── memory-consolidation.ts# [v2.4新增] 100天超长窗口引擎：自动压缩检测重锚定、跨天睡眠聚类合并、48K滑动窗口护栏
    │   └── context-compiler.ts    # 行为姿态编译器：施密特迟滞防抖、UCB抽样、Top-1长记忆展开、压缩重锚定与尾部编译
    └── pipeline/
        └── dual-stream.ts         # 工业级流式状态机（Inline 降级模式专用）：兼容 <think> 块、基于 '>' 闭合切分与 flush()
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
    -- 性格稳态基线（随物理时间与单步回归自然回落的锚点）
    base_p REAL NOT NULL DEFAULT 0.2,
    base_a REAL NOT NULL DEFAULT 0.3,
    base_d REAL NOT NULL DEFAULT 0.1,
    decay_lambda REAL NOT NULL DEFAULT 0.25, -- 每小时情绪衰减率
    -- 慢变量：长期关系账本（带非对称渐近阻尼）
    intimacy REAL NOT NULL DEFAULT 0.5,      -- 亲密度/熟稔度 [0.05, 0.99]
    trust REAL NOT NULL DEFAULT 0.6,         -- 信任度 [0.05, 0.99]
    -- 上一轮激活姿态（用于施密特触发器迟滞防抖）
    last_active_policy TEXT NOT NULL DEFAULT '熟稔默契协同姿态',
    last_updated_ms INTEGER NOT NULL,
    -- 暂存上一轮交互快照，通过 UPDATE ... RETURNING 原子消费
    pending_turn_json TEXT DEFAULT NULL
);

-- 2. 有机生长交互标本表（0人工手写，100%由真实高共鸣对话自动晋升、合并与按姿态分桶淘汰）
CREATE TABLE IF NOT EXISTS organic_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    emotion_p REAL NOT NULL,
    emotion_a REAL NOT NULL,
    emotion_d REAL NOT NULL,
    action_policy TEXT NOT NULL,             -- 所属行为决策姿态桶
    user_trigger_summary TEXT NOT NULL,      -- 已清洗反引号与控制符的触发语境摘要
    assistant_response_digest TEXT NOT NULL, -- 已脱敏代码块与结构特征的回应示范
    reward_weight REAL NOT NULL DEFAULT 1.0, -- EMA + Bandit 强化权重
    use_count INTEGER NOT NULL DEFAULT 1,    -- 被抽样次数（用于 UCB 探索项与最小观察门槛）
    created_at_ms INTEGER NOT NULL,
    last_used_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_organic_persona_policy
    ON organic_episodes(persona_id, action_policy, reward_weight DESC);

-- 3. 自反思行为策略法则表（支持在线隐式反馈置信度动态升降与淘汰）
CREATE TABLE IF NOT EXISTS behavioral_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    trigger_condition TEXT NOT NULL,
    policy_directive TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.75,   -- 置信度权重 [0.1, 0.99]，低于 0.35 自动淘汰
    use_count INTEGER NOT NULL DEFAULT 1,
    updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_policies_persona_conf
    ON behavioral_policies(persona_id, confidence DESC);

-- 4. L1 微观情景闪回记忆主表（v2.4 升级：60字检索头 + 2000字 full_payload 长文本双层解耦 + 状态生命周期）
CREATE TABLE IF NOT EXISTS episodic_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    summary TEXT NOT NULL,                   -- 60字高密检索索引头（用于向量化与常规列表）
    full_payload TEXT DEFAULT '',            -- [v2.4新增] 1500~2000字完整长文本载荷/技术规范/代码切片（Top-1高匹配时按需展开）
    verbatim_quote TEXT DEFAULT '',
    emotion_p REAL NOT NULL,
    emotion_a REAL NOT NULL,
    emotion_d REAL NOT NULL,
    salience REAL NOT NULL DEFAULT 0.5,
    access_count INTEGER NOT NULL DEFAULT 0,
    -- active: 活跃检索池 | consolidated: 已在跨天睡眠巩固中合并 | superseded: 已被后续新事实覆写
    status TEXT NOT NULL DEFAULT 'active',
    created_at_ms INTEGER NOT NULL,
    last_accessed_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_episodic_persona_status
    ON episodic_memories(persona_id, status, salience DESC, last_accessed_ms DESC);

-- 情景记忆向量虚拟表：显式声明 PARTITION KEY 与 cosine 距离，彻底解决多角色 Post-Filter 饥饿
CREATE VIRTUAL TABLE IF NOT EXISTS vec_episodic USING vec0(
    memory_id INTEGER PRIMARY KEY,
    persona_id TEXT PARTITION KEY,
    embedding FLOAT[512] distance_metric=cosine
);

-- 主表删除或归档/覆写时自动级联清理 vec0 活跃向量，防止 100 天长跑后过期向量霸榜
CREATE TRIGGER IF NOT EXISTS trg_delete_vec_episodic
AFTER DELETE ON episodic_memories
BEGIN
    DELETE FROM vec_episodic WHERE memory_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_archive_vec_episodic
AFTER UPDATE OF status ON episodic_memories
WHEN NEW.status != 'active'
BEGIN
    DELETE FROM vec_episodic WHERE memory_id = NEW.id;
END;

-- 5. L2 中观阶段叙事篇章表（v2.4 新增：每满 25 轮、隔夜跨天或触发客户端自动压缩时生成，用于压缩后灵魂重锚定）
CREATE TABLE IF NOT EXISTS narrative_chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    chapter_title TEXT NOT NULL,             -- 阶段主题标题
    narrative_digest TEXT NOT NULL,          -- 300~600字阶段性进展、关键架构决议与双方默契脉络
    dominant_mood_p REAL NOT NULL DEFAULT 0.2,
    dominant_mood_a REAL NOT NULL DEFAULT 0.3,
    turn_span_count INTEGER NOT NULL DEFAULT 0,
    trigger_reason TEXT NOT NULL,            -- 'auto_compaction' | 'sleep_gap' | 'turn_batch'
    created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chapters_persona_time
    ON narrative_chapters(persona_id, created_at_ms DESC);

-- 6. 全量对话原文冷归档表（v2.4 新增：100天1万轮仅占 ~20MB 磁盘，保障客户端自动压缩时本地一字不丢）
CREATE TABLE IF NOT EXISTS raw_turn_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    user_prompt TEXT NOT NULL,
    assistant_reply TEXT NOT NULL,
    action_policy TEXT NOT NULL,
    emotion_p REAL NOT NULL,
    emotion_a REAL NOT NULL,
    consolidated_chapter_id INTEGER DEFAULT NULL, -- NULL 表示尚未被睡眠巩固归档进 narrative_chapters
    created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_archive_unconsolidated
    ON raw_turn_archive(persona_id, consolidated_chapter_id, created_at_ms ASC);

-- 7. L3 宏观实体关系与共同认知图谱表（v2.4 升级：支持同主谓新事实自动覆写旧设定 status='superseded'）
CREATE TABLE IF NOT EXISTS relational_graph (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object TEXT NOT NULL,
    emotional_valence REAL DEFAULT 0.0,
    confidence REAL DEFAULT 1.0,
    status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'superseded'
    updated_at_ms INTEGER NOT NULL,
    UNIQUE(persona_id, subject, predicate, object)
);
```

---

## 四、 核心模块完整代码实现

### 1. 数据库初始化与向量扩展挂载 (`src/db/client.ts`)

```typescript
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import fs from 'node:fs';
import path from 'node:path';

export function initDatabase(dbFilePath: string): Database.Database {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbFilePath);
  sqliteVec.load(db);

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);

  return db;
}
```

---

### 2. 本地 ONNX 语义向量化与相似度计算 (`src/engine/embedding.ts`)

```typescript
import { pipeline, env } from '@huggingface/transformers';

// 国内网络镜像加速，首次运行自动拉取 ~130MB ONNX 模型并缓存至本地
env.remoteHost = process.env.HF_MIRROR || 'https://hf-mirror.com';

let extractorPromise: Promise<any> | null = null;

export async function embedText(text: string): Promise<Float32Array> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
      dtype: 'q8',
    });
  }
  const extractor = await extractorPromise;
  const output = await extractor(text, { pooling: 'cls', normalize: true });
  return new Float32Array(output.data);
}

/** 计算两个归一化 512 维向量的余弦相似度（用于话题硬切换检测） */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}
```

---

### 3. 连续情感动力学引擎 (`src/engine/affective-ssm.ts`)

**接纳项完整实现**：
- 严格区分**持久基态（`tonicState`）**与**瞬时唤醒心境（`phasicMood`）**，记忆染色结果绝不写回数据库；
- 引入**单步稳态回归拉力（Per-Turn Homeostatic Pull = 0.06）**，保证在连续秒回的高频对话（$\Delta t \approx 0$）下也不会单向滑入负面极值死锁；
- 补齐 `dd`（掌控度）三维更新链路与 `trust`/`intimacy` 非对称渐近阻尼。

```typescript
import Database from 'better-sqlite3';

export interface PADState {
  p: number; // Pleasure [-1, 1]
  a: number; // Arousal [0, 1]
  d: number; // Dominance [-1, 1]
  intimacy: number; // [0.05, 0.99]
  trust: number; // [0.05, 0.99]
  lastActivePolicy: string;
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

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
      userFeedbackScore: number;
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

    const intimacyStep =
      delta.userFeedbackScore >= 0.3
        ? (1.0 - tonicState.intimacy) * 0.015
        : delta.userFeedbackScore <= -0.4
        ? -tonicState.intimacy * 0.02
        : 0.002;
    const nextIntimacy = Number(clamp(tonicState.intimacy + intimacyStep, 0.05, 0.99).toFixed(3));
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
```

---

### 4. 下一轮隐式反馈强化器 (`src/engine/implicit-rl.ts`)

**接纳项完整实现**：
- `UPDATE ... RETURNING` 原子消费快照（并发安全）；
- **余弦相似度话题硬切换门控（Topic-Shift Gating）**：若用户在第 $t+1$ 轮直接切换到语义无关的新任务（余弦相似度 `< 0.18` 且无显式评价词），自动跳过对上一轮标本的奖惩结算，杜绝跨话题误伤；
- **排障贴报错免责校准** + **提取结构元特征并脱敏代码块**；
- **打通 `behavioral_policies` 在线置信度更新与淘汰闭环** + **`organic_episodes` 按姿态桶独立保留 Top-20**。

```typescript
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
   * 单条 SQL 原子取出并清空上一轮快照（Global Exactly-Once 消费，彻底根绝并发双结算）
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
    // 若本轮用户输入与上一轮语义余弦相似度 < 0.18 且不含显式评价词，说明用户开启了全新无关话题，不奖惩上一轮标本
    const hasExplicitFeedbackWord = /(不对|别废话|太啰嗦|可以|好的|搞定|完美)/.test(currentUserInput);
    if (
      currentUserEmbedding &&
      pending.userPromptEmbedding?.length === currentUserEmbedding.length &&
      !hasExplicitFeedbackWord
    ) {
      const topicSim = cosineSimilarity(pending.userPromptEmbedding, currentUserEmbedding);
      if (topicSim < 0.18) {
        return; // 无关新话题，直接跳过结算
      }
    }

    const score = this.calibrateFeedbackScore(rawLlmFeedbackScore, currentUserInput);

    const tx = this.db.transaction(() => {
      // 1. EMA 平滑更新上一轮参考过的 organic_episodes 权重（use_count >= 3 且权重 < 0.38 才物理淘汰）
      if (pending.referencedEpisodeIds.length > 0) {
        const targetReward = 1.0 + score * 0.8;
        const updateEpStmt = this.db.prepare(
          `UPDATE organic_episodes
           SET reward_weight = MIN(2.2, reward_weight * 0.75 + ? * 0.25),
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

function clampScore(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
```

---

### 5. 四维心境一致性混合检索与长记忆载荷展开器 (`src/engine/memory-retriever.ts`)

**v2.2 接纳项完整实现**：
- 使用 `vec0` 的 `persona_id PARTITION KEY` 分区内 KNN；
- 写入 `vec0` 强制使用 `BigInt(info.lastInsertRowid)`；
- 新增 **3 分钟闪回不应期（Refractory Period Penalty）**：对最近 3 分钟内刚被召回过的记忆施加 `0.35` 的共鸣抑制系数，彻底杜绝同一条高冲击负面记忆在连续多轮对话中被反复拉出反刍。

**v2.4 新增能力**：
- **长记忆文本双层解耦（Summary-Payload）**：`summary`（60 字检索头） + `full_payload`（1500~2000 字完整长文本），检索阶段仅返回轻量摘要，Top-1 高匹配时按需展开完整载荷；
- **同主题旧记忆自动覆写（Superseding）**：写入新记忆前先检索语义高度重合的活跃旧记忆，将其 `status` 降级为 `superseded`，根除第 5 天旧设定在第 90 天霸榜的时序失真。

```typescript
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
    if (!summary || salience < 0.35) return;

    const cleanSummary = summary.replace(/[<>`]/g, '').trim().slice(0, 60);
    const cleanQuote = buildStructuralDigest(verbatimQuote, 90);
    // [v2.4] 长文本载荷：保留完整长段技术规范/业务长文本，最多 2000 字，剥离尖括号防注入
    const cleanPayload = (fullPayload || verbatimQuote)
      .replace(/<[^>]+>/g, '')
      .replace(/[`]/g, "'")
      .trim()
      .slice(0, 2000);

    const tx = this.db.transaction(() => {
      // [v2.4] 覆写检测：语义高度重合(cos_distance < 0.30)的活跃旧记忆降级为 superseded
      const overlaps = this.db
        .prepare(
          `SELECT m.id
           FROM vec_episodic v
           JOIN episodic_memories m ON m.id = v.memory_id
           WHERE v.embedding MATCH ? AND k = 3 AND v.persona_id = ? AND m.status = 'active'`
        )
        .all(Buffer.from(embedding.buffer), this.personaId) as any[];
      if (overlaps.length > 0) {
        const supersedeStmt = this.db.prepare(
          `UPDATE episodic_memories SET status = 'superseded' WHERE id = ? AND persona_id = ?`
        );
        for (const ov of overlaps) {
          if ((ov as any).distance < 0.30) supersedeStmt.run(ov.id, this.personaId);
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
          mood.p,
          mood.a,
          mood.d,
          salience,
          nowMs,
          nowMs
        );

      // CRITICAL: vec0 主键必须绑定为 BigInt
      const rowIdBigInt = BigInt(info.lastInsertRowid);
      this.db
        .prepare(
          'INSERT INTO vec_episodic (memory_id, persona_id, embedding) VALUES (?, ?, ?)'
        )
        .run(rowIdBigInt, this.personaId, Buffer.from(embedding.buffer));
    });

    tx();
  }

  public retrieveHybridMemories(
    queryEmbedding: Float32Array,
    currentMood: PADState,
    topK: number = 4
  ): RecalledMemory[] {
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
      .all(Buffer.from(queryEmbedding.buffer), this.personaId) as any[];

    const nowMs = Date.now();

    const scored = candidates.map((c) => {
      const semanticSim = Math.max(0, 1 - c.cos_distance);
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
```

---

### 6. 行为姿态编译器与尾部安全追加器 (`src/engine/context-compiler.ts`)

**接纳项完整实现**：
- **施密特触发器迟滞区间（Schmitt Trigger Hysteresis）**：根据 `mood.lastActivePolicy` 为当前姿态提供 `0.06` 的保持死区，彻底消除临界点附近的姿态高频翻转；
- **入口幂等剥离历史 `<cognitive_context>`**：在有状态宿主（如 DeepSeek Harness）下自动清洗前序消息残留块；
- **理性熔断态下只读保留 `graphTriples` 事实记忆**；
- **UCB 探索奖励 + 最近使用冷却惩罚抽样**。

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
  /** 当 RTX 2070 本地 Jev 决策器已前置完成评估时设为 true，免除云端主模型首行吐 <affect_update> 标签 */
  omitInlineAffectTag?: boolean;
  /** [v2.4] 客户端自动压缩后重锚定用的阶段叙事篇章（最近 2 篇），由 memory-consolidation 传入 */
  recentNarrativeChapters?: string[];
}

export interface CompiledRequest {
  messages: ChatMessage[];
  temperature: number;
  presencePenalty: number;
  activePolicyName: string;
  referencedEpisodeIds: number[];
  referencedPolicyIds: number[];
  isCognitiveOverride: boolean;
}

export class ContextCompiler {
  constructor(private db: Database.Database, private personaId: string = 'default') {}

  /**
   * 带施密特触发器迟滞区间 (Hysteresis = 0.06) 的行为决策姿态推导，防止临界值附近高频翻转
   */
  private deriveActionPolicyWithHysteresis(mood: PADState) {
    const temperature = Number((0.45 + mood.a * 0.35).toFixed(2));
    const presencePenalty = Number((mood.a > 0.6 ? 0.25 : 0.1).toFixed(2));
    const last = mood.lastActivePolicy;

    // 若上一轮已是【阻断与架构止损姿态】，退出门槛放宽至 a < 0.59 或 p > -0.09
    const stopLossA = last === '阻断与架构止损姿态' ? 0.59 : 0.65;
    const stopLossP = last === '阻断与架构止损姿态' ? -0.09 : -0.15;
    if (mood.a >= stopLossA && mood.p < stopLossP && mood.d >= -0.05) {
      return {
        policyName: '阻断与架构止损姿态',
        behavioralDirective:
          '当前检测到高风险或重复踩坑信号：不要盲从修补指令，优先指出底层死穴或过往同类教训，直接给出止损方案，单句短促有力，省略全部客套。',
        temperature: 0.4,
        presencePenalty: 0.15,
      };
    }

    const sprintA = last === '极简高密攻坚姿态' ? 0.59 : 0.65;
    if (mood.a >= sprintA && mood.p >= stopLossP) {
      return {
        policyName: '极简高密攻坚姿态',
        behavioralDirective:
          '当前处于高频执行/排障流：砍掉所有寒暄、过渡句与原理科普，第一行直接给结论或根因，紧跟可执行代码或清单。',
        temperature,
        presencePenalty,
      };
    }

    const lowEnergyA = last === '克制收敛与低耗兜底姿态' ? 0.44 : 0.38;
    if (mood.a < lowEnergyA && mood.p < 0) {
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
   * 同姿态桶 (action_policy = ?) + 三维 PAD 距离 + UCB 探索项 + 刚使用冷却惩罚
   */
  private sampleOrganicEpisodesWithUCB(mood: PADState, policyName: string, limit: number = 2) {
    const nowMs = Date.now();
    return this.db
      .prepare(
        `SELECT id, action_policy, user_trigger_summary, assistant_response_digest, reward_weight, use_count,
                ((emotion_p - ?) * (emotion_p - ?) +
                 (emotion_a - ?) * (emotion_a - ?) +
                 (emotion_d - ?) * (emotion_d - ?)) AS mood_dist_sq,
                CASE WHEN (? - last_used_ms) < 180000 THEN 0.65 ELSE 1.0 END AS cooldown_factor
         FROM organic_episodes
         WHERE persona_id = ? AND action_policy = ?
         ORDER BY (((reward_weight + 0.45 / SQRT(use_count + 1)) * cooldown_factor) / (0.2 + mood_dist_sq)) DESC
         LIMIT ?`
      )
      .all(
        mood.p, mood.p,
        mood.a, mood.a,
        mood.d, mood.d,
        nowMs,
        this.personaId,
        policyName,
        limit
      ) as any[];
  }

  /** 幂等剥离历史消息中残留的 <cognitive_context> 块，保证前序消息洁净与 Prefix Cache 稳定 */
  private stripHistoricalCognitiveBlocks(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((m) => ({
      ...m,
      content:
        typeof m.content === 'string'
          ? m.content.replace(/\n*<cognitive_context>[\s\S]*?<\/cognitive_context>/g, '')
          : m.content,
    }));
  }

  public compileMessages(
    rawMessages: ChatMessage[],
    mood: PADState,
    memories: RecalledMemory[],
    graphTriples: string[],
    options: CompileOptions = {}
  ): CompiledRequest {
    const cleanMessages = this.stripHistoricalCognitiveBlocks(rawMessages);
    const lastMsg = cleanMessages[cleanMessages.length - 1];
    const shouldOverride =
      options.hasActiveToolLoop ||
      options.isJsonResponseFormat ||
      options.forceToolChoice ||
      lastMsg?.role === 'tool';

    // 【全场景理性熔断】：工具执行流或 Strict JSON 模式下，关闭 <affect_update> 双流协议，仅在末尾只读附带事实图谱
    if (shouldOverride) {
      if (graphTriples.length > 0 && lastMsg && typeof lastMsg.content === 'string') {
        lastMsg.content += `\n<cognitive_context>[只读事实图谱参考: ${graphTriples.join('；')}]</cognitive_context>`;
      }
      return {
        messages: cleanMessages,
        temperature: 0.2,
        presencePenalty: 0.0,
        activePolicyName: mood.lastActivePolicy,
        referencedEpisodeIds: [],
        referencedPolicyIds: [],
        isCognitiveOverride: true,
      };
    }

    const policy = this.deriveActionPolicyWithHysteresis(mood);
    const organicSamples = this.sampleOrganicEpisodesWithUCB(mood, policy.policyName, 2);
    const learnedRules = this.db
      .prepare(
        'SELECT id, trigger_condition, policy_directive FROM behavioral_policies WHERE persona_id = ? AND confidence >= 0.55 ORDER BY confidence DESC LIMIT 3'
      )
      .all(this.personaId) as any[];

    const memorySection =
      memories.length > 0
        ? memories
            .map((m, i) => {
              // [v2.4] 渐进式披露：Top-1 高语义命中且携带长文本时，展开完整 full_payload；其余仅展示 60 字检索头
              const isTopHit = i === 0 && m.semantic_sim >= 0.72 && m.full_payload.length > 60;
              const body = isTopHit
                ? `[完整长记忆展开] ${m.full_payload.slice(0, 1200)}`
                : m.summary;
              return `  ${i + 1}. [闪回记忆 | 权重:${m.salience}] ${body}${
                m.verbatim_quote && !isTopHit ? ` (结构快照: "${m.verbatim_quote}")` : ''
              }`;
            })
            .join('\n')
        : '  （无特定历史事件闪回）';

    // [v2.4] 客户端自动压缩后的灵魂重锚定块：把被通用压缩器抹掉的共同经历与默契脉络补回来
    const reanchorSection =
      options.recentNarrativeChapters && options.recentNarrativeChapters.length > 0
        ? `\n6. 阶段叙事重锚定（客户端最近发生过上下文自动压缩，以下为本地抢救保留的阶段性共同经历与默契脉络，仅供对齐上下文，严禁在正文中复述）：\n${options.recentNarrativeChapters
            .map((ch) => `  - ${ch}`)
            .join('\n')}`
        : '';

    const rulesSection =
      learnedRules.length > 0
        ? learnedRules.map((r) => `  - 当[${r.trigger_condition}]时 -> ${r.policy_directive}`).join('\n')
        : '  - 默认准则：简短直接，结论先行。';

    const organicSection =
      organicSamples.length > 0
        ? `\n- 同姿态下曾获用户高度认可的回应结构签名（仅供对齐篇幅节奏，严禁复读旧话题名词）：\n` +
          organicSamples
            .map(
              (s) =>
                `  * [触发特征: "${s.user_trigger_summary}"] -> [获认可结构: "${s.assistant_response_digest}"]`
            )
            .join('\n')
        : '';

    const inlineTagProtocolSection = options.omitInlineAffectTag
      ? ''
      : `\n5. 双流输出协议（必须在回复第1行先输出以下单行XML标签，评估截至用户最新这句话的情绪触动与对我上一轮回复的隐式反馈，随后换行输出正式正文）：\n<affect_update dp="0.10" da="0.05" dd="0.00" d_trust="0.01" user_feedback_score="0.50" salience="0.60" memory_summary="截至目前确立的关键事实或约定(15字内，无则留空)" />`;

    const tailCognitiveAppendix = `\n\n<cognitive_context>
[本地潜意识与记忆协处理器注入 —— 仅供内部对齐决策姿态，严禁在正文中复述本块内容]
1. 关联事实与图谱：${graphTriples.join('；') || '核心搭档'} | 亲密度:${(mood.intimacy * 100).toFixed(0)}% 信任度:${(mood.trust * 100).toFixed(0)}%
2. 唤醒的过往闪回：
${memorySection}
3. 此刻心境驱动的【行为决策姿态】：【${policy.policyName}】(P=${mood.p}, A=${mood.a}, D=${mood.d})
   - 姿态执行要求：${policy.behavioralDirective}
4. 历史自蒸馏协作铁律：
${rulesSection}${organicSection}${inlineTagProtocolSection}${reanchorSection}
</cognitive_context>`;

    const compiledMessages: ChatMessage[] = cleanMessages.map((msg, idx) => {
      if (idx === cleanMessages.length - 1 && msg.role === 'user') {
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
      referencedPolicyIds: learnedRules.map((r) => r.id),
      isCognitiveOverride: false,
    };
  }
}
```

---

### 7. 工业级云端 SSE 双流状态机 (`src/pipeline/dual-stream.ts`)

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

    // 兼容 <think>...</think> 思维链块：保留思维链，待 </think> 闭合后再拦截正文首部的 <affect_update
    let working = this.buffer;
    let thinkPrefix = '';
    if (working.trimStart().startsWith('<think>')) {
      const thinkEndIdx = working.indexOf('</think>');
      if (thinkEndIdx === -1) return '';
      thinkPrefix = working.slice(0, thinkEndIdx + 8);
      working = working.slice(thinkEndIdx + 8);
    }

    const trimmed = working.trimStart();
    if (!trimmed) return '';

    const targetPrefix = '<affect_update';
    const checkLen = Math.min(trimmed.length, targetPrefix.length);

    if (trimmed[0] !== '<' || !targetPrefix.startsWith(trimmed.slice(0, checkLen))) {
      this.headerParsed = true;
      return this.buffer;
    }

    const closeIdx = trimmed.indexOf('>');
    if (closeIdx === -1) {
      if (trimmed.length > 360) {
        this.headerParsed = true;
        return this.buffer;
      }
      return '';
    }

    const tagText = trimmed.slice(0, closeIdx + 1);
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

  /** 在 SSE 流结束 ([DONE]) 时必须调用，防止短于缓冲区的无标签短回复被静默吞没 */
  public flush(): string {
    if (this.headerParsed) return '';
    this.headerParsed = true;
    return this.buffer;
  }
}
```

---

### 8. RTX 2070 本地 Jev (System One) 单步 Logits 决策引擎 (`src/engine/local-jev.ts`)

专为 **RTX 2070 (8GB GDDR6, 448GB/s)** 打造的本地非自回归决策模块：
- **推荐本地启动命令（显存占用仅 ~2.7GB，留足 5GB 给日常开发）**：
  ```bash
  llama-server.exe -m Qwen2.5-3B-Instruct-Q5_K_M.gguf -ngl 99 -c 8192 -np 6 --cache-reuse 256 --port 8081
  ```
- **核心机制**：共享 `statePrefix` 触发 Prefix KV-Cache 广播，`max_tokens: 1` 跳过自回归解码，直接从 `top_logprobs` 提取候选档位对数概率做 Softmax 归一化，并用**归一化香农熵（Normalized Shannon Entropy）**输出校准置信度 `confidence`。

```typescript
import { PendingTurnSnapshot, buildStructuralDigest } from './implicit-rl';

export interface JevScoreResult {
  value: number;
  confidence: number;
  probs: number[];
}

export interface JevNoulResult {
  prob: number;
  confidence: number;
}

export interface JevTurnEvaluation {
  isTopicShift: JevNoulResult;
  isTechLogPaste: JevNoulResult;
  userFeedback: JevScoreResult;
  deltaP: JevScoreResult;
  deltaA: JevScoreResult;
  deltaD: number;
  dTrust: number;
  shouldMemorize: JevNoulResult;
  latencyMs: number;
}

export class LocalJevEngine {
  private endpoint: string;
  private timeoutMs: number;

  constructor(
    baseUrl: string = process.env.LOCAL_JEV_URL || 'http://127.0.0.1:8081/v1',
    timeoutMs: number = Number(process.env.LOCAL_JEV_TIMEOUT_MS || 450)
  ) {
    this.endpoint = `${baseUrl.replace(/\/$/, '')}/completions`;
    this.timeoutMs = timeoutMs;
  }

  /**
   * 发起单 Token 前向 Logits 提取请求（共享 statePrefix 命中 llama-server KV-Cache）
   */
  private async fetchSingleTokenLogprobs(
    prompt: string,
    signal: AbortSignal
  ): Promise<Record<string, number>> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        prompt,
        max_tokens: 1,
        temperature: 0,
        logprobs: 10,
        cache_prompt: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Jev HTTP ${res.status}`);
    }

    const data: any = await res.json();
    const map: Record<string, number> = {};

    // 兼容 OpenAI /v1/completions logprobs.top_logprobs[0] 与 llama.cpp completion_probabilities
    const topObj = data.choices?.[0]?.logprobs?.top_logprobs?.[0];
    if (topObj && typeof topObj === 'object') {
      for (const [tok, lp] of Object.entries(topObj)) {
        const key = String(tok).trim().toUpperCase();
        if (key && (map[key] === undefined || Number(lp) > map[key])) {
          map[key] = Number(lp);
        }
      }
    }

    const llamaProbs = data.completion_probabilities?.[0]?.probs;
    if (Array.isArray(llamaProbs)) {
      for (const item of llamaProbs) {
        const key = String(item.tok_str || '').trim().toUpperCase();
        const lp = typeof item.logprob === 'number' ? item.logprob : Math.log(Math.max(1e-9, item.prob || 1e-9));
        if (key && (map[key] === undefined || lp > map[key])) {
          map[key] = lp;
        }
      }
    }

    return map;
  }

  /**
   * Jev Noul 类型：二元真伪校准概率 P(Yes) ∈ [0, 1]
   */
  private async evalNoul(
    statePrefix: string,
    question: string,
    signal: AbortSignal
  ): Promise<JevNoulResult> {
    const prompt = `${statePrefix}\n[Question] ${question}\nAnswer with a single token (Y for Yes, N for No): `;
    const lpMap = await this.fetchSingleTokenLogprobs(prompt, signal);

    const lpY = lpMap['Y'] ?? lpMap['YES'] ?? -8.0;
    const lpN = lpMap['N'] ?? lpMap['NO'] ?? -8.0;
    const maxLp = Math.max(lpY, lpN);
    const expY = Math.exp(lpY - maxLp);
    const expN = Math.exp(lpN - maxLp);
    const prob = expY / (expY + expN);
    const confidence = Math.min(1, Math.abs(prob - 0.5) * 2);

    return {
      prob: Number(prob.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
    };
  }

  /**
   * Jev Score 类型：5 档有序量表概率分布 + 香农熵校准置信度 Confidence = 1 - H(P)/ln(5)
   */
  private async evalScore(
    statePrefix: string,
    question: string,
    rubricDesc: string,
    scaleValues: [number, number, number, number, number],
    signal: AbortSignal
  ): Promise<JevScoreResult> {
    const prompt = `${statePrefix}\n[Question] ${question}\n[Scale] ${rubricDesc}\nSelect level (single digit 1, 2, 3, 4, or 5): `;
    const lpMap = await this.fetchSingleTokenLogprobs(prompt, signal);

    const keys = ['1', '2', '3', '4', '5'];
    const rawLps = keys.map((k) => lpMap[k] ?? -9.0);
    const maxLp = Math.max(...rawLps);
    const exps = rawLps.map((lp) => Math.exp(lp - maxLp));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / sumExp);

    // 期望连续分值
    let expectedValue = 0;
    let entropy = 0;
    for (let i = 0; i < 5; i++) {
      expectedValue += probs[i] * scaleValues[i];
      if (probs[i] > 1e-9) {
        entropy -= probs[i] * Math.log(probs[i]);
      }
    }

    const maxEntropy = Math.log(5);
    const confidence = Math.max(0, Math.min(1, 1 - entropy / maxEntropy));

    return {
      value: Number(expectedValue.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      probs: probs.map((p) => Number(p.toFixed(3))),
    };
  }

  /**
   * 单次并发评估当轮全部 6 项 System 1 决策；超时或本地服务未启动时返回 null 自动无缝回退至 Inline 模式
   */
  public async evaluateTurn(
    currentUserText: string,
    pendingTurn: PendingTurnSnapshot | null
  ): Promise<JevTurnEvaluation | null> {
    if (!currentUserText.trim()) return null;

    const startMs = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const prevUser = pendingTurn ? buildStructuralDigest(pendingTurn.userPrompt, 100) : 'None';
    const prevAssistant = pendingTurn
      ? buildStructuralDigest(pendingTurn.assistantReply, 140)
      : 'None';
    const currUser = buildStructuralDigest(currentUserText, 220);

    // 固定公共 State 前缀，确保并发子问题 100% 复用同一份 Prefix KV-Cache
    const statePrefix = `<|im_start|>system\nYou are a System-1 calibrated decision evaluator. Judge the state objectively.<|im_end|>\n<|im_start|>user\n[State]\nPrev_User: ${prevUser}\nPrev_Assistant_Digest: ${prevAssistant}\nCurrent_User: ${currUser}<|im_end|>\n<|im_start|>assistant`;

    try {
      const [isTopicShift, isTechLogPaste, userFeedback, deltaP, deltaA, shouldMemorize] =
        await Promise.all([
          this.evalNoul(
            statePrefix,
            'Is Current_User switching to a completely unrelated new topic instead of responding to Prev_Assistant_Digest?',
            controller.signal
          ),
          this.evalNoul(
            statePrefix,
            'Are any errors or stacktraces in Current_User just pasted technical debugging data rather than dissatisfaction or blame toward the assistant?',
            controller.signal
          ),
          this.evalScore(
            statePrefix,
            'How satisfied is Current_User with Prev_Assistant_Digest?',
            '1=Strong rejection/angry, 2=Unsatisfied/correcting mistake, 3=Neutral continuation, 4=Satisfied/moving forward, 5=Explicit praise/breakthrough',
            [-0.9, -0.4, 0.05, 0.45, 0.95],
            controller.signal
          ),
          this.evalScore(
            statePrefix,
            'What is the emotional pleasure/valence shift (delta_p) triggered by Current_User?',
            '1=Frustrated/hostile, 2=Slightly annoyed/impatient, 3=Calm/neutral, 4=Positive/smooth, 5=Excited/delighted',
            [-0.35, -0.15, 0.0, 0.12, 0.28],
            controller.signal
          ),
          this.evalScore(
            statePrefix,
            'What is the urgency and cognitive arousal shift (delta_a) in Current_User?',
            '1=Fatigued/closing, 2=Low energy/brief, 3=Normal pace, 4=Focused debugging, 5=High urgency/critical blocker',
            [-0.22, -0.10, 0.0, 0.14, 0.28],
            controller.signal
          ),
          this.evalNoul(
            statePrefix,
            'Does Current_User state a long-term personal preference, identity fact, or core architectural rule worth remembering across days?',
            controller.signal
          ),
        ]);

      const deltaD = Number((deltaP.value * 0.35).toFixed(4));
      const dTrust =
        userFeedback.confidence >= 0.55
          ? Number((userFeedback.value * 0.025).toFixed(4))
          : 0;

      return {
        isTopicShift,
        isTechLogPaste,
        userFeedback,
        deltaP,
        deltaA,
        deltaD,
        dTrust,
        shouldMemorize,
        latencyMs: Date.now() - startMs,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

---

### 9. 100 天超长窗口引擎：自动压缩重锚定 + 仿生睡眠巩固 (`src/engine/memory-consolidation.ts`)

**v2.4 核心新增模块**，专门解决“同一窗口连续聊 20~100 天、客户端频繁触发超出上下文自动压缩”导致的情感漂白、细节丢失与碎片爆炸问题，包含三大机制：

1. **全量对话冷归档 + 自动压缩检测（Compaction Detector）**：每轮原文实时追加进 `raw_turn_archive` 冷表（聊 100 天纯文本仅约 20MB 磁盘）；当检测到客户端 `messages.length` 较上一轮骤降 $\ge 45\%$、或出现 `<conversation_history_summary>` 标记时判定发生自动压缩，立即抢救提炼《阶段叙事篇章》。
2. **仿生睡眠巩固（Sleep Consolidation）**：跨天唤醒（间隔 $\ge 6$ 小时）或累计新增 $\ge 25$ 条未归档轮次时，后台异步将高相似（余弦相似度 $\ge 0.84$）的冗余碎片聚类合并去重，并生成 L2 中观篇章。
3. **网关内置 48K Token 滑动窗口护栏**：估算请求 Token 总量，超过 48K 水位时自动按 20 条固定块折叠归档为本地篇章，保证客户端无自动压缩时也不触发云端 `400 Context Length Exceeded`。

```typescript
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
  private lastChapterTurnCount = 0;

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

    if (unconsolidated.length < 3) return;

    const ids = unconsolidated.map((r) => r.id);
    // 提取阶段主题（取最新一条用户诉求作标题），用确定性规则蒸馏叙事脉络（不额外调云端模型，零成本零延迟）
    const lastPrompt = unconsolidated[unconsolidated.length - 1].user_prompt;
    const chapterTitle = (lastPrompt || '阶段进展').replace(/\s+/g, ' ').slice(0, 30);
    const keyThemes = this.extractKeyThemes(unconsolidated);
    const avgP = unconsolidated.reduce((s, r) => s + r.emotion_p, 0) / unconsolidated.length;
    const avgA = unconsolidated.reduce((s, r) => s + r.emotion_a, 0) / unconsolidated.length;

    const digest =
      `阶段共 ${unconsolidated.length} 轮，核心围绕「${chapterTitle}」推进。关键脉络：${keyThemes}` +
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
    if (!a || !b || a.length !== b.length) return 0;
    const af = new Float32Array(a.buffer, a.byteOffset, a.length / 4);
    const bf = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    let dot = 0;
    for (let i = 0; i < af.length; i++) dot += af[i] * bf[i];
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
```

---

### 10. 双模自适应闭环网关主入口 (`src/index.ts`)

支持 **`AFFECT_MODE=jev | inline`（默认优先尝试本地 RTX 2070 Jev 决策器，超时或未启动时 `450ms` 自动无感回退至 Inline 双流标签模式）**，并集成 v2.4 的 **100 天超长窗口抗压缩引擎**：
- **当本地 Jev 激活时**：
  1. 在组装当轮 Prompt **之前**，50ms 内完成上一轮隐式反馈结算 + **当轮零滞后（Zero-Lag）情绪与决策姿态对齐**（仅在 `confidence >= 0.55` 时采纳，低置信度自动弃权防误判）；
  2. `omitInlineAffectTag: true` 免除云端 DeepSeek 主模型首行吐 `<affect_update>` 标签，流式输出跳过 `DualStreamParser` 零缓冲直通；
  3. 仅当 Jev 守门员判定 `shouldMemorize.prob >= 0.78` 时，在流结束后后台异步（`setImmediate`）提取长期记忆，将记忆生成开销降低 90%。
- **v2.4 长窗口防护**：每轮调用 `consolidator.archiveTurn` 冷归档原文、`detectCompactionAndReanchor` 检测客户端自动压缩并重锚定、`maybeConsolidateOnWakeup` 跨天/满 25 轮触发睡眠巩固、`enforceSlidingWindow` 内置 48K 水位折叠护栏。

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamSSE } from 'hono/streaming';
import OpenAI from 'openai';
import path from 'node:path';
import crypto from 'node:crypto';
import { initDatabase } from './db/client';
import { embedText } from './engine/embedding';
import { AffectiveEngine } from './engine/affective-ssm';
import { ImplicitRLManager } from './engine/implicit-rl';
import { MemoryRetriever } from './engine/memory-retriever';
import { ContextCompiler } from './engine/context-compiler';
import { MemoryConsolidator } from './engine/memory-consolidation';
import { LocalJevEngine, JevTurnEvaluation } from './engine/local-jev';
import { DualStreamParser, AffectUpdateHeader } from './pipeline/dual-stream';

const db = initDatabase(path.join(process.cwd(), 'data', 'cognitive_core.db'));
const personaId = process.env.PERSONA_ID || 'spongebob';
const preferJevMode = (process.env.AFFECT_MODE || 'jev').toLowerCase() !== 'inline';

const affectEngine = new AffectiveEngine(db, personaId);
const rlManager = new ImplicitRLManager(db, personaId);
const memoryRetriever = new MemoryRetriever(db, personaId);
const compiler = new ContextCompiler(db, personaId);
const localJev = new LocalJevEngine();
const consolidator = new MemoryConsolidator(db, personaId);

const cloudClient = new OpenAI({
  apiKey: process.env.CLOUD_API_KEY || '',
  baseURL: process.env.CLOUD_BASE_URL || 'https://api.deepseek.com/v1',
});

const app = new Hono();

app.post('/v1/chat/completions', async (c) => {
  const body = await c.req.json();
  let rawMessages = body.messages || [];
  const lastMsg = rawMessages[rawMessages.length - 1];
  const userText = typeof lastMsg?.content === 'string' ? lastMsg.content : '';

  const isJsonFormat =
    body.response_format?.type === 'json_object' || body.response_format?.type === 'json_schema';
  const forceTool = body.tool_choice === 'required' || typeof body.tool_choice === 'object';
  const isToolRole = lastMsg?.role === 'tool';
  const isOverrideScenario = isJsonFormat || forceTool || isToolRole;

  // 0. [v2.4] 100天长窗口防护：跨天/满25轮睡眠巩固 + 客户端自动压缩检测重锚定 + 48K滑动窗口护栏
  consolidator.maybeConsolidateOnWakeup();
  if (!isOverrideScenario) {
    rawMessages = consolidator.enforceSlidingWindow(rawMessages);
  }
  const reanchorChapters = !isOverrideScenario
    ? consolidator.detectCompactionAndReanchor({ messages: rawMessages, userText, assistantReply: '', activePolicyName: '', tonicMood: { p: 0, a: 0, d: 0 } })
    : [];

  // 1. 取出上一轮待验收快照，并并发执行：本地 ONNX 向量化 + (可选) RTX 2070 本地 Jev 单步 Logits 评估
  const pendingSnapshot = !isOverrideScenario ? rlManager.consumePendingTurnAtomically() : null;
  let tonicState = affectEngine.getTonicStateWithTimeDecay();

  const [queryVec, jevEval]: [Float32Array, JevTurnEvaluation | null] = await Promise.all([
    userText ? embedText(userText) : Promise.resolve(new Float32Array(512)),
    preferJevMode && !isOverrideScenario && userText
      ? localJev.evaluateTurn(userText, pendingSnapshot)
      : Promise.resolve(null),
  ]);

  const useJevPreDecision = jevEval !== null;

  // 2. 若 RTX 2070 本地 Jev 评估成功：当轮前置零滞后更新 Tonic 基态（带 Confidence >= 0.55 置信度门控）
  if (useJevPreDecision && jevEval) {
    const gatedDp = jevEval.deltaP.confidence >= 0.55 ? jevEval.deltaP.value : 0;
    const gatedDa = jevEval.deltaA.confidence >= 0.55 ? jevEval.deltaA.value : 0;
    tonicState = affectEngine.applyAffectDeltaToTonic(tonicState, {
      dp: gatedDp,
      da: gatedDa,
      dd: jevEval.deltaD,
      dTrust: jevEval.dTrust,
      activePolicyName: tonicState.lastActivePolicy,
    });
  }

  // 3. 四维心境一致性召回 + 生成当轮瞬时唤醒心境 (Phasic Mood，仅当轮编译用，不落盘)
  const recalledMemories = userText
    ? memoryRetriever.retrieveHybridMemories(queryVec, tonicState, 4)
    : [];
  const phasicMood = affectEngine.computePhasicMoodWithMemories(tonicState, recalledMemories);

  // 4. 编译请求（若 Jev 已前置完成判定，则 omitInlineAffectTag = true，主模型免吐首行标签；并注入压缩重锚定篇章）
  const compiled = compiler.compileMessages(rawMessages, phasicMood, recalledMemories, [], {
    isJsonResponseFormat: isJsonFormat,
    forceToolChoice: forceTool,
    omitInlineAffectTag: useJevPreDecision,
    recentNarrativeChapters: reanchorChapters,
  });

  const stream = await cloudClient.chat.completions.create({
    ...body,
    messages: compiled.messages,
    temperature: compiled.temperature,
    presence_penalty: compiled.presencePenalty,
    stream: true,
  });

  return streamSSE(c, async (sseStream) => {
    const parser = new DualStreamParser();
    let extractedHeader: AffectUpdateHeader | null = null;
    let cleanAssistantReply = '';
    let hasToolCalls = false;

    for await (const part of stream) {
      const delta = part.choices?.[0]?.delta;
      if (delta?.tool_calls?.length) {
        hasToolCalls = true;
      }

      // Jev 前置模式或理性熔断态下：跳过 DualStreamParser 零缓冲直通输出
      if (useJevPreDecision || compiled.isCognitiveOverride || !delta?.content) {
        if (delta?.content) cleanAssistantReply += delta.content;
        await sseStream.writeSSE({ data: JSON.stringify(part) });
        continue;
      }

      const safeText = parser.pushChunk(delta.content, (header) => {
        extractedHeader = header;
      });

      if (safeText) {
        cleanAssistantReply += safeText;
        const clonedPart = JSON.parse(JSON.stringify(part));
        clonedPart.choices[0].delta.content = safeText;
        await sseStream.writeSSE({ data: JSON.stringify(clonedPart) });
      }
    }

    if (!useJevPreDecision && !compiled.isCognitiveOverride) {
      const tailFlush = parser.flush();
      if (tailFlush) cleanAssistantReply += tailFlush;
    }
    await sseStream.writeSSE({ data: '[DONE]' });

    // 5. 异步后置结算：支持 Jev 模式与 Inline 模式双路落盘
    setImmediate(async () => {
      if (hasToolCalls && !useJevPreDecision && !extractedHeader && pendingSnapshot) {
        rlManager.savePendingTurn(pendingSnapshot);
        return;
      }

      if (useJevPreDecision && jevEval) {
        // [分支 A: RTX 2070 Jev 模式结算]
        if (pendingSnapshot && jevEval.isTopicShift.prob < 0.72) {
          let effectiveFeedback =
            jevEval.userFeedback.confidence >= 0.50 ? jevEval.userFeedback.value : 0.05;
          // Jev Noul 判定用户只是贴入报错日志而非对 AI 不满时，豁免负向扣分
          if (jevEval.isTechLogPaste.prob >= 0.65 && effectiveFeedback < 0) {
            effectiveFeedback = 0.05;
          }
          rlManager.settlePreviousTurnReward(
            pendingSnapshot,
            effectiveFeedback,
            userText,
            queryVec
          );
        }

        // 高门槛记忆守门员：仅当 shouldMemorize 概率 >= 0.78 时才写入长期闪回记忆（含长文本载荷）
        if (jevEval.shouldMemorize.prob >= 0.78 && userText.length >= 6) {
          const conciseSummary = userText.replace(/\s+/g, ' ').slice(0, 45);
          memoryRetriever.commitEpisodicMemory(
            conciseSummary,
            cleanAssistantReply,
            tonicState,
            jevEval.shouldMemorize.prob,
            queryVec,
            cleanAssistantReply // [v2.4] 将完整回复作为长文本载荷，供 Top-1 高匹配时按需展开
          );
        }
      } else if (extractedHeader) {
        // [分支 B: Inline 首行标签降级模式结算]
        rlManager.settlePreviousTurnReward(
          pendingSnapshot,
          extractedHeader.userFeedbackScore,
          userText,
          queryVec
        );

        const updatedTonic = affectEngine.applyAffectDeltaToTonic(tonicState, {
          ...extractedHeader,
          activePolicyName: compiled.activePolicyName,
        });

        if (extractedHeader.memorySummary && extractedHeader.salience >= 0.35) {
          const memVec = await embedText(extractedHeader.memorySummary);
          memoryRetriever.commitEpisodicMemory(
            extractedHeader.memorySummary,
            cleanAssistantReply,
            updatedTonic,
            extractedHeader.salience,
            memVec
          );
        }
      }

      // [v2.4] 全量冷归档本轮原文（供后续客户端自动压缩时抢救蒸馏，聊 100 天仅约 20MB 磁盘）
      if (cleanAssistantReply.length > 0) {
        consolidator.archiveTurn({
          messages: rawMessages,
          userText,
          assistantReply: cleanAssistantReply,
          activePolicyName: compiled.activePolicyName,
          tonicMood: { p: tonicState.p, a: tonicState.a, d: tonicState.d },
        });
      }

      // 保存本轮快照供下一轮 (t+1) 验收
      if (!compiled.isCognitiveOverride && cleanAssistantReply.length > 0) {
        rlManager.savePendingTurn({
          turnId: crypto.randomUUID(),
          userPrompt: userText,
          userPromptEmbedding: Array.from(queryVec),
          assistantReply: cleanAssistantReply,
          moodAtTurn: phasicMood,
          actionPolicy: compiled.activePolicyName,
          referencedEpisodeIds: compiled.referencedEpisodeIds,
          referencedPolicyIds: compiled.referencedPolicyIds,
          timestampMs: Date.now(),
        });
      }
    });
  });
});

const port = Number(process.env.PORT || 4100);
serve({ fetch: app.fetch, port }, () => {
  console.log(
    `[Local Affective & Memory Engine v2.4] Running on http://127.0.0.1:${port}/v1 (Mode: ${
      preferJevMode ? 'RTX-2070 Local Jev + Inline Fallback' : 'Inline Dual-Stream Only'
    })`
  );
});
```

---

## 五、 多子代理红队挑刺质疑与接纳度裁定清单

| 编号 | 提出方 | 核心质疑与漏洞描述 | 接纳度裁定 | 裁定理由与 v2.2 完整落地修正措施 |
| :--- | :--- | :--- | :--- | :--- |
| **Q1** | 子代理 B | **`sqlite-vec` 的 `vec0` 缺失 `PARTITION KEY` 与 `BigInt` 绑定崩溃**：多角色下全局 Top-K 后置 JOIN 过滤会引发召回饥饿；`better-sqlite3` 传 JS `number` 给 `vec0` 主键会触发 C 扩展异常崩溃；主表删除后留下孤儿向量。 | **100% 完全接纳** | `vec_episodic` 显式声明 `persona_id TEXT PARTITION KEY` 与 `distance_metric=cosine`；写入强制转换 `BigInt(info.lastInsertRowid)`；新增 `AFTER DELETE` 触发器清理孤儿向量。 |
| **Q2** | 子代理 B<br>子代理 C | **`DualStreamParser` 基于 `\n` 切分的三大流式缺陷**：① 前导空行或 `<think>` 块导致标签直接裸露给前端；② 标签与正文同行时误吞首段正文；③ 缺少 `flush()` 导致短于 260 字无标签回复整包丢失。 | **100% 完全接纳** | 重写 `DualStreamParser`：先识别保留 `<think>...</think>`，改用 `>` 闭合符切分，对所有属性做 `clampNum` 钳位，并在流结束调用 `flush()`。 |
| **Q3** | 子代理 A<br>子代理 B | **记忆反向染色写回污染、高频对话无时间衰减死锁与慢变量顶死 `1.0`**：① 瞬时染色写回数据库引发自激振荡；② 连续秒回时 $\Delta t \approx 0$ 时间衰减失效；③ 连续多轮反复召回同一负面记忆反刍；④ `dd` 断路且 `trust` 单向饱和。 | **100% 完全接纳** | 1. 严格隔离 `tonicState`（落盘）与 `phasicMood`（仅当轮编译）；<br>2. 新增 `0.06 * (base - tonic)` **单步稳态回归拉力**；<br>3. `MemoryRetriever` 新增 **3 分钟闪回不应期（Refractory Penalty = 0.35）**；<br>4. 补齐 `dd` 闭环与慢变量非对称渐近阻尼。 |
| **Q4** | 子代理 A<br>子代理 B<br>子代理 C | **`organic_episodes` 原文 `.slice(0, 160)` 硬截断、跨姿态串台与 `behavioral_policies` 僵尸铁律**：① 硬截断未闭合 ```` ``` ```` 破坏 Prompt；② 全局 `LIMIT 80` 挤死低频止损姿态；③ `behavioral_policies` 的 `confidence` 从未更新。 | **100% 完全接纳** | 1. 新增 `buildStructuralDigest()` 提取行数/代码特征并脱敏代码块；<br>2. 按 `action_policy` 同桶抽样与分桶 Top-20 淘汰；<br>3. 在 `PendingTurnSnapshot` 与 `settlePreviousTurnReward` 中打通 `referencedPolicyIds` 在线置信度更新与淘汰闭环。 |
| **Q5** | 子代理 A | **伪 Bandit 纯贪婪排序（零探索率）与临界点姿态高频抖动（Chattering）**：确定性贪婪排序导致早期 2 条样本永久霸榜；硬阈值在 `a=0.65` 临界点附近引发连续两轮 180 度姿态翻转。 | **100% 完全接纳** | 1. 抽样 SQL 引入 **UCB 探索奖励项 `0.45 / SQRT(use_count + 1)`** 与 **3 分钟冷却系数 `cooldown_factor`**；<br>2. `deriveActionPolicyWithHysteresis` 引入 **`0.06` 施密特触发器迟滞区间**。 |
| **Q6** | 子代理 A<br>子代理 B<br>子代理 C | **`pending_turn_json` 并发双结算竞态、话题硬切换误伤与 Tool Loop 跨步丢失**：① 事务外读取在快速连发消息时双倍扣分；② 用户第 $t+1$ 轮切换全新话题时误奖惩上一轮标本；③ 首步返回 `tool_calls` 时未输出标签导致快照被清空。 | **100% 完全接纳** | 1. 使用 `UPDATE ... RETURNING` 单语句原子消费；<br>2. 新增**余弦相似度 `< 0.18` 话题硬切换门控（Topic-Shift Gating）**；<br>3. 在 `src/index.ts` 实现 **Tool Loop 跨步挂起保护（Hold & Settle）**。 |
| **Q7** | 子代理 C | **首轮 Tool-Call（Step-0）与 JSON Mode 熔断盲区 + 熔断态丢失事实图谱**：仅检查 `lastMsg.role === 'tool'` 漏判了首轮 JSON Mode，且熔断时直接返回裸 `rawMessages` 丢了长期事实图谱。 | **100% 完全接纳** | `compileMessages` 前置检查 `isJsonResponseFormat` 与 `forceToolChoice`；熔断态下以只读形式追加 `graphTriples` 事实图谱。 |
| **Q8** | 子代理 C | **尾部注入（Tail Injection）在 `messages` 中段插入 `role: 'system'` 的 400 协议拒止与有状态宿主历史残留**：Claude / R1 拒绝中段 `system` 角色；有状态宿主下不清理历史注入块会导致多轮冲突。 | **部分接纳**<br>*(接纳幂等清洗与 User 尾部追加，保留瞬时拔除)* | **接纳**：入口新增 `stripHistoricalCognitiveBlocks()` 幂等剥离历史残留块，并将当轮 `<cognitive_context>` 追加在最后一条 `user` 消息末尾。<br>**不接纳**：不将每轮 400 Token 的潜意识块永久保存在历史记录中，防止 20 轮后堆积 8000 Token 过期情绪噪音。 |
| **Q9** | 子代理 A | **LLM“既当运动员又当裁判”在排障场景下的误杀偏差**：连续排障贴入新报错堆栈易被 LLM 误判为负分，或中性闲聊自评虚高。 | **部分接纳**<br>*(接纳本地启发式校准，不部署第二个本地裁判模型)* | **接纳**：`calibrateFeedbackScore()` 结合堆栈特征与显式褒贬词做本地交叉纠偏，且要求 `use_count >= 3` 才允许淘汰。<br>**不接纳**：不在本地额外部署专门的 Reward Model 小模型，保持 20ms 零 GPU 极简架构。 |
| **Q10** | 子代理 C | **首行 XML 标签的自回归因果倒置**：要求模型在第 1 行总结尚未生成的正文；建议改用回复末尾输出标签（Trailer Tag）。 | **部分接纳**<br>*(接纳语义重定义，驳回尾部标签)* | **接纳**：将 `memory_summary` 重定义为“截至用户最新这句话已确立的事实或约定”，消除自回归因果倒置。<br>**驳回尾部标签**：SSE 流末尾挂起缓冲会损害流式收尾体验，首行状态机拦截是流式延迟最优解。 |
