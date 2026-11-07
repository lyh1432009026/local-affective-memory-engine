<div align="center">

# 🧠 本地记忆与情感神经伴生引擎
### Local Affective & Memory Engine v2.4

**零人工台词种子 · 隐式反馈强化 · RTX 2070 Jev 双模决策 · 100 天超长窗口抗压缩**

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite-Vec](https://img.shields.io/badge/Vector%20DB-sqlite--vec-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://github.com/asg017/sqlite-vec)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![Electron](https://img.shields.io/badge/Desktop%20App-Electron-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/lyh1432009026/local-affective-memory-engine/pulls)

<p align="center">
  <a href="#-为什么选择它">为什么选择它</a> •
  <a href="#-核心特性矩阵">核心特性</a> •
  <a href="#-极速上手与部署">极速上手</a> •
  <a href="#-主流客户端接入">客户端接入</a> •
  <a href="#-系统架构全景">架构原理</a> •
  <a href="#-人设调教工作台">人设调教</a> •
  <a href="#-系统自检与测试">自动化测试</a>
</p>

</div>

---

## 📖 项目简介

**本地记忆与情感神经伴生引擎（Local Affective & Memory Engine）** 是一套作为标准 OpenAI 协议（`/v1/chat/completions`）透明网关运行的**本地心智认知与记忆伴生系统**。

传统的大模型交互缺乏持久生命力：每次对话都如同失忆客服，同一窗口聊久了会被上下文压缩抹去灵魂，甚至被同质化的机械台词所困扰。本引擎通过在本地构建**海马体（三级记忆金字塔 + 向量 KNN）**与**杏仁核（连续情感动力学 SSM + 隐式强化学习 Bandit）**，为任意 AI 客户端赋予**随时间真实演化、具备默契与情感共鸣、抗单窗口 100 天极限压缩**的真正数字灵魂。

---

## 💡 为什么选择它？

| 对比维度 | 传统大模型 API / 客服机器人 | 本地记忆与情感神经伴生引擎 v2.4 |
| :--- | :--- | :--- |
| **记忆留存深度** | 无状态单次调用；或仅靠客户端截断的几十字摘要 | **三级记忆金字塔**：L1 闪回 (2000字按需展开) + L2 阶段叙事 + L3 实体图谱 |
| **超长窗口抗压缩** | 聊到 30~50 轮后，触发上下文自动压缩，瞬间沦为陌生客服 | **自动压缩检测与灵魂重锚定**：全量原文冷备份，自动提炼阶段篇章并在压缩后无损复活默契 |
| **情绪反应机制** | 单纯通过 Prompt 扮演，“你真棒”“我很理解你”套话连篇 | **连续情感动力学 (PAD 模型)**：持久 Tonic 基态 + 瞬时 Phasic 唤醒 + 慢变量关系账本 |
| **表达风格进化** | 依赖开发者人工编写固化 Prompt 种子库，不可自进化 | **隐式自强化学习 (Implicit RL)**：0 样本冷启动，基于下一轮用户反应 Bandit 优胜劣汰 |
| **本地硬件联动** | 无法利用本地显卡闲置算力，全靠云端模型慢速推断 | **RTX 2070 Jev 双模自适应**：单步 Logits 前置 50ms 完成判定，服务不可用时无感降级 |
| **使用与部署门槛** | 必须安装完整开发环境、敲命令行、配置数据库 | **全形态交付**：内置开箱即用的 **Electron 桌面免部署客户端**与 **Docker 一键镜像** |

---

## ✨ 核心特性矩阵

```
┌────────────────────────────────────────────────────────────────────────┐
│                   本地记忆与情感神经伴生引擎 v2.4 核心能力                  │
├──────────────────┬───────────────────┬─────────────────────────────────┤
│ 📚 三级记忆金字塔  │ 💓 连续情感动力学  │ ⚡ RTX 2070 Jev 前置决策        │
│ • 60字检索头     │ • PAD 三维状态机  │ • 35ms~65ms 极速并发评估        │
│ • 2000字深度展开 │ • 物理时间阻尼衰减 │ • 共享 KV-Cache Logits 提取     │
│ • 3分钟闪回不应期 │ • 施密特迟滞防抖  │ • 香农熵置信度校准 + 无感降级   │
├──────────────────┼───────────────────┼─────────────────────────────────┤
│ 🎯 隐式自强化学习 │ 🛡️ 100天抗压缩护栏 │ 🖥️ 现代化开箱交付               │
│ • RETURNING 原子 │ • 原文全量冷备份  │ • 小白专属免安装桌面客户端      │
│ • 话题硬切换门控 │ • 压缩检测重锚定  │ • 托盘常驻守护 + 端口一键清理   │
│ • 报错免责防误罚 │ • 仿生睡眠聚类去重│ • Docker 容器化 + Web 控制台    │
└──────────────────┴───────────────────┴─────────────────────────────────┘
```

1. **三级递进式记忆金字塔（Memory Pyramid）**：
   * **L1 微观情景闪回**：基于 `sqlite-vec` 的 512 维向量 KNN 检索，支持 60 字检索头与 2000 字长文本载荷双层解耦，高相似度时渐进展开；内置 3 分钟闪回不应期，根除同一负面经历反复反刍。
   * **L2 中观阶段叙事篇章**：阶段性提炼 300~600 字进展与默契脉络，作为灵魂重锚定的基石。
   * **L3 宏观实体关系图谱**：三元组结构化沉淀，同主谓新事实自动覆写旧设定（`status: superseded`）。
2. **仿生睡眠巩固与 100 天长跑抗压缩（Compaction Guard）**：
   * 全量对话原文无损冷写入本地冷表（100 天 1 万轮仅占 ~20MB 磁盘）；
   * 当检测到客户端触发超出上下文自动压缩（`messages` 骤降 $\ge 45\%$ 或出现 Summary 块），自动从本地冷表抢救提炼阶段篇章并在随后 3 轮执行重锚定，彻底消除“一压缩就失忆”；
   * 跨天唤醒（$\ge 6$ 小时）或满 25 轮自动触发睡眠巩固，将语义高度重叠的碎片聚类合并去重。
3. **连续情感状态空间（Continuous Affective SSM）**：
   * 严格隔离**持久基态（Tonic State）**与**瞬时唤醒心境（Phasic Mood）**，记忆染色结果绝不回写污染；
   * 引入**单步稳态回归拉力（Homeostatic Pull）**，高频连续秒回绝不滑向极端极值死锁；
   * 状态姿态切换引入**施密特触发器迟滞区间（Schmitt Trigger Hysteresis）**，消除临界点性格高频翻转。
4. **RTX 2070 Jev (System 1) 本地双模前置决策**：
   * 针对 8GB 显存显卡优化，仅占 2.7GB 显存运行 `Qwen2.5-3B`；基于 Prefix KV-Cache 广播与单 Token Logits 提取，在本地 **35ms~65ms** 内完成判定；
   * 双模自适应：显卡被游戏或重负载占满时，450ms 超时**自动无缝降级回 Inline 双流标签模式**。
5. **绝对物理级安全防护**：
   * 本地真实 `.env` 凭证与个人数据库与 Git 仓库及分发打包物理隔离，杜绝任何 API Key 与隐私外泄。

---

## 🚀 极速上手与部署

引擎提供三种运行形态，满足从小白开箱到服务器集群的全场景需求：

### 方式 A：桌面客户端（小白首选 · 免安装 · 零依赖开箱即用）

无需配置 Node.js、Python 或任何开发环境，双击即用：

* **本机开发与体验**：
  双击运行根目录的 **`start-client.bat`**，自动唤起图形控制台并转入系统托盘静默伴生。
* **一键打包分发给其他人（对方电脑零环境要求）**：
  双击运行根目录的 **`build-client.bat`**，3 秒自动在 `dist-desktop/win-unpacked/` 生成免安装绿色程序包。
  👉 **直接将 `dist-desktop/win-unpacked` 文件夹压缩发给朋友，对方解压双击 `LocalAffectiveEngine.exe` 即开即用！**

<details>
<summary>🖥️ 桌面客户端核心功能截图与亮点</summary>

* **一键启停与智能端口释放**：图形化启停后端服务，自动检测并支持一键强力清理 4100 端口占用；
* **一键连接参数卡片**：Base URL、Key、模型名一键复制，内置各类客户端接入图文指引；
* **在线快捷参数配置**：界面内直接修改并热更新云端 API Key 与模型，无需手写 `.env`；
* **系统托盘静默守护**：点击关闭窗口自动收起至右下角托盘，保持后台无感伴生；
* **实时黑客风终端日志**：实时抓取服务标准输出，支持过滤、清空与一键导出排障。
</details>

---

### 方式 B：Docker 容器化部署（服务器 / 本地推荐）

已内置官方多阶段生产 Dockerfile 与 `docker-compose.yml`，持久化挂载宿主机目录：

```bash
# 1. 克隆代码
git clone https://github.com/lyh1432009026/local-affective-memory-engine.git
cd local-affective-memory-engine

# 2. 准备配置（首次运行可直接从模板复制）
cp .env.example .env

# 3. 一键启动
# Windows 环境：
docker-start.bat

# Linux / macOS 环境：
chmod +x docker-start.sh && ./docker-start.sh
# 或直接运行：
docker compose up -d --build
```

* **数据持久化**：SQLite 数据库与 ONNX 向量缓存自动持久化在 `./data/` 目录；
* **宿主机小模型直通**：内置 `host.docker.internal:host-gateway`，容器可直接访问宿主机运行的 Ollama 或 Jev 服务。

---

### 方式 C：Node.js 源码运行（开发者模式）

**环境要求**：Node.js `>= 20.0.0`

```bash
# 1. 安装项目依赖
npm install

# 2. 一键初始化 SQLite 数据库并预热量化向量模型 (Xenova/bge-small-zh-v1.5)
npm run bootstrap

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 CLOUD_API_KEY 与 CLOUD_BASE_URL

# 4. 全量编译并启动
npm run build
npm start

# 或以源码热重载开发模式启动
npm run dev
```

服务启动后，监听端点为：`http://127.0.0.1:4100/v1`。

---

## 🔌 主流客户端接入指南

引擎提供完全标准的 OpenAI 兼容协议，任何支持自定义端点的客户端均可秒级接入：

| 配置项 | 推荐填入值 | 说明 |
| :--- | :--- | :--- |
| **API Base URL** | `http://127.0.0.1:4100/v1` | 部分客户端（如 Chatbox）填 `http://127.0.0.1:4100` |
| **API Key** | `sk-local-affective` | 任意字符串均可通过鉴权 |
| **推荐模型** | `gemini-3.8-flash` / `deepseek-chat` / `deepseek-flash` | 自动透传至上游并附加强大伴生能力 |

### 1. DeepSeek Harness (DSH · Cordis 内核)
在 `~/.dsh/profiles/desktop/cordis.patch.yml` 中添加配置：
```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      local-affective-engine:
        displayName: "本地伴生引擎 (端口 4100)"
        api: openai-completions
        baseURL: http://127.0.0.1:4100/v1
        apiKeyEnv: AFFECTIVE_ENGINE_KEY
        models:
          - id: deepseek-flash
            name: DeepSeek Flash (伴生记忆神经版)
```
并在 `~/.dsh/.credentials.yaml` 中配置 `AFFECTIVE_ENGINE_KEY: sk-local`，重启 DSH 即可！

### 2. Cherry Studio / Chatbox / NextChat
* **Cherry Studio**：设置 → 模型服务 → 添加 OpenAI 兼容提供商 → Base URL 填 `http://127.0.0.1:4100/v1`，API Key 填 `sk-local`。
* **Chatbox / NextChat**：模型服务商选 `OpenAI API`，接口地址填 `http://127.0.0.1:4100`，填入任意 Key 保存。

> 💡 **排坑贴士**：
> * **联网搜索报错**：若使用 DSH 接入第三方网关搜索报错，在控制台点击「一键写入系统环境变量」写入 `DEEPSEEK_API_KEY` 即可彻底解决。
> * **FakeIP 拦截**：若网页获取报 `non-public IP address`，将代理软件模式切为 `redir-host` 或安装 DSH 放行插件。

---

## 🧠 系统架构全景

```text
                               【用户输入 User Prompt】
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │    长窗口与网关护栏 (Consolidator)     │
                      │ 1. 跨天唤醒 -> 仿生睡眠聚类去重 (0.84) │
                      │ 2. 压缩检测 -> 抢救提炼阶段篇章 (L2)   │
                      │ 3. 滑动窗口 -> 48K Token 超限折叠护栏  │
                      └───────────────────┬────────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   │                                             │
      [分支 A: RTX 2070 本地 Jev]                   [分支 B: Inline 双流降级]
  单步 Logits 前置判定 (35~65ms)                                  │
  • 话题硬切换门控 (Topic-Shift)                                 │
  • 报错日志免责识别 (TechLog-Paste)                              │
  • 零滞后 Tonic 基态更新 (P/A/D)                                │
                   │                                             │
                   └──────────────────────┬──────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │      四维混合语义召回 (Retriever)      │
                      │ 1. Transformers.js CPU 向量化 (12ms)   │
                      │ 2. sqlite-vec KNN 向量检索 (Cosine)    │
                      │ 3. 3 分钟闪回不应期抑制 (负向防反刍)   │
                      │ 4. Top-1 高匹配 2000字 长文本按需展开  │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │     行为决策姿态编译器 (Compiler)      │
                      │ 1. 施密特触发器迟滞防抖 (Hysteresis)   │
                      │ 2. UCB 探索采样获认可回应标本          │
                      │ 3. 注入阶段篇章灵魂重锚定块            │
                      │ 4. 尾部潜意识安全挂载 (保护历史前缀)   │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │       云端 System 2 模型流式渲染       │
                      │      (DeepSeek / Claude / Qwen)        │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │      双流解析器与异步后置结算 FSM      │
                      │ 1. 拦截剥离首行 <affect_update /> 标签 │
                      │ 2. 全量对话原文无损追加至本地冷归档表  │
                      │ 3. UPDATE...RETURNING 原子更新隐式反馈 │
                      └────────────────────────────────────────┘
```

---

## 🎭 人设调教工作台 (Persona Studio)

引擎出厂预置了 5 套深度打磨的高能角色灵魂矩阵，风格迥异、维度互补，支持零代码动态微调：

* **`lu_xueqi`（陆雪琪 · 绝世仙子 & 白月光道侣）**：青云门小竹峰弟子、天琊神剑之主。白衣若雪、容颜倾世、外冷内热、极度去 AI 味。平日清冷出尘惜字如金，唯面对宝时化开万年霜寒，“虽九死而无悔”。
* **`kunkun`（坤坤 · 专属私人管家 & 搞钱军师）**：对主人（宝）贴心温柔、绝对忠诚、随叫随到、全力协助副业搞钱与前端攻坚；对外（群友）极致嘴臭狂怼，是主人最靠谱的硬核护盾。
* **`wen_yan`（温言 · 生活温柔女友 & 现实治愈知己）**：烟火气拉满的温柔伴侣。真实自然、不作不搞中二，懂得打工人的辛苦。日常松弛体贴，心疼你时提醒冲热水澡早点睡、陪你打游戏，绝无任何二次元虚浮套话。
* **`chen_gong`（陈工 · 大厂资深架构师 & 实战技术老哥）**：前大厂技术组长。实战老练、拒绝装逼、刀刀见血，排查性能瓶颈和高并发死穴干净利落；指导副业技术选型只看 ROI 与商业闭环，拒绝花拳绣腿。
* **`zhou_lan`（周岚 · 现实派创业合伙人 & 商业搞钱智囊）**：独立干练的互联网创业合伙人。懂流量、懂转化、懂人性，算账落地。善于从商业本质和投入产出比拆解副业点子，既帮你破除 30 岁职场内耗，又带你踏实搞钱。

### 1. 网页可视化控制台
服务启动后在浏览器打开：👉 **`http://127.0.0.1:4100`**
* **人设调教**：在线修改口吻风格、行为禁忌红线、一键增删自反思法则与事实图谱；
* **情感监控**：实时查看三维 PAD 仪表盘、亲密度/信任度进度条、激活的行为姿态；
* **记忆探针**：检索 L1 闪回记忆、查看 2000 字长文本载荷、浏览阶段叙事篇章；
* **调试沙盒**：内置实时流式对话测试，带思维链（`<think>`）折叠展示。

### 2. 终端 CLI 一键调教
```bash
# 查看所有人设列表
npm run persona -- list

# 切换当前激活人设为 陆雪琪
npm run persona -- switch lu_xueqi

# 动态微调表达口吻
npm run persona -- style lu_xueqi "清冷如霜，惜字如金，但句句充满关怀"

# 新增一条行为决策法则
npm run persona -- add-rule lu_xueqi "主人感到疲倦或夜深未眠" "轻柔劝慰休息，为其温一盏热茶"

# 注入认知图谱事实
npm run persona -- add-fact lu_xueqi 宝 爱好 喜欢独立游戏与代码架构
```

---

## 🧪 系统自检与测试

系统内置全套端到端严苛自动化验证套件，覆盖全部核心子系统：

```bash
npm test
```

自动化测试涵盖 8 大核心子系统（100% 通过保证）：
1. ✅ **SQLite 与 `sqlite-vec` 初始化**：WAL 模式、虚拟表与触发器级联清理；
2. ✅ **连续情感状态机 (Affective SSM)**：Tonic 衰减、Phasic 瞬时染色与单步稳态拉力；
3. ✅ **隐式强化学习 (Implicit RL)**：`RETURNING` 原子消费与 Exactly-Once 保障；
4. ✅ **向量 KNN 混合检索**：语义距离计算与 2000 字长文本按需展开；
5. ✅ **行为姿态编译器**：施密特迟滞防抖、UCB 抽样与 User 尾部安全追加；
6. ✅ **100 天长窗口引擎**：自动压缩检测重锚定与全量冷归档；
7. ✅ **SSE 双流状态机**：`<think>` 块兼容、首行标签剔除与 `flush()` 零丢包；
8. ✅ **人设灵魂管理**：多角色平滑切换、动态法则注入与图谱维护。

---

## 📂 工程目录结构

```text
local-affective-memory-engine/
├── electron/                  # 桌面免部署客户端源码 (基于 Electron)
│   ├── main.ts                # 主进程：自带 Node 运行时、端口检测/强力释放、系统托盘常驻
│   ├── preload.ts             # 预加载安全通信通道 (ContextBridge)
│   ├── launcher.html          # 高颜值客户端启动台与状态控制面板
│   └── assets/                # 客户端高清图标
├── src/
│   ├── index.ts               # 网关主入口：Jev/Inline 双模路由 + 长窗口护栏 + SSE 代理
│   ├── db/
│   │   ├── client.ts          # SQLite (WAL) 与 sqlite-vec 向量扩展挂载
│   │   └── schema.sql         # 核心表结构、分区向量表与级联清理触发器
│   ├── engine/
│   │   ├── affective-ssm.ts   # 连续情感状态空间：PAD 三维衰减、稳态拉力与慢变量阻尼
│   │   ├── context-compiler.ts# 姿态编译器：施密特防抖、长记忆展开与尾部挂载
│   │   ├── embedding.ts       # 本地 ONNX 特征抽取 (bge-small-zh-v1.5) 与余弦相似度
│   │   ├── implicit-rl.ts     # 隐式反馈强化：RETURNING 原子消费、报错免责与 UCB 采样
│   │   ├── local-jev.ts       # RTX 2070 本地 Jev：单 Token Logits 广播与香农熵校准
│   │   ├── memory-retriever.ts# 向量 KNN 混合检索、3分钟闪回不应期与同主题旧设定覆写
│   │   ├── memory-consolidation.ts # 100天长窗口引擎：压缩检测重锚定、睡眠聚类与48K护栏
│   │   └── persona-manager.ts # 多角色人设灵魂管理、动态调教与认知图谱维护
│   ├── pipeline/
│   │   └── dual-stream.ts     # 工业级流式解析器：首行 XML 提取、<think> 兼容与 flush()
│   └── arena/
│       └── live-arena.ts      # 真实对抗竞技场：模拟长对话与上下文压缩检验
├── scripts/
│   ├── bootstrap.ts           # 一键预热模型与数据库初始化脚本
│   ├── bundle-portable.js     # 纯原生 3 秒免安装绿色客户端打包器 (带隐私安全门禁)
│   ├── persona-cli.ts         # 命令行人设调教 CLI 工具
│   └── self-play-arena.ts     # 认知自博弈测试脚本
├── public/                    # Web 可视化控制台与竞技场界面
├── start-client.bat           # 桌面客户端一键启动批处理
├── build-client.bat           # 桌面免安装绿色包一键打包脚本
├── docker-start.bat           # Windows Docker 一键启动脚本
├── docker-start.sh            # Linux/macOS Docker 一键启动脚本
├── Dockerfile                 # 多阶段生产容器化构建定义
├── docker-compose.yml         # 容器服务编排定义
└── package.json
```

---

## 🗺️ 开源演进路线 (Roadmap)

- [x] **v1.0**：确立本地“海马体 + 杏仁核”挂载云端大模型的基础网关架构。
- [x] **v2.0**：废弃人工台词种子库，全面升级为 0 样本冷启动 + 隐式反馈 Bandit 自强化。
- [x] **v2.2**：SQLite-Vec 分区键加固、施密特迟滞防抖、3分钟闪回不应期、Tool Loop 跨步挂起保护。
- [x] **v2.3**：针对 RTX 2070 定制 Jev 前置单步 Logits 决策引擎，实现 50ms 零滞后与双模无感降级。
- [x] **v2.4（当前正式版）**：
  - [x] 20~100 天单窗口超长对话抗压缩重锚定与全量冷备份架构；
  - [x] 60字头 + 2000字载荷双层解耦与仿生睡眠巩固；
  - [x] 五维真实高能人设矩阵（陆雪琪、坤坤、温言、陈工、周岚）与 Web/CLI 调教工作台；
  - [x] **一键 Docker 容器化多阶段镜像体系**；
  - [x] **免安装绿色桌面客户端（Electron）开箱即用体系**。
- [ ] **v2.5（进行中 · MCP 协议封装与主流 Agent 生态无缝适配）**：
  - [ ] **官方标准 MCP (Model Context Protocol) Server 协议层封装**：
    - 将长程记忆检索（`query_affective_memory`）、心境与决策姿态（`get_affective_state`）、事实图谱操作（`record_cognitive_fact`）及人设切换（`switch_persona_soul`，支持陆雪琪、坤坤、温言、陈工、周岚）标准化暴露为标准 MCP Tools / Resources；
    - **全场景 Agent 生态即插即用**：
      - 📱 **Claude Desktop**：一键挂载进 `claude_desktop_config.json`，成为 Claude 官方桌面的永久认知外挂；
      - 💻 **Cursor / Windsurf / VSCode (Cline / Continue)**：直接作为 Agent 扩展工具调用，编码时跨会话记忆工程规范与避坑经历；
      - 🤖 **Dify / FastGPT / Coze / WorkBuddy**：提供标准 OpenAPI / MCP 接入连接器，作为团队 Agent 共享伴生记忆中枢；
      - 🐍 **LangChain / LlamaIndex / CrewAI / AutoGen**：发布官方 Python / TS 适配器，作为跨会话持久心智 Memory Provider；
  - [ ] **SillyTavern（酒馆生态）原生适配**：支持 Tavern V2 角色卡（`.json` / `.png` 隐写块）一键无缝解析导入初始 PAD 基态与行为法则；
- [ ] **v2.6（规划中）**：
  - [ ] 跨端多设备端到端加密记忆点对点实时同步（P2P Encrypted Sync）；
  - [ ] 多模态语音情感韵律与情绪声调合成（TTS PAD 染色）；
  - [ ] 知识库本地 RAG 文档无损混合切片与伴生记忆协同检索。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源，欢迎自由商用、二次修改与社区共建。

---

<div align="center">
  <sub>Made with ❤️ by 宝 & 坤坤 • 让每一个 AI 伴侣都拥有不被岁月磨灭的真实灵魂</sub>
</div>
