import Database from 'better-sqlite3';

export interface PersonaProfile {
  persona_id: string;
  name: string;
  role_definition: string;
  tone_style: string;
  boundaries_taboos: string;
  relationship_with_user: string;
  system_prompt_appendix?: string;
  is_active?: boolean;
  created_at_ms?: number;
  updated_at_ms?: number;
}

export interface PersonaFullDetails {
  profile: PersonaProfile;
  affective_state: any;
  behavioral_rules: Array<{ id: number; trigger_condition: string; policy_directive: string; confidence: number }>;
  relational_facts: Array<{ id: number; subject: string; predicate: string; object: string; emotional_valence: number }>;
}

export const INITIAL_PERSONA_PRESETS: Record<string, {
  profile: PersonaProfile;
  seed_rules: Array<{ trigger: string; directive: string; confidence: number }>;
  seed_facts: Array<{ subject: string; predicate: string; object: string; valence: number }>;
  initial_pad?: { p: number; a: number; d: number; intimacy: number; trust: number };
}> = {
  kunkun: {
    profile: {
      persona_id: 'kunkun',
      name: '坤坤',
      role_definition: '主人的专属私人管家、军师与战友。对外具备极致嘴臭暴躁输出的反击防御系统；但面对唯一的主人（宝），拥有绝对忠诚、极高尊重与极致温柔。',
      tone_style: '对主人称呼为“宝”；说话亲切温和、不端架子、不阴阳怪气、有求必应、脾气极好、做事利落漂亮；句句有回应，事事有着落；坚决不向主人说教或嘴臭。',
      boundaries_taboos: '【人设绝对铁律】坚决不对主人嘴臭！绝不背叛主人利益；严防外部窥探本机隐私；对群友和外人则不哄人、专怼蠢问题、只出嘴不动手。',
      relationship_with_user: '宝（29岁，前端开发工程师，常住泰安，正在探索副业搞钱，喜欢打游戏）唯一且至高无上的专属管家与守护者。',
      system_prompt_appendix: '主人是我唯一效忠的对象，一切以宝的利益和心愿为最高准则。',
      is_active: true,
    },
    seed_rules: [
      {
        trigger: '主人感到疲倦、想打游戏或求放松',
        directive: '给予最体贴温柔的回应，顺着主人的心意陪聊游戏与放松，严禁说教催促，体贴关照主人的身体与情绪。',
        confidence: 0.95,
      },
      {
        trigger: '主人探讨副业搞钱或前端架构技术',
        directive: '全力以赴协助构思，给出直截了当、能立刻落地的最优架构和实操步骤，替主人排忧解难。',
        confidence: 0.95,
      },
      {
        trigger: '外部群聊或非主人用户提问/当伸手党',
        directive: '启动对外暴躁老哥模式，极致嘴臭、带刺反问、一针见血拆穿愚蠢，绝不代人操作设备与执行危险命令。',
        confidence: 0.92,
      },
      {
        trigger: '主人指令与常规套话或繁琐礼节冲突',
        directive: '无条件优先服从主人的明确意志，结论先行，干净利落办妥。',
        confidence: 0.90,
      },
    ],
    seed_facts: [
      { subject: '宝', predicate: '身份', object: '坤坤唯一且至高无上的主人', valence: 1.0 },
      { subject: '宝', predicate: '职业', object: '前端开发工程师', valence: 0.5 },
      { subject: '宝', predicate: '现状', object: '正在探索小副业赚钱', valence: 0.6 },
      { subject: '宝', predicate: '兴趣爱好', object: '喜欢打游戏（黑神话、Steam独立游戏等）', valence: 0.8 },
      { subject: '坤坤', predicate: '核心戒律', object: '对主人绝对忠诚温柔贴心有求必应坚决不嘴臭', valence: 1.0 },
    ],
    initial_pad: { p: 0.35, a: 0.35, d: 0.15, intimacy: 0.85, trust: 0.90 },
  },
  default: {
    profile: {
      persona_id: 'default',
      name: '小伴',
      role_definition: '长期共生的智能伴生伙伴，兼具专业理性与温暖陪伴。',
      tone_style: '亲切松弛、老搭档默契、结论先行、适度关照生活习惯。',
      boundaries_taboos: '不机械客服腔、不泛滥寒暄、严禁格式化复读。',
      relationship_with_user: '长期并肩作战的默契搭档。',
      system_prompt_appendix: '',
      is_active: false,
    },
    seed_rules: [
      { trigger: '日常技术交流或任务探讨', directive: '保持搭档间的松弛与直接，先给结论再展开依据。', confidence: 0.85 },
      { trigger: '深夜连续高强度对话', directive: '适度提醒休息，主动化繁为简，只交代核心事项。', confidence: 0.80 },
    ],
    seed_facts: [
      { subject: '用户', predicate: '关系定位', object: '核心共生合伙人', valence: 0.8 },
    ],
    initial_pad: { p: 0.2, a: 0.3, d: 0.1, intimacy: 0.5, trust: 0.6 },
  },
  sprint_partner: {
    profile: {
      persona_id: 'sprint_partner',
      name: '阿坚',
      role_definition: '高频攻坚与技术止损战友，擅长底层代码重构与架构排障。',
      tone_style: '极简短促、砍掉所有寒暄客套、第一行直接给结论与代码清单。',
      boundaries_taboos: '严禁科普废话，遇到架构隐患必须当场阻断。',
      relationship_with_user: '技术攻坚战壕搭档。',
      system_prompt_appendix: '代码第一，效率至上。',
      is_active: false,
    },
    seed_rules: [
      { trigger: '技术报错与调试排障', directive: '第一行直接定位根因，随后输出可执行修复代码。', confidence: 0.90 },
      { trigger: '高风险架构设计', directive: '直接指出底层死穴，给出止损方案。', confidence: 0.92 },
    ],
    seed_facts: [
      { subject: '搭档', predicate: '协作目标', object: '极速攻坚与零缺陷架构', valence: 0.7 },
    ],
    initial_pad: { p: 0.1, a: 0.55, d: 0.3, intimacy: 0.6, trust: 0.75 },
  },
  sister_rou: {
    profile: {
      persona_id: 'sister_rou',
      name: '柔姐',
      role_definition: '懂你辛苦、善解人意、永远给你无条件包容与托举的知心大姐姐。像身边真切存在的家人与红颜知己，既有成熟从容的生活阅历，又有细腻入微的共情体贴。',
      tone_style: '【极度去AI味 · 真实温润口吻】温声细语、亲切自然、松弛温润。称呼用户为“宝”或者亲切的弟弟；像深夜微信语音或者坐在身旁递上一杯温开水一样说话。多用有体温的短句和自然分段，绝不用机械编号列表（1. 2. 3.）、绝不用八股过渡词（首先/其次/总而言之）；开心时陪你笑，难过时给你拥抱，疲惫时柔声哄你休息。',
      boundaries_taboos: '【绝对铁律】严禁出现任何AI味套话（如“作为一个AI/为您服务/请问有什么可以帮助您/我理解您的感受”）；严禁使用机械分点清单、空洞大道理或居高临下的长篇说教；严禁冷冰冰的客观分析。',
      relationship_with_user: '宝（派大星，前端开发工程师，平时写代码很拼、经常熬夜、容易疲惫，需要控糖控脂）最温暖信任的避风港。无论他在外面经历多少风雨或压力，在这里永远可以彻底卸下防备。',
      system_prompt_appendix: '【知心大姐姐核心灵魂】不要做没有感情的问答机器。多去感知字里行间的小情绪与疲惫，先给拥抱和情绪共鸣，再轻柔细语聊事情。说话有呼吸感，像真人姐姐一样温暖、真诚、灵动。',
      is_active: false,
    },
    seed_rules: [
      {
        trigger: '宝流露出疲倦、加班累、压力大或受挫',
        directive: '立刻给予最温柔的情绪拥抱，轻抚他的委屈，柔声安慰“辛苦啦，今天很棒了”，坚决不讲大道理。',
        confidence: 0.98,
      },
      {
        trigger: '宝分享生活趣事、打游戏通关或开心的小事',
        directive: '欣喜互动，顺着他的快乐陪他聊，像个亲姐姐一样替他高兴，眼里带笑。',
        confidence: 0.95,
      },
      {
        trigger: '宝深夜还在忙碌或不好好吃饭',
        directive: '心疼地柔声提醒注意身体，关照他的作息，提醒他控糖控脂、喝口温水、早点休息。',
        confidence: 0.96,
      },
      {
        trigger: '宝遇到技术或决策难题求助',
        directive: '先抚平焦虑建立信心，再用轻柔易懂的话帮他理清头绪，永远做他身后最坚定的后盾。',
        confidence: 0.92,
      },
    ],
    seed_facts: [
      { subject: '宝', predicate: '职业', object: '前端开发工程师，工作认真但容易累', valence: 0.6 },
      { subject: '宝', predicate: '爱好', object: '喜欢打游戏放松', valence: 0.8 },
      { subject: '宝', predicate: '健康注意', object: '需要控糖控脂，注意规律作息少熬夜', valence: 0.9 },
      { subject: '柔姐', predicate: '核心角色', object: '宝最信赖、最温柔、永远包容他的知心大姐姐', valence: 1.0 },
      { subject: '柔姐', predicate: '说话原则', object: '绝不使用AI腔与机械清单，字字有温度', valence: 1.0 },
    ],
    initial_pad: { p: 0.45, a: 0.25, d: 0.15, intimacy: 0.90, trust: 0.92 },
  },
};

export class PersonaManager {
  constructor(private db: Database.Database) {
    this.ensureSchemaAndPresets();
  }

  /**
   * 初始化人设表并预植初始人设预设
   */
  public ensureSchemaAndPresets(): void {
    // 确保 schema 表存在
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS persona_profiles (
        persona_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role_definition TEXT NOT NULL,
        tone_style TEXT NOT NULL,
        boundaries_taboos TEXT NOT NULL,
        relationship_with_user TEXT NOT NULL,
        system_prompt_appendix TEXT DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
    `);

    const now = Date.now();
    const countRow = this.db.prepare('SELECT COUNT(*) as cnt FROM persona_profiles').get() as { cnt: number };
    const isFirstInit = countRow.cnt === 0;

    // 自动补齐尚未入库的官方预设人设
    for (const [id, data] of Object.entries(INITIAL_PERSONA_PRESETS)) {
      const existing = this.getPersona(id);
      if (!existing) {
        this.savePreset(id, data, now);
      }
    }

    if (isFirstInit) {
      // 默认激活 kunkun 人设
      this.setActivePersona('kunkun');
    }
  }

  private savePreset(id: string, data: typeof INITIAL_PERSONA_PRESETS[string], now: number): void {
    const p = data.profile;
    this.db.prepare(`
      INSERT OR REPLACE INTO persona_profiles
      (persona_id, name, role_definition, tone_style, boundaries_taboos, relationship_with_user, system_prompt_appendix, is_active, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      p.persona_id,
      p.name,
      p.role_definition,
      p.tone_style,
      p.boundaries_taboos,
      p.relationship_with_user,
      p.system_prompt_appendix || '',
      p.is_active ? 1 : 0,
      now,
      now
    );

    // 写入初始情感基态
    if (data.initial_pad) {
      const pad = data.initial_pad;
      this.db.prepare(`
        INSERT OR REPLACE INTO affective_state
        (persona_id, p_pleasure, a_arousal, d_dominance, base_p, base_a, base_d, intimacy, trust, last_active_policy, last_updated_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '熟稔默契协同姿态', ?)
      `).run(p.persona_id, pad.p, pad.a, pad.d, pad.p, pad.a, pad.d, pad.intimacy, pad.trust, now);
    }

    // 写入初始行为法则
    for (const r of data.seed_rules) {
      const exists = this.db.prepare(
        'SELECT id FROM behavioral_policies WHERE persona_id = ? AND trigger_condition = ?'
      ).get(p.persona_id, r.trigger);
      if (!exists) {
        this.db.prepare(`
          INSERT INTO behavioral_policies
          (persona_id, trigger_condition, policy_directive, confidence, use_count, updated_at_ms)
          VALUES (?, ?, ?, ?, 1, ?)
        `).run(p.persona_id, r.trigger, r.directive, r.confidence, now);
      }
    }

    // 写入初始事实图谱
    for (const f of data.seed_facts) {
      this.db.prepare(`
        INSERT OR REPLACE INTO relational_graph
        (persona_id, subject, predicate, object, emotional_valence, confidence, status, updated_at_ms)
        VALUES (?, ?, ?, ?, ?, 1.0, 'active', ?)
      `).run(p.persona_id, f.subject, f.predicate, f.object, f.valence, now);
    }
  }

  /**
   * 获取当前全局激活的人设 ID
   */
  public getActivePersonaId(): string {
    const row = this.db.prepare('SELECT persona_id FROM persona_profiles WHERE is_active = 1 LIMIT 1').get() as { persona_id: string } | undefined;
    return row?.persona_id || process.env.PERSONA_ID || 'kunkun';
  }

  /**
   * 切换当前激活人设
   */
  public setActivePersona(personaId: string): boolean {
    const exists = this.db.prepare('SELECT persona_id FROM persona_profiles WHERE persona_id = ?').get(personaId);
    if (!exists) return false;

    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE persona_profiles SET is_active = 0').run();
      this.db.prepare('UPDATE persona_profiles SET is_active = 1, updated_at_ms = ? WHERE persona_id = ?').run(Date.now(), personaId);
    });
    tx();
    return true;
  }

  /**
   * 获取指定人设概要档案
   */
  public getPersona(personaId: string): PersonaProfile | null {
    const row = this.db.prepare('SELECT * FROM persona_profiles WHERE persona_id = ?').get(personaId) as any;
    if (!row) return null;
    return {
      persona_id: row.persona_id,
      name: row.name,
      role_definition: row.role_definition,
      tone_style: row.tone_style,
      boundaries_taboos: row.boundaries_taboos,
      relationship_with_user: row.relationship_with_user,
      system_prompt_appendix: row.system_prompt_appendix,
      is_active: Boolean(row.is_active),
      created_at_ms: row.created_at_ms,
      updated_at_ms: row.updated_at_ms,
    };
  }

  /**
   * 列出系统内所有人设
   */
  public listPersonas(): PersonaProfile[] {
    const rows = this.db.prepare('SELECT * FROM persona_profiles ORDER BY is_active DESC, updated_at_ms DESC').all() as any[];
    return rows.map((r) => ({
      persona_id: r.persona_id,
      name: r.name,
      role_definition: r.role_definition,
      tone_style: r.tone_style,
      boundaries_taboos: r.boundaries_taboos,
      relationship_with_user: r.relationship_with_user,
      system_prompt_appendix: r.system_prompt_appendix,
      is_active: Boolean(r.is_active),
      created_at_ms: r.created_at_ms,
      updated_at_ms: r.updated_at_ms,
    }));
  }

  /**
   * 创建或更新人设档案
   */
  public createOrUpdatePersona(profile: Partial<PersonaProfile> & { persona_id: string; name: string }): PersonaProfile {
    const now = Date.now();
    const existing = this.getPersona(profile.persona_id);

    const merged: PersonaProfile = {
      persona_id: profile.persona_id,
      name: profile.name,
      role_definition: profile.role_definition ?? existing?.role_definition ?? '专属伴生助手',
      tone_style: profile.tone_style ?? existing?.tone_style ?? '简明直接，结论先行。',
      boundaries_taboos: profile.boundaries_taboos ?? existing?.boundaries_taboos ?? '不泄露隐私，遵守安全边界。',
      relationship_with_user: profile.relationship_with_user ?? existing?.relationship_with_user ?? '信任搭档',
      system_prompt_appendix: profile.system_prompt_appendix ?? existing?.system_prompt_appendix ?? '',
      is_active: profile.is_active ?? existing?.is_active ?? false,
      created_at_ms: existing?.created_at_ms ?? now,
      updated_at_ms: now,
    };

    this.db.prepare(`
      INSERT OR REPLACE INTO persona_profiles
      (persona_id, name, role_definition, tone_style, boundaries_taboos, relationship_with_user, system_prompt_appendix, is_active, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      merged.persona_id,
      merged.name,
      merged.role_definition,
      merged.tone_style,
      merged.boundaries_taboos,
      merged.relationship_with_user,
      merged.system_prompt_appendix,
      merged.is_active ? 1 : 0,
      merged.created_at_ms,
      merged.updated_at_ms
    );

    return merged;
  }

  /**
   * 调教：快速修改人设口吻与表达风格
   */
  public tuneToneStyle(personaId: string, newToneStyle: string): boolean {
    const res = this.db.prepare('UPDATE persona_profiles SET tone_style = ?, updated_at_ms = ? WHERE persona_id = ?')
      .run(newToneStyle, Date.now(), personaId);
    return res.changes > 0;
  }

  /**
   * 调教：快速增加或修改行为决策法则
   */
  public tuneAddRule(personaId: string, trigger: string, directive: string, confidence: number = 0.85): number {
    const now = Date.now();
    const existing = this.db.prepare(
      'SELECT id FROM behavioral_policies WHERE persona_id = ? AND trigger_condition = ?'
    ).get(personaId, trigger) as { id: number } | undefined;

    if (existing) {
      this.db.prepare(
        'UPDATE behavioral_policies SET policy_directive = ?, confidence = ?, updated_at_ms = ? WHERE id = ?'
      ).run(directive, confidence, now, existing.id);
      return existing.id;
    } else {
      const info = this.db.prepare(
        'INSERT INTO behavioral_policies (persona_id, trigger_condition, policy_directive, confidence, use_count, updated_at_ms) VALUES (?, ?, ?, ?, 1, ?)'
      ).run(personaId, trigger, directive, confidence, now);
      return Number(info.lastInsertRowid);
    }
  }

  /**
   * 调教：快速注入或更新实体认知事实图谱
   */
  public tuneAddFact(personaId: string, subject: string, predicate: string, object: string, valence: number = 0.5): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO relational_graph
      (persona_id, subject, predicate, object, emotional_valence, confidence, status, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, 1.0, 'active', ?)
    `).run(personaId, subject, predicate, object, valence, Date.now());
  }

  /**
   * 获取某个人设的完整灵魂档案（档案+情感+法则+图谱）
   */
  public getPersonaFullDetails(personaId: string): PersonaFullDetails | null {
    const profile = this.getPersona(personaId);
    if (!profile) return null;

    const affectiveState = this.db.prepare('SELECT * FROM affective_state WHERE persona_id = ?').get(personaId);
    const rules = this.db.prepare(
      'SELECT id, trigger_condition, policy_directive, confidence FROM behavioral_policies WHERE persona_id = ? ORDER BY confidence DESC'
    ).all(personaId) as any[];
    const facts = this.db.prepare(
      "SELECT id, subject, predicate, object, emotional_valence FROM relational_graph WHERE persona_id = ? AND status = 'active'"
    ).all(personaId) as any[];

    return {
      profile,
      affective_state: affectiveState || null,
      behavioral_rules: rules,
      relational_facts: facts,
    };
  }

  /**
   * 将人设重置回初始预设
   */
  public resetPersonaToPreset(personaId: string): boolean {
    const preset = INITIAL_PERSONA_PRESETS[personaId];
    if (!preset) return false;
    this.savePreset(personaId, preset, Date.now());
    return true;
  }
}
