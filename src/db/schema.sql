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
    DELETE FROM vec_episodic WHERE memory_id = OLD.id AND persona_id = OLD.persona_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_archive_vec_episodic
AFTER UPDATE OF status ON episodic_memories
WHEN OLD.status = 'active' AND NEW.status != 'active'
BEGIN
    DELETE FROM vec_episodic WHERE memory_id = NEW.id AND persona_id = NEW.persona_id;
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
    emotion_d REAL NOT NULL DEFAULT 0.1,
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

-- 8. 人设档案与调教配置表（人设调教模块）
CREATE TABLE IF NOT EXISTS persona_profiles (
    persona_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role_definition TEXT NOT NULL,         -- 身份定位与核心世界观
    tone_style TEXT NOT NULL,              -- 语气语调、表达习惯与口吻特征
    boundaries_taboos TEXT NOT NULL,       -- 绝对禁忌与行为红线
    relationship_with_user TEXT NOT NULL,  -- 与主人的认知羁绊与定位
    system_prompt_appendix TEXT DEFAULT '',-- 额外前置系统指令
    is_active INTEGER NOT NULL DEFAULT 0,  -- 是否为当前全局激活人设
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);
