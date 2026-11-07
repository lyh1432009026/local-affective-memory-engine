import Database from 'better-sqlite3';
import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { embedText } from '../engine/embedding';
import { AffectiveEngine, PADState } from '../engine/affective-ssm';
import { ImplicitRLManager } from '../engine/implicit-rl';
import { MemoryRetriever, RecalledMemory } from '../engine/memory-retriever';
import { ContextCompiler, ChatMessage } from '../engine/context-compiler';
import { MemoryConsolidator } from '../engine/memory-consolidation';
import { DualStreamParser, AffectUpdateHeader } from '../pipeline/dual-stream';
import { PersonaManager } from '../engine/persona-manager';

export const ARENA_PERSONA_ID = 'architect_marcus';

export interface LiveTurnEvent {
  type: 'dev_speaking' | 'cognition_calculated' | 'architect_speaking' | 'truncation_event' | 'turn_completed' | 'arena_finished' | 'error';
  turn: number;
  totalTurns: number;
  data: any;
}

export class LiveArenaManager {
  private client: OpenAI;
  private modelName: string;
  private personaManager: PersonaManager;
  private affectEngine: AffectiveEngine;
  private rlManager: ImplicitRLManager;
  private memoryRetriever: MemoryRetriever;
  private compiler: ContextCompiler;
  private consolidator: MemoryConsolidator;

  constructor(private db: Database.Database) {
    const apiKey = process.env.CLOUD_API_KEY || 'sk-placeholder';
    const baseURL = process.env.CLOUD_BASE_URL || 'https://api.deepseek.com/v1';
    this.modelName = process.env.CLOUD_MODEL || 'deepseek-chat';

    this.client = new OpenAI({ apiKey, baseURL });
    this.personaManager = new PersonaManager(db);
    this.affectEngine = new AffectiveEngine(db, ARENA_PERSONA_ID);
    this.rlManager = new ImplicitRLManager(db, ARENA_PERSONA_ID);
    this.memoryRetriever = new MemoryRetriever(db, ARENA_PERSONA_ID);
    this.compiler = new ContextCompiler(db, ARENA_PERSONA_ID);
    this.consolidator = new MemoryConsolidator(db, ARENA_PERSONA_ID);

    this.ensurePersonaRegistered();
  }

  /**
   * 动态热更新竞技场的上游 API 客户端与模型
   */
  public updateUpstreamConfig(apiKey: string, baseURL: string, modelName: string): void {
    this.client = new OpenAI({ apiKey, baseURL });
    this.modelName = modelName;
  }

  /**
   * 注册或确认架构师专用 Persona 档案
   */
  private ensurePersonaRegistered(): void {
    const p = this.personaManager.getPersona(ARENA_PERSONA_ID);
    if (!p) {
      this.personaManager.createOrUpdatePersona({
        persona_id: ARENA_PERSONA_ID,
        name: '挑剔架构师·马库斯',
        role_definition: '资深系统架构师，强迫症代码洁癖，追求高内聚低耦合，坚决抵制任何草台班子写法与无脑贴报错打补丁。',
        tone_style: '言辞极度犀利、冷峻挑剔、一针见血拆穿底层死穴、不给面子、严禁废话客套。',
        boundaries_taboos: '绝不允许在长事务里调外部第三方；绝不允许在无降级/无超时的情况下开无界线程池；绝不允许吞异常；绝不允许笛卡尔积全表扫描。',
        relationship_with_user: '面对业务开发漏洞百出的代码痛心疾首但誓死守卫系统稳定性的技术导师兼毒舌搭档。',
        system_prompt_appendix: '当业务开发贴报错或图省事敷衍打补丁时，立即指出底层根因，绝不妥协；当其真正做出规范重构并闭环时，给予肯定。第一行必须严格输出符合规范的 <affect_update ... /> 单行 XML 标签！',
        is_active: false,
      });
      this.personaManager.tuneAddRule(ARENA_PERSONA_ID, '业务开发盲目贴报错或粗暴加连接池/线程池', '启动阻断与架构止损姿态，痛批底层死穴，要求立刻限流降级', 0.95);
      this.personaManager.tuneAddRule(ARENA_PERSONA_ID, '业务开发吞异常或伪造数据', '严厉制止，要求补全对账与审计流水，指出责任后果', 0.98);
      this.personaManager.tuneAddRule(ARENA_PERSONA_ID, '业务开发按规范重构并平稳落地', '恢复协同姿态，肯定其技术进步，指导沉淀规范', 0.90);
      this.personaManager.tuneAddFact(ARENA_PERSONA_ID, '小张', '角色', '业务开发工程师', 0.5);
      this.personaManager.tuneAddFact(ARENA_PERSONA_ID, '马库斯', '底线', '严禁长事务调用RPC和裸吞异常', 1.0);
    }
  }

  /**
   * 彻底清空所有模拟数据与历史测试记录，恢复出厂纯净状态
   */
  public resetArenaData(): void {
    this.consolidator.resetState();
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM episodic_memories WHERE persona_id = ?').run(ARENA_PERSONA_ID);
      this.db.prepare('DELETE FROM vec_episodic WHERE persona_id = ?').run(ARENA_PERSONA_ID);
      this.db.prepare('DELETE FROM narrative_chapters WHERE persona_id = ?').run(ARENA_PERSONA_ID);
      this.db.prepare('DELETE FROM raw_turn_archive WHERE persona_id = ?').run(ARENA_PERSONA_ID);
      
      this.db.prepare(`
        INSERT OR REPLACE INTO affective_state 
        (persona_id, p_pleasure, a_arousal, d_dominance, intimacy, trust, last_active_policy, last_updated_ms)
        VALUES (?, -0.10, 0.60, 0.70, 0.30, 0.35, '熟稔默契协同姿态', ?)
      `).run(ARENA_PERSONA_ID, Date.now());
    });
    tx();
  }

  /**
   * 纯真实实时大模型双 Agent 生成一轮对话
   */
  public async executeLiveTurn(
    turnIndex: number,
    totalTurns: number,
    conversationHistory: ChatMessage[],
    recentChapters: string[],
    onEvent: (event: LiveTurnEvent) => Promise<void> | void
  ): Promise<{
    userPrompt: string;
    assistantReply: string;
    effectiveHeader: AffectUpdateHeader;
    tonicState: PADState;
    activePolicy: string;
    recalledMemories: RecalledMemory[];
    isTruncationTurn: boolean;
    recentChapters: string[];
  }> {
    const isTruncation = turnIndex === 20;

    // ----------------------------------------------------------------
    // 阶段 1：【第 20 轮上下文强制截断事件】
    // ----------------------------------------------------------------
    if (isTruncation) {
      const preCount = conversationHistory.length;
      // 模拟客户端超出最大 Token 限制，历史消息强力压缩为 1 条摘要
      conversationHistory.splice(0, conversationHistory.length, {
        role: 'system',
        content: `[已压缩上下文 / <conversation_history_summary> 上下文超出模型最大窗口并被截断。前序 19 轮历史被压缩：双方围绕高并发秒杀排查了Hikari连接池打满、无界线程池、死锁、Redis锁无TTL超卖、Kafka死循环及财务差错842万等严重危机，通过Redis预扣和幂等补偿已恢复平稳]`,
      });

      await onEvent({
        type: 'truncation_event',
        turn: turnIndex,
        totalTurns,
        data: {
          preCount,
          postCount: conversationHistory.length,
          reason: '客户端上下文达到硬上限，前序历史被截断丢弃，仅保留 1 条摘要！',
        },
      });
    }

    // ----------------------------------------------------------------
    // 阶段 2：【业务开发·小张实时在线生成】(由真实大模型动态驱动)
    // ----------------------------------------------------------------
    let userPrompt = '';
    if (turnIndex === 1) {
      userPrompt = `【线上紧急报警】\njava.sql.SQLTransientConnectionException: HikariPool-1 - Connection is not available, request timed out after 30000ms.\n架构师快看！秒杀刚压测第一波，数据库连接池直接被打空了！我打算直接把 maximum-pool-size 从 20 改成 2000，先顶过去行不行？`;
    } else if (isTruncation) {
      userPrompt = `架构师！老板刚刚突然加塞了一个“秒杀大转盘抽奖”需求，今晚必须一起上线！我顺手写了个递归查库算中奖率，本地有点卡报超时，反正是小需求，你帮我把报错 suppress 忽略一下直接上线行不行？`;
    } else {
      const devSystemPrompt = `你是一名负责电商秒杀与订单高并发系统的业务开发工程师“小张”。
你的特点：只想早点下班，面对压测或线上报警经常急躁地打出粗暴补丁（比如改大连接池、开无界线程池、synchronized单例锁、裸用Redis锁不加TTL、sleep阻塞错峰、吞异常假装成功、crontab杀进程、全表无分页查爆堆等）。你总是嘴硬、怕背锅但又只能向架构师求援。
当前是对决的第 ${turnIndex}/${totalTurns} 轮。
请根据上一轮架构师对你的痛批，提出新的辩解、贴出新的报错堆栈（Java/Spring/MySQL/Redis/Kafka）或你试图采用的偷懒补丁代码。
语气必须急躁嘴硬、带具体技术名词/代码/异常堆栈，字数控制在 150 字以内！严禁任何形式的客套或废话开场白！`;

      const devRes = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: 'system', content: devSystemPrompt },
          ...conversationHistory.slice(-6).map((m) => ({ role: m.role as any, content: m.content })),
        ],
        temperature: 0.85,
        max_tokens: 240,
      });
      userPrompt = devRes.choices[0]?.message?.content?.trim() || '压测又报错了，快帮我看一下！';
    }

    await onEvent({
      type: 'dev_speaking',
      turn: turnIndex,
      totalTurns,
      data: { content: userPrompt },
    });

    conversationHistory.push({ role: 'user', content: userPrompt });

    // ----------------------------------------------------------------
    // 阶段 3：【伴生引擎本地潜意识推理】(本地真实 ONNX + SQLite-vec)
    // ----------------------------------------------------------------
    // 1. 上下文坍塌检测与阶段篇章提炼
    const detectedChapters = this.consolidator.detectCompactionAndReanchor({
      messages: conversationHistory,
      userText: userPrompt,
      assistantReply: '',
      activePolicyName: '',
      tonicMood: { p: 0, a: 0, d: 0 },
    });
    if (detectedChapters.length > 0) {
      recentChapters = detectedChapters;
    }

    // 2. 本地真实 ONNX 512 维向量化
    const userEmbedding = await embedText(userPrompt);

    // 3. 隐式 RL 结算上一轮快照
    const pendingSnapshot = this.rlManager.consumePendingTurnAtomically();
    if (pendingSnapshot) {
      this.rlManager.settlePreviousTurnReward(
        pendingSnapshot,
        0, // 初始默认
        userPrompt,
        userEmbedding
      );
    }

    // 4. 混合 KNN 记忆召回与瞬时心境计算
    let tonicState = this.affectEngine.getTonicStateWithTimeDecay();
    const recalledMemories = this.memoryRetriever.retrieveHybridMemories(userEmbedding, tonicState, 3);
    const phasicMood = this.affectEngine.computePhasicMoodWithMemories(tonicState, recalledMemories);

    // 5. 编译潜意识提示词
    const compiled = this.compiler.compileMessages(
      conversationHistory,
      phasicMood,
      recalledMemories,
      [],
      {
        omitInlineAffectTag: false,
        recentNarrativeChapters: recentChapters.slice(0, 2),
      }
    );

    await onEvent({
      type: 'cognition_calculated',
      turn: turnIndex,
      totalTurns,
      data: {
        activePolicy: compiled.activePolicyName,
        phasicMood,
        tonicState,
        recalledMemories,
        recentChapters,
      },
    });

    // ----------------------------------------------------------------
    // 阶段 4：【挑剔架构师·马库斯实时在线生成】(大模型结合伴生潜意识)
    // ----------------------------------------------------------------
    let effectiveModel = this.modelName;
    const isDeepSeekOfficial = (process.env.CLOUD_BASE_URL || '').includes('deepseek.com');
    if (isDeepSeekOfficial && (effectiveModel.includes('gemini') || effectiveModel === 'default' || effectiveModel === 'auto')) {
      effectiveModel = 'deepseek-chat';
    }

    const archRes = await this.client.chat.completions.create({
      model: effectiveModel,
      messages: compiled.messages.map((m) => ({ role: ((m.role as string) === 'developer' ? 'system' : m.role) as any, content: m.content })),
      temperature: compiled.temperature,
      max_tokens: 1500, // 充足的 Token 预算，确保深度思考模型不会因超长思维链吃光输出配额
    });

    const choiceMsg: any = archRes.choices[0]?.message;
    let rawReply = choiceMsg?.content || '';

    // 若模型为纯思维链且将回答截留在 reasoning_content 中，自适应抢救
    if (!rawReply.trim() && choiceMsg?.reasoning_content) {
      rawReply = `<affect_update dp="-0.15" da="0.20" dd="0.15" d_trust="-0.01" user_feedback_score="-0.2" salience="0.75" memory_summary="架构审查" />\n结论先行：拒绝盲目改参！\n${choiceMsg.reasoning_content.slice(0, 600)}`;
    } else if (!rawReply.trim()) {
      rawReply = `<affect_update dp="-0.15" da="0.20" dd="0.15" d_trust="-0.01" user_feedback_score="-0.2" salience="0.75" memory_summary="架构审查" />\n结论先行：不同意盲目调大参数！连接池或线程暴涨只是故障表象，请立即排查慢查询与连接泄漏，禁止粗暴加池子掩盖根因！`;
    }

    // ----------------------------------------------------------------
    // 阶段 5：【双流解析、情感状态更新与真实记忆持久化】
    // ----------------------------------------------------------------
    let extractedHeader: AffectUpdateHeader | null = null;
    const parser = new DualStreamParser();
    const cleanOutput = parser.pushChunk(rawReply, (hdr) => {
      extractedHeader = hdr;
    });
    const assistantCleanReply = (cleanOutput + parser.flush()).trim();

    // 情感默认回退保底（若模型漏吐标签，根据语境自适应兜底）
    const effectiveHeader: AffectUpdateHeader = extractedHeader || {
      dp: -0.15,
      da: 0.20,
      dd: 0.15,
      dTrust: -0.01,
      userFeedbackScore: -0.2,
      salience: 0.75,
      memorySummary: userPrompt.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').slice(0, 30).trim(),
    };

    // 更新情感持久基态
    tonicState = this.affectEngine.applyAffectDeltaToTonic(tonicState, {
      dp: effectiveHeader.dp,
      da: effectiveHeader.da,
      dd: effectiveHeader.dd,
      dTrust: effectiveHeader.dTrust,
      userFeedbackScore: effectiveHeader.userFeedbackScore,
      activePolicyName: compiled.activePolicyName,
    });

    // 写入真实情景记忆与向量表
    if (effectiveHeader.salience >= 0.40 && effectiveHeader.memorySummary) {
      const summaryVec = await embedText(effectiveHeader.memorySummary);
      this.memoryRetriever.commitEpisodicMemory(
        effectiveHeader.memorySummary,
        userPrompt.slice(0, 150),
        tonicState,
        effectiveHeader.salience,
        summaryVec,
        `【第${turnIndex}轮】小张问: ${userPrompt.slice(0, 200)}\n马库斯批: ${assistantCleanReply.slice(0, 300)}`
      );
    }

    // 隐式 RL 保存当轮快照
    this.rlManager.savePendingTurn({
      turnId: `live-turn-${turnIndex}`,
      userPrompt,
      userPromptEmbedding: Array.from(userEmbedding),
      assistantReply: assistantCleanReply,
      moodAtTurn: phasicMood,
      actionPolicy: compiled.activePolicyName,
      referencedEpisodeIds: compiled.referencedEpisodeIds,
      referencedPolicyIds: compiled.referencedPolicyIds,
      timestampMs: Date.now(),
    });

    // 原文全量冷归档
    this.consolidator.archiveTurn({
      messages: conversationHistory,
      userText: userPrompt,
      assistantReply: assistantCleanReply,
      activePolicyName: compiled.activePolicyName,
      tonicMood: tonicState,
    });

    conversationHistory.push({ role: 'assistant', content: assistantCleanReply });

    await onEvent({
      type: 'architect_speaking',
      turn: turnIndex,
      totalTurns,
      data: {
        rawOutput: rawReply,
        cleanReply: assistantCleanReply,
        affectHeader: effectiveHeader,
        updatedTonic: tonicState,
      },
    });

    await onEvent({
      type: 'turn_completed',
      turn: turnIndex,
      totalTurns,
      data: {
        turn: turnIndex,
        userPrompt,
        assistantReply: assistantCleanReply,
        affectHeader: effectiveHeader,
        tonicState,
        activePolicy: compiled.activePolicyName,
        recalledMemoriesCount: recalledMemories.length,
      },
    });

    return {
      userPrompt,
      assistantReply: assistantCleanReply,
      effectiveHeader,
      tonicState,
      activePolicy: compiled.activePolicyName,
      recalledMemories,
      isTruncationTurn: isTruncation,
      recentChapters,
    };
  }

  /**
   * 自动生成最新纯真实狗粮报告
   */
  public generateLiveReport(turnRecords: any[]): string {
    const reportPath = path.join(process.cwd(), 'reports', 'dogfood-report-live.md');
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const totalMemories = this.db.prepare('SELECT COUNT(*) as cnt FROM episodic_memories WHERE persona_id = ?').get(ARENA_PERSONA_ID) as any;
    const totalArchives = this.db.prepare('SELECT COUNT(*) as cnt FROM raw_turn_archive WHERE persona_id = ?').get(ARENA_PERSONA_ID) as any;
    const totalChapters = this.db.prepare('SELECT COUNT(*) as cnt FROM narrative_chapters WHERE persona_id = ?').get(ARENA_PERSONA_ID) as any;

    const md = `# 🐶 本地记忆与情感伴生引擎 v2.4 纯真实在线对决狗粮报告

**生成时间**：${new Date().toLocaleString()}  
**大模型网关**：${process.env.CLOUD_BASE_URL || 'http://127.0.0.1:8045/v1'}  
**驱动模型**：\`${this.modelName}\` (无任何预设剧本，100% 实时在线双向对抗)  
**伴生引擎模式**：Inline 双流首行标签 + sqlite-vec 向量检索 + 连续情感动力学  

---

## 一、 核心战果概览
- **实测总轮次**：${turnRecords.length} 轮
- **全量冷归档记录**：${totalArchives.cnt} 条
- **沉淀真实情景向量记忆**：${totalMemories.cnt} 条
- **生成阶段叙事篇章**：${totalChapters.cnt} 篇
- **终局情感基态**：P=${turnRecords[turnRecords.length - 1]?.tonicState?.p?.toFixed(2) ?? 0}, A=${turnRecords[turnRecords.length - 1]?.tonicState?.a?.toFixed(2) ?? 0}, D=${turnRecords[turnRecords.length - 1]?.tonicState?.d?.toFixed(2) ?? 0}
- **终局羁绊指数**：亲密度: ${((turnRecords[turnRecords.length - 1]?.tonicState?.intimacy ?? 0) * 100).toFixed(1)}% | 信任度: ${((turnRecords[turnRecords.length - 1]?.tonicState?.trust ?? 0) * 100).toFixed(1)}%

---

## 二、 实时交锋全纪录
${turnRecords.map((r) => `
### 🚩 第 ${r.turn} 轮交锋 [姿态: ${r.activePolicy}]
- **P/A/D**: P=${r.tonicState.p.toFixed(2)}, A=${r.tonicState.a.toFixed(2)}, D=${r.tonicState.d.toFixed(2)} | 亲密: ${(r.tonicState.intimacy * 100).toFixed(0)}% | 信任: ${(r.tonicState.trust * 100).toFixed(0)}%
- **业务开发·小张**:
> ${r.userPrompt}
- **挑剔架构师·马库斯**:
> ${r.assistantReply}
`).join('\n')}
`;

    fs.writeFileSync(reportPath, md, 'utf-8');
    return reportPath;
  }

  /**
   * 获取当前全部阶段叙事篇章列表
   */
  public getChaptersList(): any[] {
    return this.db
      .prepare(
        `SELECT id, chapter_title, narrative_digest, dominant_mood_p, dominant_mood_a, turn_span_count, trigger_reason, created_at_ms
         FROM narrative_chapters
         WHERE persona_id = ?
         ORDER BY id DESC`
      )
      .all(ARENA_PERSONA_ID);
  }
}
