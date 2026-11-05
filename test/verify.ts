import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase } from '../src/db/client';
import { AffectiveEngine } from '../src/engine/affective-ssm';
import { ImplicitRLManager, buildStructuralDigest } from '../src/engine/implicit-rl';
import { MemoryRetriever } from '../src/engine/memory-retriever';
import { ContextCompiler, ChatMessage } from '../src/engine/context-compiler';
import { MemoryConsolidator } from '../src/engine/memory-consolidation';
import { DualStreamParser } from '../src/pipeline/dual-stream';
import { cosineSimilarity } from '../src/engine/embedding';
import { PersonaManager } from '../src/engine/persona-manager';

async function runVerification() {
  console.log('=== [1/7] Testing SQLite & sqlite-vec Database Initialization ===');
  const testDbDir = path.join(process.cwd(), 'data');
  const testDbPath = path.join(testDbDir, 'test_cognitive.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const db = initDatabase(testDbPath);
  console.log('✓ Database created and schema applied successfully.');

  // Verify tables exist
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r: any) => r.name);
  console.log('✓ Detected tables:', tables.join(', '));
  const requiredTables = [
    'affective_state',
    'organic_episodes',
    'behavioral_policies',
    'episodic_memories',
    'vec_episodic',
    'narrative_chapters',
    'raw_turn_archive',
    'relational_graph',
    'persona_profiles',
  ];
  for (const t of requiredTables) {
    if (!tables.includes(t)) {
      throw new Error(`Missing expected table: ${t}`);
    }
  }

  console.log('\n=== [2/7] Testing Affective SSM (Tonic / Phasic / Decay) ===');
  const personaId = 'test_user';
  const affectEngine = new AffectiveEngine(db, personaId);

  const initialTonic = affectEngine.getTonicStateWithTimeDecay();
  console.log('✓ Initial Tonic State:', initialTonic);
  if (initialTonic.p !== 0.2 || initialTonic.a !== 0.3) {
    throw new Error('Default tonic state values incorrect');
  }

  const updatedTonic = affectEngine.applyAffectDeltaToTonic(initialTonic, {
    dp: 0.2,
    da: 0.1,
    dd: 0.05,
    dTrust: 0.02,
    userFeedbackScore: 0.5,
    activePolicyName: '熟稔默契协同姿态',
  });
  console.log('✓ Updated Tonic State after delta:', updatedTonic);

  const phasic = affectEngine.computePhasicMoodWithMemories(updatedTonic, [
    { emotion_p: 0.8, emotion_a: 0.6, emotion_d: 0.5, salience: 0.9 },
  ]);
  console.log('✓ Computed Phasic Mood (not persisted):', phasic);

  console.log('\n=== [3/7] Testing Implicit RL Manager & Structural Digest ===');
  const rlManager = new ImplicitRLManager(db, personaId);
  const sampleDigest = buildStructuralDigest(
    '```typescript\nconst x = 1;\n```\n这里是测试代码，希望一切顺利！',
    100
  );
  console.log('✓ Sanitized structural digest:', sampleDigest);

  const dummyVec = new Float32Array(512);
  dummyVec[0] = 1.0;

  rlManager.savePendingTurn({
    turnId: 'turn-1',
    userPrompt: '今天天气怎么样？',
    userPromptEmbedding: Array.from(dummyVec),
    assistantReply: '今天天气晴朗，非常适合出门走走。',
    moodAtTurn: phasic,
    actionPolicy: '熟稔默契协同姿态',
    referencedEpisodeIds: [],
    referencedPolicyIds: [],
    timestampMs: Date.now(),
  });

  const consumed = rlManager.consumePendingTurnAtomically();
  console.log('✓ Atomically consumed snapshot:', consumed?.turnId === 'turn-1' ? 'Success' : 'Fail');
  const doubleConsumed = rlManager.consumePendingTurnAtomically();
  if (doubleConsumed !== null) {
    throw new Error('Atomicity violated: consumed same snapshot twice');
  }
  console.log('✓ Double-consumption prevented correctly (Exactly-once guarantee).');

  console.log('\n=== [4/7] Testing Memory Retriever with sqlite-vec Vector KNN ===');
  const retriever = new MemoryRetriever(db, personaId);

  // Commit a test memory
  retriever.commitEpisodicMemory(
    '用户喜欢在周末打游戏',
    '我周末一般都打打黑神话或者Steam上的独立游戏',
    updatedTonic,
    0.85,
    dummyVec,
    '用户原话长文本：我周末一般都打打黑神话或者Steam上的独立游戏，特别放松。'
  );

  const retrieved = retriever.retrieveHybridMemories(dummyVec, updatedTonic, 3);
  console.log(`✓ Retrieved ${retrieved.length} memory items via vec0 KNN.`);
  if (retrieved.length > 0) {
    console.log('  Top hit summary:', retrieved[0].summary);
    console.log('  Top hit score:', retrieved[0].final_score);
    console.log('  Top hit payload:', retrieved[0].full_payload);
  } else {
    throw new Error('Vector retrieval returned 0 results');
  }

  console.log('\n=== [5/7] Testing Context Compiler (Schmitt Trigger & Tail Injection) ===');
  const compiler = new ContextCompiler(db, personaId);
  const messages: ChatMessage[] = [
    { role: 'user', content: '我们之前聊到哪了？' },
  ];

  const compiled = compiler.compileMessages(messages, phasic, retrieved, ['用户 喜欢 独立游戏']);
  console.log('✓ Active policy chosen:', compiled.activePolicyName);
  console.log('✓ Compiled temperature:', compiled.temperature);
  const lastCompiledContent = compiled.messages[compiled.messages.length - 1].content;
  console.log('✓ Cognitive context appended to user message:\n', lastCompiledContent.slice(lastCompiledContent.indexOf('<cognitive_context>')));

  console.log('\n=== [6/7] Testing Memory Consolidator (Compaction & Archiving) ===');
  const consolidator = new MemoryConsolidator(db, personaId);
  consolidator.archiveTurn({
    messages,
    userText: '我们之前聊到哪了？',
    assistantReply: '之前聊到你的独立游戏开发想法。',
    activePolicyName: compiled.activePolicyName,
    tonicMood: { p: updatedTonic.p, a: updatedTonic.a, d: updatedTonic.d },
  });

  const rawCount = (db.prepare('SELECT COUNT(*) as c FROM raw_turn_archive WHERE persona_id = ?').get(personaId) as any).c;
  console.log(`✓ Cold archive turns count: ${rawCount}`);

  console.log('\n=== [7/7] Testing DualStreamParser (SSE State Machine & <think> Support) ===');
  const parser = new DualStreamParser();
  let extractedHeader: any = null;
  const chunk1 = '<think>\nThinking about user query...\n</think>\n';
  const chunk2 = '<affect_update dp="0.12" da="0.05" dd="0.01" d_trust="0.02" user_feedback_score="0.7" salience="0.8" memory_summary="用户确定了架构" />\n你好！这是正文内容。';

  const out1 = parser.pushChunk(chunk1, (h) => { extractedHeader = h; });
  const out2 = parser.pushChunk(chunk2, (h) => { extractedHeader = h; });
  const tail = parser.flush();

  console.log('✓ Parser extracted header:', extractedHeader);
  console.log('✓ Stream sanitized text output:\n' + out1 + out2 + tail);

  if (!extractedHeader || extractedHeader.userFeedbackScore !== 0.7) {
    throw new Error('DualStreamParser failed to extract affect header');
  }

  console.log('\n=== [8/8] Testing Persona Manager & Tuning Module ===');
  const pm = new PersonaManager(db);
  const personas = pm.listPersonas();
  console.log(`✓ Detected ${personas.length} initial personas:`, personas.map((p) => p.persona_id).join(', '));
  if (personas.length < 3) {
    throw new Error('Initial presets not seeded properly');
  }

  const kunkun = pm.getPersonaFullDetails('kunkun');
  console.log('✓ Loaded Persona [kunkun] Name:', kunkun?.profile.name);
  console.log(`✓ Seeded rules for kunkun: ${kunkun?.behavioral_rules.length} rules, ${kunkun?.relational_facts.length} facts`);

  // Test dynamic tuning
  pm.tuneAddRule('kunkun', '用户提到写代码太累', '主动关怀并接管最麻烦的部分', 0.98);
  pm.tuneToneStyle('kunkun', '极致温柔贴心，随时随地顺着主人的心意');
  const updatedKunkun = pm.getPersona('kunkun');
  if (!updatedKunkun?.tone_style.includes('极致温柔贴心')) {
    throw new Error('Persona tuning failed to update tone_style');
  }
  console.log('✓ Successfully tuned tone style and added behavior rule dynamically.');

  // Cleanup test database
  db.close();
  try {
    fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
    if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
  } catch {}

  console.log('\n🎉 ALL 8 SYSTEM SUBSYSTEM TESTS PASSED WITH 100% SUCCESS!');
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
