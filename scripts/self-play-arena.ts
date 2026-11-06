import 'dotenv/config';
import path from 'node:path';
import { initDatabase } from '../src/db/client';
import { LiveArenaManager, LiveTurnEvent } from '../src/arena/live-arena';
import { ChatMessage } from '../src/engine/context-compiler';

async function main() {
  console.log('\n================================================================');
  console.log('⚔️  【本地记忆与情感伴生引擎 v2.4】纯真实自对决竞技场');
  console.log('🎭  对决双方: “挑剔架构师·马库斯” VS “贴报错业务开发·小张”');
  console.log(`🤖  模型端点: ${process.env.CLOUD_BASE_URL || 'http://127.0.0.1:8045/v1'}`);
  console.log(`🧠  驱动模型: ${process.env.CLOUD_MODEL || 'gemini-3.8-flash'} (100% 真实在线生成，零模拟数据)`);
  console.log('⚡  特殊机制: 第 20 轮执行强制上下文截断，检验抗压缩与篇章灵魂重锚定');
  console.log('================================================================\n');

  const dbPath = path.join(process.cwd(), 'data', 'cognitive_core.db');
  const db = initDatabase(dbPath);
  const arenaManager = new LiveArenaManager(db);

  // 1. 物理清空所有历史模拟数据与脏数据
  console.log('🧹 正在清空历史模拟数据与脏记忆，恢复出厂纯净状态...');
  arenaManager.resetArenaData();
  console.log('✓ 数据清理完毕，就绪启动真实 30 轮在线互怼！\n');

  const totalTurns = 30;
  const conversationHistory: ChatMessage[] = [];
  const turnRecords: any[] = [];
  let recentChapters: string[] = [];

  for (let t = 1; t <= totalTurns; t++) {
    console.log(`----------------------------------------------------------------`);
    console.log(`🚩 【第 ${t.toString().padStart(2, '0')}/${totalTurns} 轮真实交锋】`);

    try {
      const turnResult = await arenaManager.executeLiveTurn(
        t,
        totalTurns,
        conversationHistory,
        recentChapters,
        (event: LiveTurnEvent) => {
          if (event.type === 'dev_speaking') {
            console.log(`👤 【业务开发·小张】:\n${event.data.content.trim()}`);
          } else if (event.type === 'truncation_event') {
            console.log(`\n⚡⚡⚡ [第 20 轮上下文硬截断触发] ⚡⚡⚡`);
            console.log(`* 客户端达到 Token 硬上限，对话历史从 ${event.data.preCount} 条压缩至 ${event.data.postCount} 条！`);
            console.log(`* 伴生引擎捕获上下文坍塌，正在提炼《阶段叙事篇章》...`);
          } else if (event.type === 'cognition_calculated') {
            if (event.data.recalledMemories && event.data.recalledMemories.length > 0) {
              console.log(`🔍 【向量记忆唤醒】: 命中 ${event.data.recalledMemories.length} 条 | Top-1: "${event.data.recalledMemories[0].summary}" (得权重: ${event.data.recalledMemories[0].final_score.toFixed(3)})`);
            }
          } else if (event.type === 'architect_speaking') {
            console.log(`🤖 【挑剔架构师·马库斯】:\n${event.data.cleanReply.trim()}`);
            const tonic = event.data.updatedTonic;
            console.log(`📊 【伴生动力学指标】: 姿态: [${turnResult?.activePolicy || '计算中'}] | P(愉悦): ${tonic.p.toFixed(3)} | A(唤醒): ${tonic.a.toFixed(3)} | D(支配): ${tonic.d.toFixed(3)} | 亲密: ${(tonic.intimacy * 100).toFixed(1)}% | 信任: ${(tonic.trust * 100).toFixed(1)}%`);
          }
        }
      );

      recentChapters = turnResult.recentChapters;
      turnRecords.push({
        turn: t,
        ...turnResult,
      });

    } catch (err: any) {
      console.error(`❌ 第 ${t} 轮执行中断:`, err.message);
      break;
    }
  }

  // 生成最新真实报告
  console.log('\n================================================================');
  console.log('📈  30 轮纯真实在线对抗完成，正在导出真实狗粮报告...');
  const reportPath = arenaManager.generateLiveReport(turnRecords);
  console.log(`📄 【报告已生成】: ${reportPath}`);
  console.log('================================================================\n');

  db.close();
}

main().catch((err) => {
  console.error('Fatal Arena Error:', err);
  process.exit(1);
});
