# 本地记忆与情感神经伴生引擎（Node.js + 云端大模型）架构与搭建方案

> **设计目标**：在本地构建“海马体（超长程关联记忆）+ 杏仁核（连续情感动力学与潜意识编译）”，将云端大模型 API 作为无状态的“新皮层语言渲染器”。通过**动态语气锚点抽样（Few-Shot Steering）**、**第一人称潜意识独白编译**与**单次请求双流反馈**，在不微调云端模型的前提下，实现超越上下文窗口的长期记忆与高拟真情感演化。

---

## 一、 技术选型（Windows 本地零 GPU 依赖）

| 模块层级 | 核心依赖包 | 选型理由与性能指标 |
| :--- | :--- | :--- |
| **运行时与语言** | `Node.js >= 20` + `TypeScript` (`tsx`) | 原生支持高性能异步流处理与强类型状态机建模 |
| **本地统一存储** | `better-sqlite3` + `sqlite-vec` | 单一 `.db` 文件同时承载关系表、图谱三元组与 Float32 向量索引；同步 C++ 绑定，单次检索耗时 `< 5ms` |
| **本地语义嵌入** | `@huggingface/transformers` (ONNX) | 本地 CPU 运行 `Xenova/bge-small-zh-v1.5`（512 维向量），内存占用约 `180MB`，单句推理 `< 12ms`，无需调用云端 Embedding |
| **云端 API 客户端** | `openai` (Node SDK) | 兼容 DeepSeek、Claude (通过 OpenRouter/OneAPI)、Qwen、GPT 等所有 OpenAI 协议接口 |
| **本地服务网关** | `hono` 或 `fastify` | 可封装为标准 `/v1/chat/completions` 本地透明代理（Proxy），无缝对接任意前端聊天界面 |

---

## 二、 工程目录结构

```text
local-affective-engine/
├── package.json
├── tsconfig.json
├── data/
│   ├── cognitive_core.db          # SQLite + sqlite-vec 本地单文件数据库
│   └── seed_anchors.json          # 角色各情绪象限的语气锚点种子库
└── src/
    ├── index.ts                   # 本地网关入口 (Hono / Fastify 服务)
    ├── types.ts                   # PAD 情感向量、记忆条目与编译载荷类型定义
    ├── db/
    │   ├── client.ts              # better-sqlite3 初始化与 sqlite-vec 加载
    │   └── schema.sql             # 五张核心本地表结构定义
    ├── engine/
    │   ├── embedding.ts           # Transformers.js 本地 ONNX 向量化封装
    │   ├── affective-ssm.ts       # 连续情感状态空间：时间稳态衰减、刺激更新与阻尼防呆
    │   ├── memory-retriever.ts    # 四维混合召回：语义 + 心境共鸣 + 重要度 + 遗忘半衰期
    │   └── context-compiler.ts    # 心境编译器：抽样 Few-Shot、合成潜意识独白、调制 API 超参
    └── pipeline/
        ├── dual-stream.ts         # 云端 SSE 流式拦截器：剥离 <affect_update> 标签与正文分流
        └── sleep-consolidator.ts  # 闲时/后台记忆固化：碎片对话压缩为叙事弧与关系图谱
```

---

## 三、 本地数据库 Schema 设计 (`src/db/schema.sql`)

```sql
-- 1. 连续情感状态机与关系账本表（单角色单行，或多角色按 persona_id 区分）
CREATE TABLE IF NOT EXISTS affective_state (
    persona_id TEXT PRIMARY KEY,
    -- 快变量：当前 PAD 瞬时情绪向量
    p_pleasure REAL NOT NULL DEFAULT 0.2,    -- 愉悦度 [-1.0, 1.0]
    a_arousal REAL NOT NULL DEFAULT 0.3,     -- 唤醒度/专注度 [0.0, 1.0]
    d_dominance REAL NOT NULL DEFAULT 0.1,   -- 掌控度/自信度 [-1.0, 1.0]
    -- 性格稳态基线（情绪随时间自然回落的锚点）
    base_p REAL NOT NULL DEFAULT 0.2,
    base_a REAL NOT NULL DEFAULT 0.3,
    base_d REAL NOT NULL DEFAULT 0.1,
    decay_lambda REAL NOT NULL DEFAULT 0.25, -- 每小时情绪衰减率
    -- 慢变量：长期关系账本
    intimacy REAL NOT NULL DEFAULT 0.5,      -- 亲密度/熟稔度 [0.0, 1.0]
    trust REAL NOT NULL DEFAULT 0.6,         -- 信任度 [0.0, 1.0]
    rapport_notes TEXT DEFAULT '',           -- 长期相处默契与雷区摘要
    last_updated_ms INTEGER NOT NULL         -- 上次状态更新的 Unix 毫秒时间戳
);

-- 2. 情绪象限语气锚点表（用于替代干瘪的形容词指令，做 Few-Shot 分布引导）
CREATE TABLE IF NOT EXISTS style_anchors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    target_p REAL NOT NULL,                  -- 适用愉悦度坐标 [-1.0, 1.0]
    target_a REAL NOT NULL,                  -- 适用唤醒度坐标 [0.0, 1.0]
    min_intimacy REAL NOT NULL DEFAULT 0.0,  -- 解锁该语气所需的最低亲密度
    situation_tag TEXT NOT NULL,             -- 场景标签：如 "深夜劝休"、"高压排障"、"日常调侃"
    sample_user_input TEXT NOT NULL,         -- 示例用户输入
    sample_inner_thought TEXT NOT NULL,      -- 示例潜意识独白
    sample_response TEXT NOT NULL            -- 示例高拟真角色台词
);

-- 3. 情景闪回记忆主表（带情感坐标戳）
CREATE TABLE IF NOT EXISTS episodic_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    summary TEXT NOT NULL,                   -- 事件凝练摘要
    verbatim_quote TEXT DEFAULT '',          -- 关键原话/金句快照
    emotion_p REAL NOT NULL,                 -- 记忆形成时的愉悦度
    emotion_a REAL NOT NULL,                 -- 记忆形成时的唤醒度
    emotion_d REAL NOT NULL,                 -- 记忆形成时的掌控度
    salience REAL NOT NULL DEFAULT 0.5,      -- 情感冲击与重要度 [0.0, 1.0]，决定遗忘半衰期
    access_count INTEGER NOT NULL DEFAULT 0, -- 被唤醒次数（每唤醒一次强化一次记忆）
    created_at_ms INTEGER NOT NULL,
    last_accessed_ms INTEGER NOT NULL
);

-- 情景记忆语义向量虚拟表（sqlite-vec 512 维，对应 bge-small-zh-v1.5）
CREATE VIRTUAL TABLE IF NOT EXISTS vec_episodic USING vec0(
    memory_id INTEGER PRIMARY KEY,
    embedding FLOAT[512]
);

-- 4. 实体关系与共同认知图谱表
CREATE TABLE IF NOT EXISTS relational_graph (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    subject TEXT NOT NULL,                   -- 主体（如 "派大星"、"点云项目"）
    predicate TEXT NOT NULL,                 -- 关系/态度（如 "核心痛点"、"饮食禁忌"、"专属梗"）
    object TEXT NOT NULL,                    -- 客体内容
    emotional_valence REAL DEFAULT 0.0,      -- 对该实体的情感倾向 [-1.0, 1.0]
    confidence REAL DEFAULT 1.0,
    updated_at_ms INTEGER NOT NULL,
    UNIQUE(persona_id, subject, predicate, object)
);

-- 5. 长期叙事弧时间线（保持跨周/跨月的时间连续感）
CREATE TABLE IF NOT EXISTS narrative_arcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id TEXT NOT NULL,
    period_label TEXT NOT NULL,              -- 如 "2026-11 第一周"
    arc_summary TEXT NOT NULL,               -- 阶段主线摘要（如 "正在密集攻坚某物联网与三维项目，整体节奏紧绷"）
    is_active INTEGER NOT NULL DEFAULT 1,    -- 1=当前活跃背景，0=历史归档
    created_at_ms INTEGER NOT NULL
);
```

---

## 四、 核心模块代码实现

### 1. 连续情感动力学引擎 (`src/engine/affective-ssm.ts`)

实现**真实物理时间稳态回落**、**记忆反向唤醒染色**以及**双流增量更新**：

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
   * 1. 读取并结算真实时间流逝带来的稳态回落 (Homeostatic Decay)
   * 公式: E(t + Δt) = E_0 + (E(t) - E_0) * exp(-λ * Δt_hours)
   */
  public getCurrentStateWithTimeDecay(nowMs: number = Date.now()): PADState {
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

    const currentP = clamp(row.base_p + (row.p_pleasure - row.base_p) * decayFactor, -0.95, 0.95);
    const currentA = clamp(row.base_a + (row.a_arousal - row.base_a) * decayFactor, 0.05, 0.95);
    const currentD = clamp(row.base_d + (row.d_dominance - row.base_d) * decayFactor, -0.95, 0.95);

    return {
      p: Number(currentP.toFixed(3)),
      a: Number(currentA.toFixed(3)),
      d: Number(currentD.toFixed(3)),
      intimacy: row.intimacy,
      trust: row.trust,
    };
  }

  /**
   * 2. 记忆反向唤醒：当检索出高冲击力旧记忆时，旧记忆的情感戳会微调当前心境
   */
  public blendWithRecalledMemories(
    state: PADState,
    memories: Array<{ emotion_p: number; emotion_a: number; salience: number }>
  ): PADState {
    if (memories.length === 0) return state;

    // 仅取冲击力最高的前2条记忆产生情感共鸣偏移（耦合系数 0.18）
    const top = memories.slice(0, 2);
    let shiftP = 0;
    let shiftA = 0;
    for (const m of top) {
      shiftP += (m.emotion_p - state.p) * m.salience * 0.18;
      shiftA += (m.emotion_a - state.a) * m.salience * 0.18;
    }

    return {
      ...state,
      p: clamp(Number((state.p + shiftP).toFixed(3)), -0.95, 0.95),
      a: clamp(Number((state.a + shiftA).toFixed(3)), 0.05, 0.95),
    };
  }

  /**
   * 3. 接收云端双流返回的 <affect_update> 增量并持久化落盘
   * 使用 tanh 阻尼防止连续极端对话导致情绪锁死
   */
  public applyAffectDelta(
    currentState: PADState,
    delta: { dp: number; da: number; dd?: number; dTrust?: number; dIntimacy?: number },
    nowMs: number = Date.now()
  ): PADState {
    const nextP = clamp(currentState.p + Math.tanh(delta.dp) * 0.35, -0.95, 0.95);
    const nextA = clamp(currentState.a + Math.tanh(delta.da) * 0.35, 0.05, 0.95);
    const nextD = clamp(currentState.d + Math.tanh(delta.dd ?? 0) * 0.25, -0.95, 0.95);
    // 慢变量单次漂移步长极小，体现长期日积月累
    const nextTrust = clamp(currentState.trust + (delta.dTrust ?? 0) * 0.05, 0.0, 1.0);
    const nextIntimacy = clamp(currentState.intimacy + (delta.dIntimacy ?? 0) * 0.05, 0.0, 1.0);

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

### 2. 四维心境一致性混合检索器 (`src/engine/memory-retriever.ts`)

解决传统 RAG 只能死板搜字面关键词的问题，把**语义相似度 + 心境共鸣度 + 情感重要度 + 艾宾浩斯遗忘半衰期**融合成统一排序公式：

```typescript
import Database from 'better-sqlite3';
import { PADState } from './affective-ssm';

export interface RecalledMemory {
  id: number;
  summary: string;
  verbatim_quote: string;
  emotion_p: number;
  emotion_a: number;
  salience: number;
  final_score: number;
}

export class MemoryRetriever {
  constructor(private db: Database.Database, private personaId: string = 'default') {}

  public retrieveHybridMemories(
    queryEmbedding: Float32Array,
    currentMood: PADState,
    topK: number = 4
  ): RecalledMemory[] {
    // 1. 先从 sqlite-vec 召回语义最接近的前 20 条候选集
    const candidates = this.db
      .prepare(
        `SELECT
           m.id, m.summary, m.verbatim_quote,
           m.emotion_p, m.emotion_a, m.emotion_d,
           m.salience, m.access_count, m.created_at_ms,
           v.distance AS vec_distance
         FROM vec_episodic v
         JOIN episodic_memories m ON m.id = v.memory_id
         WHERE v.embedding MATCH ? AND k = 20 AND m.persona_id = ?`
      )
      .all(Buffer.from(queryEmbedding.buffer), this.personaId) as any[];

    const nowMs = Date.now();

    // 2. 四维重排打分:
    // Score = 0.50 * SemanticSim + 0.20 * MoodCongruence + 0.20 * Salience + 0.10 * RetentionDecay
    const scored = candidates.map((c) => {
      const semanticSim = Math.max(0, 1 - c.vec_distance);

      // 心境一致性：当前 PAD 与记忆当时 PAD 的空间接近度
      const moodDist = Math.sqrt(
        Math.pow(currentMood.p - c.emotion_p, 2) + Math.pow(currentMood.a - c.emotion_a, 2)
      );
      const moodCongruence = Math.max(0, 1 - moodDist / 2.2);

      // 情感调制遗忘曲线：salience 越高、被唤醒次数越多，半衰期越长
      const ageDays = Math.max(0, (nowMs - c.created_at_ms) / (1000 * 3600 * 24));
      const effectiveHalfLifeDays = 7 * (1 + c.salience * 8 + Math.log1p(c.access_count) * 2);
      const retention = Math.exp(-ageDays / effectiveHalfLifeDays);

      const finalScore =
        0.50 * semanticSim +
        0.20 * moodCongruence +
        0.20 * c.salience +
        0.10 * retention;

      return {
        id: c.id,
        summary: c.summary,
        verbatim_quote: c.verbatim_quote,
        emotion_p: c.emotion_p,
        emotion_a: c.emotion_a,
        salience: c.salience,
        final_score: Number(finalScore.toFixed(4)),
      };
    });

    scored.sort((a, b) => b.final_score - a.final_score);
    const selected = scored.slice(0, topK);

    // 3. 更新被命中记忆的访问计数（记忆提取强化效应）
    if (selected.length > 0) {
      const updateStmt = this.db.prepare(
        'UPDATE episodic_memories SET access_count = access_count + 1, last_accessed_ms = ? WHERE id = ?'
      );
      for (const item of selected) {
        updateStmt.run(nowMs, item.id);
      }
    }

    return selected;
  }
}
```

---

### 3. 本地心境与潜意识编译器 (`src/engine/context-compiler.ts`)

将本地的连续状态张量转化为云端黑盒模型最容易吸收的**动态 Few-Shot 语气样本 + 第一人称潜意识独白 + 动态采样超参**：

```typescript
import Database from 'better-sqlite3';
import { PADState } from './affective-ssm';
import { RecalledMemory } from './memory-retriever';

export interface CompiledCloudPayload {
  systemPrompt: string;
  temperature: number;
  presencePenalty: number;
}

export class ContextCompiler {
  constructor(private db: Database.Database, private personaId: string = 'default') {}

  /**
   * 从本地感情库中按欧氏距离抽样最接近当前 (P, A) 且符合亲密度门槛的 2 条台词锚点
   */
  private sampleStyleAnchors(mood: PADState, limit: number = 2) {
    return this.db
      .prepare(
        `SELECT situation_tag, sample_user_input, sample_inner_thought, sample_response,
                ((target_p - ?) * (target_p - ?) + (target_a - ?) * (target_a - ?)) AS dist_sq
         FROM style_anchors
         WHERE persona_id = ? AND min_intimacy <= ?
         ORDER BY dist_sq ASC
         LIMIT ?`
      )
      .all(mood.p, mood.p, mood.a, mood.a, this.personaId, mood.intimacy, limit) as any[];
  }

  /**
   * 根据 PAD 向量映射自然语言生理/句法约束与 API 超参
   */
  private deriveLinguisticModulation(mood: PADState) {
    // 唤醒度决定温度与节奏，愉悦度决定句式温度
    const temperature = Number((0.55 + mood.a * 0.35).toFixed(2));
    const presencePenalty = Number((mood.a > 0.6 ? 0.3 : 0.1).toFixed(2));

    let rhythmDirective = '语速平稳自然，长短句交替。';
    if (mood.a > 0.7 && mood.p < 0) {
      rhythmDirective = '当前处于紧绷/急切状态：单句字数严格控制在15字以内，省略一切寒暄客套，直击问题核心。';
    } else if (mood.a > 0.7 && mood.p >= 0) {
      rhythmDirective = '当前思维高度活跃：反应敏捷，句式干脆利落，可适当带一点熟人间的轻快调侃。';
    } else if (mood.a < 0.35 && mood.p < 0) {
      rhythmDirective = '当前能量偏低或略带无奈：放缓节奏，话不多但说到点上，减少感叹号，允许短暂停顿。';
    }

    return { temperature, presencePenalty, rhythmDirective };
  }

  public compile(
    basePersonaPrompt: string,
    mood: PADState,
    memories: RecalledMemory[],
    activeArcs: string[],
    graphTriples: string[]
  ): CompiledCloudPayload {
    const anchors = this.sampleStyleAnchors(mood, 2);
    const { temperature, presencePenalty, rhythmDirective } = this.deriveLinguisticModulation(mood);

    const memoryFlashbacks =
      memories.length > 0
        ? memories
            .map(
              (m, idx) =>
                `  ${idx + 1}. [闪回记忆 | 冲击度:${m.salience}] ${m.summary}${
                  m.verbatim_quote ? ` (当时原话: "${m.verbatim_quote}")` : ''
                }`
            )
            .join('\n')
        : '  （当前无特定历史闪回）';

    const styleFewShots = anchors
      .map(
        (a) =>
          `  - 场景[${a.situation_tag}] 用户说: "${a.sample_user_input}"\n` +
          `    你的潜意识: "${a.sample_inner_thought}"\n` +
          `    你的自然表达: "${a.sample_response}"`
      )
      .join('\n');

    const systemPrompt = `${basePersonaPrompt}

## 长期共同背景与关系认知
- 当前阶段主线：${activeArcs.join('；') || '日常协作与陪伴'}
- 关键关系图谱：${graphTriples.join('；') || '高度信任的默契搭档'}
- 关系熟稔度：${(mood.intimacy * 100).toFixed(0)}% | 信任度：${(mood.trust * 100).toFixed(0)}%

## 脑海中被唤醒的过往闪回（自然融入潜台词，切勿生硬背诵）
${memoryFlashbacks}

## 此刻你的潜意识心境与表达节律（严禁直接向用户报出数值）
- 潜意识心境坐标：愉悦度=${mood.p}，唤醒度=${mood.a}，掌控感=${mood.d}
- 生理与句法节律：${rhythmDirective}
- 契合当前心境的语气参考样本（请对齐其分寸感与呼吸节奏，不要照抄字句）：
${styleFewShots}

## 双流输出协议（必须严格遵守）
在每次回复的第一行，先根据用户这句话对你的情绪触动，输出一行隐藏的 XML 状态更新标签，随后换行输出你的正式回复正文：
<affect_update dp="[-0.5~+0.5]" da="[-0.5~+0.5]" d_trust="[-0.1~+0.1]" salience="[0.0~1.0]" memory_summary="若本轮包含值得长期铭记的约定/事实/情绪转折则填15字内摘要，否则留空" />`;

    return { systemPrompt, temperature, presencePenalty };
  }
}
```

---

### 4. 云端 SSE 双流拦截器 (`src/pipeline/dual-stream.ts`)

在流式接收云端大模型响应时，**前端零延迟看到正文，后台自动截获首行 `<affect_update ... />` 并触发本地 SQLite 状态演化**：

```typescript
export interface AffectUpdateHeader {
  dp: number;
  da: number;
  dTrust: number;
  salience: number;
  memorySummary: string;
}

export class DualStreamParser {
  private buffer = '';
  private headerParsed = false;

  /**
   * 喂入云端 SSE delta chunk，返回应立即推送给前端的干净文本
   */
  public pushChunk(
    chunk: string,
    onHeaderExtracted: (header: AffectUpdateHeader) => void
  ): string {
    if (this.headerParsed) {
      return chunk;
    }

    this.buffer += chunk;
    const newlineIdx = this.buffer.indexOf('\n');

    // 尚未收到完整首行时暂存缓冲（通常仅前 25~35 个 Token，耗时 <150ms）
    if (newlineIdx === -1) {
      if (this.buffer.length > 220 && !this.buffer.includes('<affect_update')) {
        // 兜底：若云端模型偶发漏打标签，直接释放缓冲
        this.headerParsed = true;
        return this.buffer;
      }
      return '';
    }

    const firstLine = this.buffer.slice(0, newlineIdx).trim();
    const restText = this.buffer.slice(newlineIdx + 1);
    this.headerParsed = true;

    const match = firstLine.match(
      /<affect_update\s+dp="([^"]+)"\s+da="([^"]+)"\s+d_trust="([^"]+)"\s+salience="([^"]+)"\s+memory_summary="([^"]*)"\s*\/>/
    );

    if (match) {
      onHeaderExtracted({
        dp: parseFloat(match[1]) || 0,
        da: parseFloat(match[2]) || 0,
        dTrust: parseFloat(match[3]) || 0,
        salience: parseFloat(match[4]) || 0,
        memorySummary: match[5].trim(),
      });
      return restText;
    }

    // 若首行不是标签，原样拼回返回
    return this.buffer;
  }
}
```

---

## 五、 回家搭建三步走指南

### 第一步：初始化工程与安装依赖
在本地新建目录并执行：

```bash
mkdir local-affective-engine && cd local-affective-engine
npm init -y
npm install better-sqlite3 sqlite-vec @huggingface/transformers openai hono @hono/node-server dotenv
npm install -D typescript tsx @types/node @types/better-sqlite3
npx tsc --init
```

> **Windows 注意事项**：`better-sqlite3` 自带预编译二进制（Prebuild），Node 20 LTS 下通常无需本机编译即可直接安装；在初始化数据库时通过 `sqliteVec.load(db)` 即可一行挂载向量检索扩展。

### 第二步：准备角色种子数据 (`data/seed_anchors.json`)
先写 10~16 条不同情绪象限下的高质量对话样本写入 `style_anchors` 表。重点覆盖以下四个象限：
1. **高唤醒 + 正愉悦（$P > 0.4, A > 0.6$）**：干脆利落、共鸣感强、带冷幽默；
2. **高唤醒 + 负愉悦（$P < -0.2, A > 0.6$）**：高优排障或劝阻熬夜时的严肃、短促、直奔主题；
3. **低唤醒 + 正愉悦（$P > 0.3, A < 0.35$）**：收工闲聊时的松弛、温和、简短；
4. **低唤醒 + 负愉悦（$P < -0.2, A < 0.35$）**：疲惫或无奈时的克制、留白、不啰嗦。

### 第三步：启动本地透明代理并接入客户端
用 `Hono` 暴露一个标准的 `POST /v1/chat/completions` 接口：
1. 客户端只管发最近 **4~6 轮** 短期对话（大幅节省云端 Token 开销）；
2. 本地网关在 `25ms` 内完成：**时间衰减结算 $\rightarrow$ 本地 ONNX 向量化 $\rightarrow$ 四维混合记忆召回 $\rightarrow$ 情绪反向染色 $\rightarrow$ 编译 System Prompt 与 Few-Shot**；
3. 转发给云端大模型（如 DeepSeek-V3 / Claude / Qwen-Max），流式剥离 `<affect_update>` 后实时推回客户端，同时异步落盘新记忆与新情绪坐标。
