import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { streamSSE } from 'hono/streaming';
import OpenAI from 'openai';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { initDatabase } from './db/client';
import { embedText } from './engine/embedding';
import { AffectiveEngine } from './engine/affective-ssm';
import { ImplicitRLManager } from './engine/implicit-rl';
import { MemoryRetriever } from './engine/memory-retriever';
import { ContextCompiler, ChatMessage } from './engine/context-compiler';
import { MemoryConsolidator } from './engine/memory-consolidation';
import { LocalJevEngine, JevTurnEvaluation } from './engine/local-jev';
import { DualStreamParser, AffectUpdateHeader } from './pipeline/dual-stream';
import { PersonaManager, PersonaProfile } from './engine/persona-manager';
import { LiveArenaManager } from './arena/live-arena';

const dbPath = path.join(process.cwd(), 'data', 'cognitive_core.db');
const db = initDatabase(dbPath);
const personaManager = new PersonaManager(db);
const arenaManager = new LiveArenaManager(db);
const preferJevMode = (process.env.AFFECT_MODE || 'jev').toLowerCase() !== 'inline';
const localJev = new LocalJevEngine();

let cloudClient = new OpenAI({
  apiKey: process.env.CLOUD_API_KEY || 'sk-placeholder',
  baseURL: process.env.CLOUD_BASE_URL || 'https://api.deepseek.com/v1',
});

const app = new Hono();

app.use('*', cors());

const getDashboardHtml = () => {
  const p1 = path.join(process.cwd(), 'public', 'index.html');
  if (fs.existsSync(p1)) return fs.readFileSync(p1, 'utf-8');
  const p2 = path.join(__dirname, '..', 'public', 'index.html');
  if (fs.existsSync(p2)) return fs.readFileSync(p2, 'utf-8');
  return null;
};

const getArenaHtml = () => {
  const p1 = path.join(process.cwd(), 'public', 'arena.html');
  if (fs.existsSync(p1)) return fs.readFileSync(p1, 'utf-8');
  const p2 = path.join(__dirname, '..', 'public', 'arena.html');
  if (fs.existsSync(p2)) return fs.readFileSync(p2, 'utf-8');
  return null;
};

app.get('/', (c) => {
  const html = getDashboardHtml();
  if (html) return c.html(html);
  return c.text('Local Affective & Memory Engine v2.4 Running');
});

app.get('/ui', (c) => {
  const html = getDashboardHtml();
  if (html) return c.html(html);
  return c.text('Dashboard UI not found');
});

app.get('/arena', (c) => {
  const html = getArenaHtml();
  if (html) return c.html(html);
  return c.text('Arena UI not found');
});

app.get('/health', (c) => {
  const activePersonaId = personaManager.getActivePersonaId();
  const profile = personaManager.getPersona(activePersonaId);
  return c.json({
    status: 'ok',
    version: '2.4.0',
    activePersonaId,
    personaName: profile?.name || '未知',
    mode: preferJevMode ? 'RTX-2070 Local Jev + Inline Fallback' : 'Inline Dual-Stream Only',
  });
});

app.get('/v1/models', async (c) => {
  const defaultModel = process.env.CLOUD_MODEL || 'gemini-3.8-flash';
  const customList = [
    { id: defaultModel, object: 'model', created: 1793880000, owned_by: 'custom' },
    { id: 'deepseek-flash', object: 'model', created: 1793880000, owned_by: 'deepseek' },
    { id: 'deepseek-chat', object: 'model', created: 1793880000, owned_by: 'deepseek' },
  ];

  try {
    const upstream = await cloudClient.models.list();
    if (upstream && Array.isArray(upstream.data)) {
      const upstreamIds = new Set(upstream.data.map((m: any) => m.id));
      const merged = [...upstream.data];
      for (const item of customList) {
        if (!upstreamIds.has(item.id)) {
          merged.push(item as any);
        }
      }
      return c.json({ object: 'list', data: merged });
    }
  } catch {}

  return c.json({ object: 'list', data: customList });
});

// ==================== 【系统网关与配置 API】 ====================

app.get('/v1/config', (c) => {
  const rawKey = process.env.CLOUD_API_KEY || '';
  return c.json({
    port: Number(process.env.PORT || 4100),
    affect_mode: process.env.AFFECT_MODE || 'inline',
    cloud_base_url: process.env.CLOUD_BASE_URL || 'https://api.deepseek.com/v1',
    cloud_api_key: rawKey,
    cloud_model: process.env.CLOUD_MODEL || 'gemini-3.8-flash',
    local_jev_url: process.env.LOCAL_JEV_URL || 'http://127.0.0.1:8081/v1',
    local_jev_timeout_ms: Number(process.env.LOCAL_JEV_TIMEOUT_MS || 450),
    hf_mirror: process.env.HF_MIRROR || 'https://hf-mirror.com',
  });
});

app.post('/v1/config', async (c) => {
  const body = await c.req.json();
  if (body.cloud_base_url) process.env.CLOUD_BASE_URL = body.cloud_base_url;
  if (body.cloud_api_key) process.env.CLOUD_API_KEY = body.cloud_api_key;
  if (body.cloud_model) process.env.CLOUD_MODEL = body.cloud_model;
  if (body.affect_mode) process.env.AFFECT_MODE = body.affect_mode;
  if (body.local_jev_url) process.env.LOCAL_JEV_URL = body.local_jev_url;
  if (body.local_jev_timeout_ms) process.env.LOCAL_JEV_TIMEOUT_MS = String(body.local_jev_timeout_ms);

  // 热更新 client
  cloudClient = new OpenAI({
    apiKey: process.env.CLOUD_API_KEY || 'sk-placeholder',
    baseURL: process.env.CLOUD_BASE_URL || 'https://api.deepseek.com/v1',
  });

  // 同步写回 .env
  try {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }
    const updateKey = (key: string, val: string) => {
      const reg = new RegExp(`^${key}=.*$`, 'm');
      if (reg.test(envContent)) {
        envContent = envContent.replace(reg, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    };
    if (body.cloud_base_url) updateKey('CLOUD_BASE_URL', body.cloud_base_url);
    if (body.cloud_api_key) updateKey('CLOUD_API_KEY', body.cloud_api_key);
    if (body.cloud_model) updateKey('CLOUD_MODEL', body.cloud_model);
    if (body.affect_mode) updateKey('AFFECT_MODE', body.affect_mode);
    if (body.local_jev_url) updateKey('LOCAL_JEV_URL', body.local_jev_url);
    if (body.local_jev_timeout_ms) updateKey('LOCAL_JEV_TIMEOUT_MS', String(body.local_jev_timeout_ms));
    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
  } catch (err) {
    console.error('Failed to write .env file:', err);
  }

  return c.json({ success: true, message: 'Configuration updated and applied.' });
});

app.get('/v1/config/upstream-models', async (c) => {
  try {
    const list = await cloudClient.models.list();
    const models = (list.data || []).map((m: any) => m.id);
    return c.json({ success: true, models });
  } catch (err: any) {
    return c.json({ success: false, models: [], error: err.message });
  }
});

app.post('/v1/config/test-connection', async (c) => {
  const body = await c.req.json();
  const testKey = body.api_key || process.env.CLOUD_API_KEY;
  const testBaseUrl = body.base_url || process.env.CLOUD_BASE_URL || 'https://api.deepseek.com/v1';

  const t0 = Date.now();
  try {
    const client = new OpenAI({ apiKey: testKey, baseURL: testBaseUrl });
    const list = await client.models.list();
    const duration = Date.now() - t0;
    const modelIds = (list.data || []).map((m: any) => m.id);
    return c.json({
      success: true,
      latency_ms: duration,
      models_count: modelIds.length,
      models: modelIds,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Connection failed' });
  }
});

// ==================== 【记忆库与图谱探针 API】 ====================

app.get('/v1/memories', (c) => {
  const pId = c.req.query('persona_id') || personaManager.getActivePersonaId();
  const episodic = db.prepare('SELECT id, summary, full_payload, verbatim_quote, salience, access_count, status, created_at_ms FROM episodic_memories WHERE persona_id = ? ORDER BY id DESC LIMIT 50').all(pId);
  const chapters = db.prepare('SELECT id, chapter_title, narrative_digest, trigger_reason, created_at_ms FROM narrative_chapters WHERE persona_id = ? ORDER BY id DESC LIMIT 20').all(pId);
  return c.json({ episodic_memories: episodic, narrative_chapters: chapters });
});

app.post('/v1/memories/search', async (c) => {
  const body = await c.req.json();
  const pId = body.persona_id || personaManager.getActivePersonaId();
  const query = body.query;
  if (!query) return c.json({ results: [] });
  const qVec = await embedText(query);
  const retriever = new MemoryRetriever(db, pId);
  const affectEngine = new AffectiveEngine(db, pId);
  const tonic = affectEngine.getTonicStateWithTimeDecay();
  const hits = retriever.retrieveHybridMemories(qVec, tonic, 5);
  return c.json({ results: hits });
});

// 清除记忆（支持清除当前角色记忆，或清除全库所有记忆）
app.delete('/v1/memories', (c) => {
  const pId = c.req.query('persona_id') || personaManager.getActivePersonaId();
  const clearAll = c.req.query('all') === 'true' || pId === 'ALL';

  const tx = db.transaction(() => {
    if (clearAll) {
      db.prepare('DELETE FROM episodic_memories').run();
      db.prepare('DELETE FROM vec_episodic').run();
      db.prepare('DELETE FROM narrative_chapters').run();
      db.prepare('DELETE FROM raw_turn_archive').run();
    } else {
      db.prepare('DELETE FROM episodic_memories WHERE persona_id = ?').run(pId);
      db.prepare('DELETE FROM vec_episodic WHERE persona_id = ?').run(pId);
      db.prepare('DELETE FROM narrative_chapters WHERE persona_id = ?').run(pId);
      db.prepare('DELETE FROM raw_turn_archive WHERE persona_id = ?').run(pId);
    }
  });
  tx();
  return c.json({
    success: true,
    message: clearAll ? '全库所有角色的情景记忆、向量索引与归档已彻底清空。' : `角色 [${pId}] 的所有情景记忆、向量索引与归档已彻底清空。`
  });
});

// 删除单条情景记忆
app.delete('/v1/memories/:id', (c) => {
  const id = Number(c.req.param('id'));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM episodic_memories WHERE id = ?').run(id);
    db.prepare('DELETE FROM vec_episodic WHERE memory_id = ?').run(id);
  });
  tx();
  return c.json({ success: true, message: `记忆 #${id} 已删除。` });
});

app.delete('/v1/personas/rule/:id', (c) => {
  const id = Number(c.req.param('id'));
  const res = db.prepare('DELETE FROM behavioral_policies WHERE id = ?').run(id);
  return c.json({ success: res.changes > 0 });
});

app.delete('/v1/personas/fact/:id', (c) => {
  const id = Number(c.req.param('id'));
  const res = db.prepare('DELETE FROM relational_graph WHERE id = ?').run(id);
  return c.json({ success: res.changes > 0 });
});

app.post('/v1/affect/shift', async (c) => {
  const body = await c.req.json();
  const pId = body.persona_id || personaManager.getActivePersonaId();
  const affectEngine = new AffectiveEngine(db, pId);
  const tonic = affectEngine.getTonicStateWithTimeDecay();
  const updated = affectEngine.applyAffectDeltaToTonic(tonic, {
    dp: body.dp ?? 0,
    da: body.da ?? 0,
    dd: body.dd ?? 0,
    dTrust: body.dTrust ?? 0,
    userFeedbackScore: body.userFeedbackScore ?? 0,
  });
  return c.json({ success: true, updated_tonic: updated });
});

// ==================== 【人设调教模块 API】 ====================

// 1. 获取系统内所有人设列表
app.get('/v1/personas', (c) => {
  const activeId = personaManager.getActivePersonaId();
  const list = personaManager.listPersonas();
  return c.json({
    active_persona_id: activeId,
    personas: list,
  });
});

// 2. 获取指定人设全维度详情（档案+情感+法则+图谱）
app.get('/v1/personas/:id', (c) => {
  const id = c.req.param('id');
  const details = personaManager.getPersonaFullDetails(id);
  if (!details) {
    return c.json({ error: 'Persona not found' }, 404);
  }
  return c.json(details);
});

// 3. 切换当前全局激活人设
app.post('/v1/personas/switch', async (c) => {
  const body = await c.req.json();
  const id = body.persona_id;
  if (!id) return c.json({ error: 'Missing persona_id' }, 400);
  const success = personaManager.setActivePersona(id);
  if (!success) return c.json({ error: `Persona ${id} not found` }, 404);
  const profile = personaManager.getPersona(id);
  return c.json({ success: true, active_persona: profile });
});

// 4. 创建或更新人设档案
app.post('/v1/personas', async (c) => {
  const body = await c.req.json();
  if (!body.persona_id || !body.name) {
    return c.json({ error: 'Missing persona_id or name' }, 400);
  }
  const updated = personaManager.createOrUpdatePersona(body);
  return c.json({ success: true, persona: updated });
});

// 5. 调教：快速修改口吻与表达风格
app.post('/v1/personas/tune/style', async (c) => {
  const body = await c.req.json();
  const id = body.persona_id || personaManager.getActivePersonaId();
  if (!body.tone_style) return c.json({ error: 'Missing tone_style' }, 400);
  const ok = personaManager.tuneToneStyle(id, body.tone_style);
  return c.json({ success: ok, persona_id: id, tone_style: body.tone_style });
});

// 6. 调教：新增或覆盖行为法则
app.post('/v1/personas/tune/rule', async (c) => {
  const body = await c.req.json();
  const id = body.persona_id || personaManager.getActivePersonaId();
  if (!body.trigger || !body.directive) {
    return c.json({ error: 'Missing trigger or directive' }, 400);
  }
  const ruleId = personaManager.tuneAddRule(id, body.trigger, body.directive, body.confidence ?? 0.85);
  return c.json({ success: true, rule_id: ruleId, persona_id: id });
});

// 7. 调教：注入或更新事实图谱
app.post('/v1/personas/tune/fact', async (c) => {
  const body = await c.req.json();
  const id = body.persona_id || personaManager.getActivePersonaId();
  if (!body.subject || !body.predicate || !body.object) {
    return c.json({ error: 'Missing subject, predicate, or object' }, 400);
  }
  personaManager.tuneAddFact(id, body.subject, body.predicate, body.object, body.valence ?? 0.5);
  return c.json({ success: true, persona_id: id, fact: { subject: body.subject, predicate: body.predicate, object: body.object } });
});

// 8. 重置人设回初始预设
app.post('/v1/personas/reset', async (c) => {
  const body = await c.req.json();
  const id = body.persona_id;
  if (!id) return c.json({ error: 'Missing persona_id' }, 400);
  const ok = personaManager.resetPersonaToPreset(id);
  if (!ok) return c.json({ error: `Preset ${id} not found` }, 404);
  return c.json({ success: true, message: `Persona ${id} reset to factory preset.` });
});

// ==================== 【实时双大模型竞技场 API】 ====================

// 1. 清空竞技场所有模拟与测试数据，恢复纯净
app.post('/v1/arena/reset', (c) => {
  arenaManager.resetArenaData();
  return c.json({ success: true, message: '已彻底清空竞技场所有历史模拟数据与记忆，恢复纯净状态！' });
});

// 2. SSE 实时双 Agent 真实对抗数据流
app.get('/v1/arena/stream', async (c) => {
  const turns = Math.min(30, Math.max(1, Number(c.req.query('turns') || 30)));
  const delayMs = Math.max(100, Number(c.req.query('delay') || 500));

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: 'arena_started',
      data: JSON.stringify({
        message: '纯真实大模型在线对抗已启动！',
        totalTurns: turns,
        model: process.env.CLOUD_MODEL || 'gemini-3.8-flash',
        gateway: process.env.CLOUD_BASE_URL || 'http://127.0.0.1:8045/v1',
      }),
    });

    const conversationHistory: ChatMessage[] = [];
    const turnRecords: any[] = [];
    let recentChapters: string[] = [];

    // 发送当前已存在的篇章状态
    const initialChapters = arenaManager.getChaptersList();
    await stream.writeSSE({
      event: 'chapters_synced',
      data: JSON.stringify({ chapters: initialChapters }),
    });

    for (let t = 1; t <= turns; t++) {
      try {
        const turnResult = await arenaManager.executeLiveTurn(
          t,
          turns,
          conversationHistory,
          recentChapters,
          async (event) => {
            await stream.writeSSE({
              event: event.type,
              data: JSON.stringify(event),
            });
          }
        );
        recentChapters = turnResult.recentChapters;
        turnRecords.push({
          turn: t,
          ...turnResult,
        });

        // 无论何时，向前端推送数据库最新的全部篇章
        const currentChapters = arenaManager.getChaptersList();
        await stream.writeSSE({
          event: 'chapters_synced',
          data: JSON.stringify({ chapters: currentChapters }),
        });

        // 轮间呼吸延时
        if (t < turns && delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (err: any) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ turn: t, error: err.message }),
        });
        break;
      }
    }

    const reportFile = arenaManager.generateLiveReport(turnRecords);
    const finalChapters = arenaManager.getChaptersList();
    await stream.writeSSE({
      event: 'arena_finished',
      data: JSON.stringify({
        message: '30 轮纯真实在线对抗圆满完成！',
        reportPath: reportFile,
        turnCount: turnRecords.length,
        chapters: finalChapters,
      }),
    });
  });
});

// 3. 读取最新狗粮报告
app.get('/v1/arena/report', (c) => {
  const reportPath = path.join(process.cwd(), 'reports', 'dogfood-report-live.md');
  if (fs.existsSync(reportPath)) {
    return c.text(fs.readFileSync(reportPath, 'utf-8'));
  }
  const fallbackPath = path.join(process.cwd(), 'reports', 'dogfood-report-20261106.md');
  if (fs.existsSync(fallbackPath)) {
    return c.text(fs.readFileSync(fallbackPath, 'utf-8'));
  }
  return c.text('# 暂未生成狗粮报告\n请先启动竞技场对决。', 404);
});

// 4. 获取当前篇章列表
app.get('/v1/arena/chapters', (c) => {
  const list = arenaManager.getChaptersList();
  return c.json({ count: list.length, chapters: list });
});

app.post('/v1/chat/completions', async (c) => {
  const body = await c.req.json();
  const targetPersonaId = body.persona_id || c.req.header('x-persona-id') || personaManager.getActivePersonaId();

  const affectEngine = new AffectiveEngine(db, targetPersonaId);
  const rlManager = new ImplicitRLManager(db, targetPersonaId);
  const memoryRetriever = new MemoryRetriever(db, targetPersonaId);
  const compiler = new ContextCompiler(db, targetPersonaId);
  const consolidator = new MemoryConsolidator(db, targetPersonaId);

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
      userFeedbackScore: jevEval.userFeedback.confidence >= 0.50 ? jevEval.userFeedback.value : 0,
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

  c.header('X-Accel-Buffering', 'no');

  let stream: any;
  try {
    const defaultModel = process.env.CLOUD_MODEL || 'gemini-3.8-flash';
    let targetModel = body.model || defaultModel;

    // 智能模型映射与自动回退：
    // 若上游是非 DeepSeek 官方端点，且请求了 deepseek-flash/chat 等虚拟别名，自动映射为当前配置的有效真实模型
    const isDeepSeekUpstream = (process.env.CLOUD_BASE_URL || '').includes('deepseek.com');
    if (!isDeepSeekUpstream && (targetModel.includes('deepseek') || targetModel === 'default' || targetModel === 'auto')) {
      targetModel = defaultModel;
    }

    const isGemini = String(targetModel || '').toLowerCase().includes('gemini');
    const reqPayload: any = {
      ...body,
      model: targetModel,
      messages: compiled.messages,
      temperature: compiled.temperature,
      stream: true,
    };
    if (!isGemini && compiled.presencePenalty > 0) {
      reqPayload.presence_penalty = compiled.presencePenalty;
    }

    stream = await cloudClient.chat.completions.create(reqPayload);
  } catch (apiErr: any) {
    if (pendingSnapshot) {
      try { rlManager.savePendingTurn(pendingSnapshot); } catch {}
    }
    const statusCode = apiErr.status || 500;
    return c.json({
      error: {
        message: apiErr.message || 'Upstream Model API Gateway Error',
        type: apiErr.type || 'api_error',
        code: statusCode,
      },
    }, statusCode);
  }

  return streamSSE(c, async (sseStream) => {
    const parser = new DualStreamParser();
    let extractedHeader: AffectUpdateHeader | null = null;
    let cleanAssistantReply = '';
    let hasToolCalls = false;

    try {
      for await (const part of (stream as any)) {
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
        if (tailFlush) {
          cleanAssistantReply += tailFlush;
          await sseStream.writeSSE({
            data: JSON.stringify({
              choices: [{ delta: { content: tailFlush }, index: 0 }],
            }),
          });
        }
      }
      await sseStream.writeSSE({ data: '[DONE]' });
    } catch (streamErr: any) {
      console.error('[SSE Stream Error]:', streamErr);
      if (pendingSnapshot) {
        try { rlManager.savePendingTurn(pendingSnapshot); } catch {}
      }
      await sseStream.writeSSE({
        data: JSON.stringify({
          error: { message: streamErr.message || 'Stream interrupted', type: 'stream_error' },
        }),
      });
      await sseStream.writeSSE({ data: '[DONE]' });
      return;
    }

    // 5. 异步后置结算：支持 Jev 模式与 Inline 模式双路落盘 (带顶层 try/catch 防护)
    setImmediate(async () => {
      try {
        const effectiveReply = cleanAssistantReply || (hasToolCalls ? '[tool_calls]' : '');

        if (hasToolCalls && !useJevPreDecision && !extractedHeader && pendingSnapshot) {
          rlManager.savePendingTurn(pendingSnapshot);
          return;
        }

        // 优先保存本轮快照供下一轮验收 (立刻保存，避免被 await embedText 拖延导致下一轮快照丢失)
        if (!compiled.isCognitiveOverride && effectiveReply.length > 0) {
          rlManager.savePendingTurn({
            turnId: crypto.randomUUID(),
            userPrompt: userText,
            userPromptEmbedding: Array.from(queryVec),
            assistantReply: effectiveReply,
            moodAtTurn: phasicMood,
            actionPolicy: compiled.activePolicyName,
            referencedEpisodeIds: compiled.referencedEpisodeIds,
            referencedPolicyIds: compiled.referencedPolicyIds,
            timestampMs: Date.now(),
          });
        }

        if (useJevPreDecision && jevEval) {
          // [分支 A: RTX 2070 Jev 模式结算]
          if (pendingSnapshot && jevEval.isTopicShift.prob < 0.72) {
            let effectiveFeedback =
              jevEval.userFeedback.confidence >= 0.50 ? jevEval.userFeedback.value : 0.05;
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

          // 高门槛记忆守门员：仅当 shouldMemorize 概率 >= 0.78 时才写入长期闪回记忆
          if (jevEval.shouldMemorize.prob >= 0.78 && userText.length >= 6 && effectiveReply.length > 0) {
            const conciseSummary = userText.replace(/\s+/g, ' ').slice(0, 45);
            memoryRetriever.commitEpisodicMemory(
              conciseSummary,
              effectiveReply,
              tonicState,
              jevEval.shouldMemorize.prob,
              queryVec,
              effectiveReply
            );
          }
        } else if (extractedHeader) {
          // [分支 B: Inline 首行标签降级模式结算]
          const header = extractedHeader as AffectUpdateHeader;
          rlManager.settlePreviousTurnReward(
            pendingSnapshot,
            header.userFeedbackScore,
            userText,
            queryVec
          );

          const updatedTonic = affectEngine.applyAffectDeltaToTonic(tonicState, {
            ...header,
            activePolicyName: compiled.activePolicyName,
          });

          if (header.memorySummary && header.salience >= 0.35 && effectiveReply.length > 0) {
            const memVec = await embedText(header.memorySummary);
            memoryRetriever.commitEpisodicMemory(
              header.memorySummary,
              effectiveReply,
              updatedTonic,
              header.salience,
              memVec
            );
          }
        }

        // 全量冷归档本轮原文
        if (effectiveReply.length > 0) {
          consolidator.archiveTurn({
            messages: rawMessages,
            userText,
            assistantReply: effectiveReply,
            activePolicyName: compiled.activePolicyName,
            tonicMood: { p: tonicState.p, a: tonicState.a, d: tonicState.d },
          });
        }
      } catch (bgErr) {
        console.error('[CRITICAL Background Task Error]:', bgErr);
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
