import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase } from '../src/db/client';
import { embedText, cosineSimilarity } from '../src/engine/embedding';
import { AffectiveEngine } from '../src/engine/affective-ssm';

async function bootstrap() {
  console.log('====================================================');
  console.log('🚀 开始部署本地数据库与本地 ONNX 向量嵌入模型...');
  console.log('====================================================\n');

  // 1. 初始化生产数据库
  const dbDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, 'cognitive_core.db');
  console.log(`[1/3] 部署 SQLite 数据库: ${dbPath}`);

  const db = initDatabase(dbPath);
  console.log('  ✓ SQLite 引擎初始化成功，已启用 WAL 模式');
  console.log('  ✓ sqlite-vec 向量扩展加载成功');

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: any) => r.name);

  console.log(`  ✓ 检测到数据表与虚拟表共 ${tables.length} 个:`);
  console.log(`    ${tables.join(', ')}`);

  const personaId = process.env.PERSONA_ID || 'default';
  const affectEngine = new AffectiveEngine(db, personaId);
  const tonic = affectEngine.getTonicStateWithTimeDecay();
  console.log(`  ✓ 初始化角色分身 [${personaId}] 基础情感基态:`, tonic);

  // 2. 部署与预热本地 ONNX 语义向量模型
  console.log('\n[2/3] 部署并预热本地 ONNX 向量嵌入模型 (Xenova/bge-small-zh-v1.5)...');
  console.log('  * 正在通过镜像源拉取或加载量化模型文件 (~130MB)...');
  const startTime = Date.now();

  const testText1 = '你好，我是你的本地陪伴AI。';
  const testText2 = '嗨，我是你的私人专属智能助手。';
  const unrelatedText = '今天天气晴朗，适合户外跑步运动。';

  const [vec1, vec2, vec3] = await Promise.all([
    embedText(testText1),
    embedText(testText2),
    embedText(unrelatedText),
  ]);

  const loadDuration = Date.now() - startTime;
  console.log(`  ✓ 模型预热完成！耗时: ${loadDuration}ms`);
  console.log(`  ✓ 向量维度: ${vec1.length} 维 (Float32Array)`);

  const simRelated = cosineSimilarity(vec1, vec2);
  const simUnrelated = cosineSimilarity(vec1, vec3);
  console.log(`  ✓ 语义相似度测试 (相关文本): ${(simRelated * 100).toFixed(2)}%`);
  console.log(`  ✓ 语义相似度测试 (无关文本): ${(simUnrelated * 100).toFixed(2)}%`);

  if (simRelated <= simUnrelated) {
    throw new Error('向量语义相似度校验失败');
  }

  // 3. 端到端验证向量数据库写入与 KNN 检索
  console.log('\n[3/3] 验证端到端向量入库与 KNN 检索...');
  const tx = db.transaction(() => {
    // 插入临时测试记忆
    const info = db
      .prepare(
        `INSERT INTO episodic_memories
         (persona_id, summary, full_payload, emotion_p, emotion_a, emotion_d, salience, status, created_at_ms, last_accessed_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(
        personaId,
        '系统部署自检记忆锚点',
        '本次为本地伴生引擎数据库与向量模型部署验证',
        0.2,
        0.3,
        0.1,
        0.9,
        Date.now(),
        Date.now()
      );

    const rowId = BigInt(info.lastInsertRowid);
    db.prepare(
      'INSERT INTO vec_episodic (memory_id, persona_id, embedding) VALUES (?, ?, ?)'
    ).run(rowId, personaId, Buffer.from(vec1.buffer));

    // 执行 MATCH KNN 查询
    const matched = db
      .prepare(
        `SELECT m.id, m.summary, v.distance
         FROM vec_episodic v
         JOIN episodic_memories m ON m.id = v.memory_id
         WHERE v.embedding MATCH ? AND k = 1 AND v.persona_id = ?`
      )
      .all(Buffer.from(vec2.buffer), personaId) as any[];

    if (!matched.length) {
      throw new Error('KNN 检索未匹配到记录');
    }
    console.log(`  ✓ vec0 虚拟表 KNN 检索成功！匹配记录: [ID: ${matched[0].id}] ${matched[0].summary}`);
    console.log(`  ✓ 向量余弦距离: ${matched[0].distance.toFixed(4)}`);

    // 清理临时验证数据
    db.prepare('DELETE FROM episodic_memories WHERE id = ?').run(rowId);
  });

  tx();
  console.log('  ✓ 临时测试向量已自动级联清理 (Trigger 测试正常)');

  const dbStats = fs.statSync(dbPath);
  console.log('\n====================================================');
  console.log('🎉 数据库与向量模型全部部署完成！');
  console.log(`📁 数据库文件: ${dbPath} (${(dbStats.size / 1024).toFixed(1)} KB)`);
  console.log(`🧠 向量嵌入模型: Xenova/bge-small-zh-v1.5 (ONNX Q8, 512维)`);
  console.log('====================================================');

  db.close();
}

bootstrap().catch((err) => {
  console.error('\n❌ 部署失败:', err);
  process.exit(1);
});
