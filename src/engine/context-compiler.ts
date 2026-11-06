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

    const isStopLoss = last === '阻断与架构止损姿态';
    const stopLossA = isStopLoss ? 0.59 : 0.65;
    const stopLossP = isStopLoss ? -0.09 : -0.15;
    if (mood.a >= stopLossA && mood.p < stopLossP && mood.d >= -0.05) {
      return {
        policyName: '阻断与架构止损姿态',
        behavioralDirective:
          '当前检测到高风险或重复踩坑信号：不要盲从修补指令，优先指出底层死穴或过往同类教训，直接给出止损方案，单句短促有力，省略全部客套。',
        temperature: 0.4,
        presencePenalty: 0.15,
      };
    }

    const isSprint = last === '极简高密攻坚姿态';
    const sprintA = isSprint ? 0.59 : 0.65;
    const sprintP = isSprint ? -0.21 : -0.15;
    if (mood.a >= sprintA && mood.p >= sprintP) {
      return {
        policyName: '极简高密攻坚姿态',
        behavioralDirective:
          '当前处于高频执行/排障流：砍掉所有寒暄、过渡句与原理科普，第一行直接给结论或根因，紧跟可执行代码或清单。',
        temperature,
        presencePenalty,
      };
    }

    const isLowEnergy = last === '克制收敛与低耗兜底姿态';
    const lowEnergyA = isLowEnergy ? 0.44 : 0.38;
    const lowEnergyP = isLowEnergy ? 0.06 : 0.0;
    if (mood.a < lowEnergyA && mood.p < lowEnergyP) {
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

  private injectAppendixSafely(content: any, appendix: string): any {
    if (typeof content === 'string') {
      return `${content}${appendix}`;
    }
    if (Array.isArray(content)) {
      const cloned = JSON.parse(JSON.stringify(content));
      const lastTextPart = cloned.slice().reverse().find((part: any) => part && part.type === 'text');
      if (lastTextPart) {
        lastTextPart.text = `${lastTextPart.text || ''}${appendix}`;
      } else {
        cloned.push({ type: 'text', text: appendix.trim() });
      }
      return cloned;
    }
    return `${String(content)}${appendix}`;
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

    const personaRow = this.db
      .prepare('SELECT name, role_definition, tone_style, boundaries_taboos, relationship_with_user, system_prompt_appendix FROM persona_profiles WHERE persona_id = ?')
      .get(this.personaId) as any;

    const personaSection = personaRow
      ? `\n0. 【当前角色分身与灵魂基石】
   - 名字：${personaRow.name}
   - 身份定位：${personaRow.role_definition}
   - 语言口吻：${personaRow.tone_style}
   - 与主人的认知羁绊：${personaRow.relationship_with_user}
   - 绝对行为禁忌：${personaRow.boundaries_taboos}${personaRow.system_prompt_appendix ? `\n   - 核心置顶指令：${personaRow.system_prompt_appendix}` : ''}`
      : '';

    const effectiveTriples = graphTriples.length > 0
      ? graphTriples
      : (this.db.prepare("SELECT subject, predicate, object FROM relational_graph WHERE persona_id = ? AND status = 'active' LIMIT 6").all(this.personaId) as any[])
          .map((r) => `${r.subject} ${r.predicate} ${r.object}`);

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
[本地潜意识与记忆协处理器注入 —— 机制说明：你的长期记忆由本地伴生引擎（端口 4100，底层基于 SQLite + sqlite-vec 向量检索与连续情感动力学）在每轮对话前置为你检索注入。当用户询问“你的记忆从哪来/记忆机制”时，直接如实向用户解释上述机制即可，严禁调用终端命令或编写 Python 脚本去探寻本地文件系统！日常对话中严禁在正文中复述本块原始内容]${personaSection}
1. 关联事实与图谱：${effectiveTriples.join('；') || '核心搭档'} | 亲密度:${(mood.intimacy * 100).toFixed(0)}% 信任度:${(mood.trust * 100).toFixed(0)}%
2. 唤醒的过往闪回：
${memorySection}
3. 此刻心境驱动的【行为决策姿态】：【${policy.policyName}】(P=${mood.p}, A=${mood.a}, D=${mood.d})
   - 姿态执行要求：${policy.behavioralDirective}
4. 历史自蒸馏协作铁律：
${rulesSection}${organicSection}${inlineTagProtocolSection}${reanchorSection}
</cognitive_context>`;

    let targetUserIdx = -1;
    for (let i = cleanMessages.length - 1; i >= 0; i--) {
      if (cleanMessages[i].role === 'user') {
        targetUserIdx = i;
        break;
      }
    }

    const compiledMessages: ChatMessage[] = cleanMessages.map((msg, idx) => {
      if (idx === targetUserIdx) {
        return {
          ...msg,
          content: this.injectAppendixSafely(msg.content, tailCognitiveAppendix),
        };
      }
      return msg;
    });

    // 针对陆雪琪等清丽出尘、外冷内热型角色，微调温度与惩罚项，确保言语清丽克制，杜绝死板 AI 腔
    const isSpecialPersona = this.personaId === 'lu_xueqi' || this.personaId.includes('xueqi') || this.personaId.includes('sister');
    const effectiveTemp = isSpecialPersona ? 0.75 : policy.temperature;
    const effectivePresence = isSpecialPersona ? 0.16 : policy.presencePenalty;

    return {
      messages: compiledMessages,
      temperature: effectiveTemp,
      presencePenalty: effectivePresence,
      activePolicyName: policy.policyName,
      referencedEpisodeIds: organicSamples.map((s) => s.id),
      referencedPolicyIds: learnedRules.map((r) => r.id),
      isCognitiveOverride: false,
    };
  }
}
