import 'dotenv/config';
import path from 'node:path';
import { initDatabase } from '../src/db/client';
import { PersonaManager } from '../src/engine/persona-manager';

const dbPath = path.join(process.cwd(), 'data', 'cognitive_core.db');
const db = initDatabase(dbPath);
const pm = new PersonaManager(db);

const args = process.argv.slice(2);
const command = args[0] || 'list';

function printHelp() {
  console.log(`
人设调教模块 CLI 管理工具 (Persona Tuning CLI)
==============================================
用法:
  npm run persona -- list                        查看所有人设列表与当前激活人设
  npm run persona -- show [persona_id]           查看指定人设的详细档案、情感基态、行为法则与事实图谱
  npm run persona -- switch <persona_id>         切换当前激活人设（如 kunkun / lu_xueqi / miao_miao / nova / su_qing）
  npm run persona -- style <persona_id> <口吻风格> 调教人设表达口吻与句式特征
  npm run persona -- add-rule <id> <触发语境> <行为法则>   调教/新增一条自反思行为法则
  npm run persona -- add-fact <id> <主语> <谓语> <宾语>   调教/注入一条认知实体事实
  npm run persona -- reset <persona_id>          重置指定人设恢复出厂预设
`);
}

switch (command) {
  case 'list': {
    const activeId = pm.getActivePersonaId();
    const list = pm.listPersonas();
    console.log('\n🎭 系统已注册人设列表:');
    console.log('----------------------------------------------------');
    for (const p of list) {
      const isAct = p.persona_id === activeId ? '★ [当前激活]' : '  ';
      console.log(`${isAct} ID: ${p.persona_id.padEnd(16)} 名称: ${p.name}`);
      console.log(`     定位: ${p.role_definition}`);
      console.log(`     口吻: ${p.tone_style}`);
      console.log('----------------------------------------------------');
    }
    break;
  }

  case 'show': {
    const id = args[1] || pm.getActivePersonaId();
    const details = pm.getPersonaFullDetails(id);
    if (!details) {
      console.error(`❌ 未找到人设: ${id}`);
      process.exit(1);
    }
    const p = details.profile;
    console.log(`\n================== 🎭 人设档案: ${p.name} (${p.persona_id}) ==================`);
    console.log(`【状态】: ${p.is_active ? '★ 当前全局激活' : '非激活'}`);
    console.log(`【身份定位】: ${p.role_definition}`);
    console.log(`【口吻特征】: ${p.tone_style}`);
    console.log(`【人设禁忌】: ${p.boundaries_taboos}`);
    console.log(`【与主人的认知关系】: ${p.relationship_with_user}`);
    if (p.system_prompt_appendix) {
      console.log(`【核心置顶指令】: ${p.system_prompt_appendix}`);
    }

    if (details.affective_state) {
      const a = details.affective_state;
      console.log('\n【情感动力学持久基态 (Tonic State)】:');
      console.log(`  P(愉悦): ${a.p_pleasure} | A(专注唤醒): ${a.a_arousal} | D(掌控自信): ${a.d_dominance}`);
      console.log(`  亲密度: ${(a.intimacy * 100).toFixed(1)}% | 信任度: ${(a.trust * 100).toFixed(1)}% | 上次姿态: ${a.last_active_policy}`);
    }

    console.log(`\n【自反思行为法则 (${details.behavioral_rules.length}条)】:`);
    for (const r of details.behavioral_rules) {
      console.log(`  - [置信度: ${(r.confidence * 100).toFixed(0)}%] 当[${r.trigger_condition}]时 -> ${r.policy_directive}`);
    }

    console.log(`\n【活跃认知图谱事实 (${details.relational_facts.length}条)】:`);
    for (const f of details.relational_facts) {
      console.log(`  - (${f.subject}) --[${f.predicate}]--> (${f.object})`);
    }
    console.log('========================================================================\n');
    break;
  }

  case 'switch': {
    const id = args[1];
    if (!id) {
      console.error('❌ 请提供目标人设 ID，例如: npm run persona -- switch kunkun');
      process.exit(1);
    }
    const ok = pm.setActivePersona(id);
    if (ok) {
      const p = pm.getPersona(id);
      console.log(`✅ 成功切换激活人设为: 【${p?.name}】(${id})`);
    } else {
      console.error(`❌ 切换失败，不存在该人设: ${id}`);
    }
    break;
  }

  case 'style': {
    const id = args[1];
    const newStyle = args.slice(2).join(' ');
    if (!id || !newStyle) {
      console.error('❌ 语法: npm run persona -- style <persona_id> <新语言风格口吻>');
      process.exit(1);
    }
    const ok = pm.tuneToneStyle(id, newStyle);
    if (ok) {
      console.log(`✅ 成功调教人设 [${id}] 的口吻风格为:\n  "${newStyle}"`);
    } else {
      console.error(`❌ 未找到人设: ${id}`);
    }
    break;
  }

  case 'add-rule': {
    const id = args[1];
    const trigger = args[2];
    const directive = args[3];
    if (!id || !trigger || !directive) {
      console.error('❌ 语法: npm run persona -- add-rule <persona_id> <触发语境> <行为法则执行指令>');
      process.exit(1);
    }
    const ruleId = pm.tuneAddRule(id, trigger, directive, 0.9);
    console.log(`✅ 成功向人设 [${id}] 注入行为法则 [ID: ${ruleId}]:`);
    console.log(`   当 [${trigger}] 时 -> ${directive}`);
    break;
  }

  case 'add-fact': {
    const id = args[1];
    const s = args[2];
    const p = args[3];
    const o = args[4];
    if (!id || !s || !p || !o) {
      console.error('❌ 语法: npm run persona -- add-fact <persona_id> <主语> <谓语> <宾语>');
      process.exit(1);
    }
    pm.tuneAddFact(id, s, p, o, 0.8);
    console.log(`✅ 成功向人设 [${id}] 注入事实图谱:`);
    console.log(`   (${s}) --[${p}]--> (${o})`);
    break;
  }

  case 'reset': {
    const id = args[1];
    if (!id) {
      console.error('❌ 请指定要重置的人设 ID，例如: npm run persona -- reset kunkun');
      process.exit(1);
    }
    const ok = pm.resetPersonaToPreset(id);
    if (ok) {
      console.log(`✅ 成功将人设 [${id}] 重置恢复为出厂预设值！`);
    } else {
      console.error(`❌ 未找到预设模板: ${id}`);
    }
    break;
  }

  case 'help':
  default:
    printHelp();
    break;
}

db.close();
