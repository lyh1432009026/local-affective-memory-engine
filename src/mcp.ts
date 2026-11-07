import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import { initDatabase } from './db/client';
import { embedText } from './engine/embedding';
import { AffectiveEngine } from './engine/affective-ssm';
import { MemoryRetriever } from './engine/memory-retriever';
import { MemoryConsolidator } from './engine/memory-consolidation';
import { PersonaManager } from './engine/persona-manager';

const dbPath = path.join(process.cwd(), 'data', 'cognitive_core.db');
const db = initDatabase(dbPath);
const personaManager = new PersonaManager(db);

const server = new Server(
  {
    name: 'local-affective-memory-engine',
    version: '2.4.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// 1. 列出可供主流 Agent 工具调用的 MCP Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_affective_memory',
        description: '通过本地语义向量与心境一致性检索长期记忆（L1闪回情景记忆），高相关度时自动展开完整长文本载荷。',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '用于检索记忆的自然语言查询句' },
            limit: { type: 'number', description: '返回记忆条数上限 (默认 4 条)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_affective_state',
        description: '获取当前伴生角色的三维 PAD 情感状态（愉悦度P、唤醒度A、掌控度D）、慢变量关系账本（亲密度、信任度）以及当前激活的行为决策姿态。',
        inputSchema: {
          type: 'object',
          properties: {
            persona_id: { type: 'string', description: '角色 ID (选填，默认读取当前全局激活人设)' },
          },
        },
      },
      {
        name: 'record_cognitive_fact',
        description: '向认知实体图谱注入一条主谓宾三元组事实（如：刘二蛋 喜好 独立游戏），同主谓新事实会自动覆写过期设定。',
        inputSchema: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: '主体' },
            predicate: { type: 'string', description: '关系/谓语' },
            object: { type: 'string', description: '客体/客体事实' },
            persona_id: { type: 'string', description: '角色 ID (选填，默认当前激活人设)' },
          },
          required: ['subject', 'predicate', 'object'],
        },
      },
      {
        name: 'switch_persona_soul',
        description: '动态切换全局激活的人设灵魂（支持：kunkun/坤坤、lu_xueqi/陆雪琪、wen_yan/温言、chen_gong/尧桑、zhou_lan/周岚）。',
        inputSchema: {
          type: 'object',
          properties: {
            persona_id: {
              type: 'string',
              description: '目标角色 ID (kunkun | lu_xueqi | wen_yan | chen_gong | zhou_lan)',
            },
          },
          required: ['persona_id'],
        },
      },
      {
        name: 'trigger_sleep_consolidation',
        description: '手动触发仿生睡眠巩固与阶段叙事篇章提炼，将高相似冗余碎片聚类合并去重，生成阶段脉络。',
        inputSchema: {
          type: 'object',
          properties: {
            persona_id: { type: 'string', description: '角色 ID (选填)' },
          },
        },
      },
    ],
  };
});

// 2. 执行 MCP Tool 调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const currentPersonaId = (args?.persona_id as string) || personaManager.getActivePersonaId();

  const affectEngine = new AffectiveEngine(db, currentPersonaId);
  const memoryRetriever = new MemoryRetriever(db, currentPersonaId);
  const consolidator = new MemoryConsolidator(db, currentPersonaId);

  switch (name) {
    case 'query_affective_memory': {
      const query = String(args?.query || '');
      const limit = Number(args?.limit || 4);
      if (!query.trim()) {
        return { content: [{ type: 'text', text: '查询内容不能为空' }] };
      }

      const vec = await embedText(query);
      const tonic = affectEngine.getTonicStateWithTimeDecay();
      const hits = memoryRetriever.retrieveHybridMemories(vec, tonic, limit);

      const formatted = hits.map((h, i) => {
        const isLong = h.semantic_sim >= 0.72 && h.full_payload.length > 60;
        return `[记忆 ${i + 1}] 相似度:${(h.semantic_sim * 100).toFixed(1)}% | 权重:${h.salience.toFixed(2)}\n摘要: ${h.summary}\n${isLong ? `完整内容: ${h.full_payload}\n` : ''}`;
      }).join('\n---\n');

      return {
        content: [{ type: 'text', text: formatted || '未检索到高度相关的历史记忆。' }],
      };
    }

    case 'get_affective_state': {
      const tonic = affectEngine.getTonicStateWithTimeDecay();
      const profile = personaManager.getPersona(currentPersonaId);
      const output = {
        persona_id: currentPersonaId,
        persona_name: profile?.name || '未知',
        tonic_pad: {
          pleasure: tonic.p,
          arousal: tonic.a,
          dominance: tonic.d,
        },
        relationship_ledger: {
          intimacy: `${(tonic.intimacy * 100).toFixed(1)}%`,
          trust: `${(tonic.trust * 100).toFixed(1)}%`,
        },
        active_behavior_policy: tonic.lastActivePolicy,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      };
    }

    case 'record_cognitive_fact': {
      const sub = String(args?.subject || '');
      const pred = String(args?.predicate || '');
      const obj = String(args?.object || '');
      personaManager.tuneAddFact(currentPersonaId, sub, pred, obj, 0.8);
      return {
        content: [{ type: 'text', text: `成功向人设 [${currentPersonaId}] 知识图谱注入事实：(${sub}) -[${pred}]-> (${obj})` }],
      };
    }

    case 'switch_persona_soul': {
      const targetId = String(args?.persona_id || '');
      const ok = personaManager.setActivePersona(targetId);
      if (ok) {
        const p = personaManager.getPersona(targetId);
        return {
          content: [{ type: 'text', text: `成功切换全局激活人设为: [${p?.name}] (${targetId}) - 定位: ${p?.role_definition}` }],
        };
      }
      return {
        content: [{ type: 'text', text: `未能切换到人设 [${targetId}]，未找到对应预设。` }],
      };
    }

    case 'trigger_sleep_consolidation': {
      consolidator.maybeConsolidateOnWakeup();
      const chapters = consolidator.getRecentChapters(3);
      return {
        content: [{ type: 'text', text: `仿生睡眠聚类巩固已触发！最新阶段叙事篇章:\n${chapters.join('\n\n') || '当前轮次尚不足以提炼新篇章。'}` }],
      };
    }

    default:
      throw new Error(`Unknown MCP Tool: ${name}`);
  }
});

// 3. 列出只读 Resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'memory://chapters/recent',
        name: 'Recent Narrative Chapters',
        description: '最近提炼的阶段叙事篇章摘要列表，用于长窗口上下文对齐',
        mimeType: 'text/plain',
      },
    ],
  };
});

// 4. 读取 Resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  if (uri === 'memory://chapters/recent') {
    const consolidator = new MemoryConsolidator(db, personaManager.getActivePersonaId());
    const chapters = consolidator.getRecentChapters(5);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: chapters.join('\n\n---\n\n') || '暂无已归档篇章',
        },
      ],
    };
  }
  throw new Error(`Resource not found: ${uri}`);
});

// 5. 启动标准 stdio 传输
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP Server] Local Affective & Memory Engine MCP Service running on stdio');
}

run().catch((err) => {
  console.error('[MCP Server Error]', err);
  process.exit(1);
});
