# `local-affective-memory-engine` 开源影响力演进蓝图
> **目标层级**：GitHub 2,000 ~ 5,000+ Stars 标杆级开源项目  
> **基准版本**：v2.4（零人工种子 · 隐式强化 · Jev 双模 · 100 天超长窗口抗压缩）  
> **核心策略**：停止盲目堆砌底层算法复杂度，转向**状态可视化外显、零摩擦分发、成熟生态寄生、量化基准背书**四大工程杠杆。

---

## 一、 战略定位与差异化叙事（Positioning & Narrative）

在开源社区中，与大厂或融资团队比拼“大而全的企业级知识库”必败无疑。本项目的破局点在于**“极致轻量化的端侧伴生灵魂中枢”**。

### 1. 核心痛点锚定（Why People Star It）
开源受众在第一眼看到项目时，必须被以下三个真实痛点瞬间击中：
1. **反“客服化”退化（Anti-Customer-Service Degradation）**：解决传统 AI 聊满 20 轮后口吻趋同、沦为冷漠机械客服的顽疾。
2. **抗上下文截断失忆（Anti-Compaction Amnesia）**：解决客户端自动触发 Summary 或滑动截断瞬间，AI 丢失历史默契与情绪基调的断崖式失忆。
3. **反重型全家桶（Zero Heavy Infrastructure）**：拒绝为个人伴生 AI 部署 Neo4j + Elasticsearch + PostgreSQL + Redis（8GB+ 内存），仅用 **1 个 SQLite 文件 + 180MB 内存** 实现完整认知闭环。

### 2. 标准电梯演讲（Elevator Pitch）
* **中文定位**：
  > 180MB 内存、单文件 SQLite 驱动的本地情感与长程记忆网关。用连续状态空间（Tonic/Phasic 解耦）、施密特迟滞防抖与抗压缩篇章重锚定，彻底根治长周期 AI 伴侣与研发 Copilot“一压缩就失忆、聊久了变客服”的通病。
* **英文定位（面向 Global 社区）**：
  > **A 180MB, single-SQLite affective & episodic memory gateway for persistent AI companions and coding copilots.** Built with Tonic/Phasic state-space decoupling, Schmitt-trigger hysteresis, and automatic compaction re-anchoring—preventing your AI from resetting into a stateless corporate bot.

### 3. 开源生态竞品对标矩阵（用于 README 核心展示）

| 维度 | Mem0 / Zep | MemoryBear | SillyTavern 原生总结 | **local-affective-memory-engine** |
| :--- | :--- | :--- | :--- | :--- |
| **核心定位** | 通用事实型 RAG | 企业级多跳知识图谱 | 文本块摘要拼接 | **端侧长周期伴生认知与情感状态中枢** |
| **部署依赖** | 云端 API / 向量库 | PG + Neo4j + ES + Redis | 客户端本地 | **单文件 SQLite + `sqlite-vec` + 本地 ONNX** |
| **内存开销** | 视后端而定 | 8 GB ~ 16 GB+ | ~200 MB | **~180 MB（检索 `< 5ms`）** |
| **情绪动力学** | 无 | 静态情绪词表匹配 | 无 | **PAD 连续空间 + Tonic/Phasic 解耦 + 施密特防抖** |
| **抗压缩失忆** | 弱（被动检索） | 弱（异步队列滞后） | 易丢失细节与语气 | **内核级截断检测 + 阶段叙事篇章连续 3 轮重锚定** |
| **行为自演化** | 无 | 定时离线自反思 | 无 | **0 样本冷启动 + 隐式强化学习 + 排障报错免责** |

---

## 二、 阶段一（第 1~2 周）：消灭“无感价值”——白盒化可观测性与瞬间哇塞感

### 核心矛盾
记忆与情感是**长周期慢变量**。如果新用户克隆仓库后前 5 轮对话看不到内部变化，80% 的人会直接关闭网页。必须将底层数学模型转化为**肉眼实时可见的视觉反馈**。

### 工程交付清单

#### 1. 升级 `/ui` 为实时认知遥测驾驶舱（Cognitive Telemetry Dashboard）
无需引入臃肿前端框架，基于轻量单文件 HTML + ECharts / Canvas 实现 4 个核心视图：
* **PAD 连续心境雷达与波形图**：实时展示持久基态（`Tonic State`）与当轮唤醒态（`Phasic Mood`）的偏离与回弹轨迹，标出施密特触发器的迟滞死区阈值线（`0.06`）。
* **行为姿态指示器（Active Policy Badge）**：高亮显示当前处于《熟稔默契协同》、《极简高密攻坚》、《阻断与架构止损》还是《克制收敛兜底》，并显示触发原因。
* **记忆召回与不应期监视器**：展示当轮 Top-4 召回的 `60字索引头`、是否触发 `>= 0.72` 的 `2000字完整长文本展开`，以及哪些记忆正处于 **3 分钟不应期冷却（`0.35x` 抑制）**。
* **抗压缩重锚定警报灯（Compaction Shield Indicator）**：当检测到上下文骤降 $\ge 45\%$ 时，界面亮起琥珀色重锚定徽章，展示自动注入的《阶段叙事篇章》。

#### 2. 内置“60 秒双 AI 自博弈演示场”（Self-Play Stress Test Arena）
在项目中内置一键演示命令 `npm run demo:arena`（并在 `/ui` 提供启动按钮）：
* **内置对抗剧本**：挂载两个独立 Persona——`Persona A（严苛底层架构师）` vs `Persona B（敏捷业务攻坚手，频繁贴报错堆栈）`。
* **破坏性测试按钮**：
  1. **`[注入 100 行报错堆栈]`**：实时演示 `implicit-rl.ts` 的排障免责机制（Pleasure 不误扣分）。
  2. **`[模拟客户端暴力截断 80% 上下文]`**：一键砍掉前 20 轮对话，直观对比“普通直连模型瞬间失忆客套”与“本引擎自动提取叙事篇章无缝续接”的巨大反差。

---

## 三、 阶段二（第 3~4 周）：消灭部署摩擦——零配置分发与成熟生态寄生

### 核心矛盾
`better-sqlite3`、`sqlite-vec`（C 扩展编译）与 `@huggingface/transformers`（首次拉取 ONNX 权重）是阻碍普通开发者运行的最大劝退点。同时，“中间件”必须寄生在拥有海量现成用户的宿主客户端上才能爆发。

### 工程交付清单

#### 1. 零摩擦安装与容器化（Zero-Friction Setup）
* **预内置模型的 Docker 一键镜像**：
  编写多阶段构建 `Dockerfile`，在构建期将 `Xenova/bge-small-zh-v1.5` 的 ONNX 权重预烘培进镜像内。用户只需执行一行命令即可离线跑通：
  ```bash
  docker run -d -p 4100:4100 -v ./data:/app/data -e CLOUD_API_KEY=sk-xxx ghcr.io/lyh1432009026/local-affective-memory-engine:latest
  ```
* **`npx` 快速启动与环境自检脚本**：
  完善 `scripts/bootstrap.ts`，自动检测国内网络环境并无缝切换 `hf-mirror.com`，对 `sqlite-vec` 预编译二进制加载失败提供清晰的降级提示。

#### 2. 三大主流生态无缝寄生（流量获取杠杆）

| 目标生态 | 工程改造内容 | 预期获客效果 |
| :--- | :--- | :--- |
| **1. SillyTavern（酒馆生态）** | 在 `PersonaManager` 中新增 **Tavern Card V2 (`.json` / `.png` 隐写块) 一键导入接口**；自动将角色卡的 `personality` / `mes_example` 解析为初始 PAD 基态与行为法则。 | 直接切入全球最活跃的 AI 伴侣与角色扮演玩家群体，解决酒馆玩家最头疼的“聊满 30 轮崩人设”痛点。 |
| **2. MCP 协议生态（Claude / Cursor / IDE）** | 新增轻量级 `src/mcp.ts`，将 `recall_affective_memory`、`get_current_mood_policy`、`commit_milestone` 封装为标准 MCP Server。 | 切入 AI Coding 开发者群体，让各种 IDE 插件共享同一套持久工程记忆与协作默契。 |
| **3. OpenWebUI / Dify / NextChat** | 在 `docs/integrations/` 下提供 3 分钟图文配置指南（仅需替换 Base URL 为 `http://localhost:4100/v1`）。 | 零代码侵入接管现有千万级开源聊天前端用户。 |

---

## 四、 阶段三（第 5~6 周）：建立硬核信任背书——可复现基准测试（Benchmark）

### 核心矛盾
在 GitHub、Hacker News 与 Reddit (`r/LocalLLaMA`) 等技术社区，口头宣称“效果好”毫无说服力，**量化对比图表是引爆 Star 的硬通货**。

### 工程交付清单：构建 `test/benchmark.ts` 自动化评测套件

设计 3 组可在 5 分钟内跑完的确定性评测实验，并将结果绘制成 SVG 对比图放入 README：

1. **实验一：上下文截断存活率测试（Compaction Survival Test）**
   * **方法**：在 30 轮长对话中埋入 5 个核心架构约束与 3 个情绪约定，在第 25 轮人为抹除前 22 轮历史（模拟客户端压缩）。
   * **对比组**：Raw LLM（直连） vs 普通 Top-K 向量 RAG vs **本引擎（含篇章重锚定 + Summary-Payload 双层展开）**。
   * **输出指标**：约束遵循率（Constraint Retention %）与人设语气一致性得分。
2. **实验二：高频正负刺激下的情感稳定性（Affective Stability & Anti-Oscillation）**
   * **方法**：输入 40 轮交替的报错堆栈、催促、夸奖与话题突换。
   * **对比组**：简单情绪加减法状态机 vs **本引擎（Tonic/Phasic 解耦 + 0.06 稳态拉力 + 施密特迟滞）**。
   * **输出指标**：姿态无意义高频翻转次数（Policy Flip-Flop Count）——证明本引擎能减少 80% 以上的精神分裂式抖动。
3. **实验三：性能与资源基线（Performance Baseline）**
   * 公布真实 P50 / P99 耗时数据：
     * 本地 ONNX 512 维向量化：`~8.5 ms`
     * `sqlite-vec` + 四维混合召回：`< 3.2 ms`
     * 本地 RTX 2070 Jev 6 题并发判定：`~48 ms`
     * Inline 双流状态机首 Token 额外延迟：`< 1.0 ms`

---

## 五、 阶段四（第 7~8 周）：门面工程重塑与全球社区宣发（Launch Playbook）

### 1. README.md 黄金前 3 屏重构规范
开源访客在进入仓库后的 **10 秒内** 决定是否点 Star。README 结构必须按以下顺序编排：
1. **首屏视觉冲击**：一张高清动态 GIF（左侧终端触发上下文截断，右侧认知遥测面板实时亮起“抗压缩重锚定”并画出平滑的 PAD 情绪曲线）。
2. **三句话核心价值主张**：Why Not Just RAG?（直指客服化退化、压缩失忆、重型运维三大痛点）。
3. **极速体验入口**：Docker 一行命令 + 双 AI 对抗演示场启动命令。
4. **核心架构图**：使用清晰的双系统（System 1 Jev / System 2 Cloud）+ 三级记忆金字塔 SVG 矢量图。
5. **硬核算法解析折叠区**：将施密特触发器公式、Tonic/Phasic 解耦方程、UCB 标本采样公式集中展示，满足硬核极客的审美。

### 2. 分渠道精准引爆策略（Distribution Channels）

| 社区渠道 | 受众画像 | 标题与切入角度建议 |
| :--- | :--- | :--- |
| **Reddit `r/LocalLLaMA`** | 本地模型狂热爱好者、硬核极客 | *"Show r/LocalLLaMA: I built a 180MB affective memory engine in SQLite using Schmitt triggers and single-token logit probes (Qwen-3B) to stop AI companions from turning into corporate bots."* |
| **Reddit `r/SillyTavernAI`** | 重度 RP 玩家、长期伴侣用户 | *"Solved the 'post-summarization personality wipe' problem: An OpenAI-compatible proxy with continuous PAD mood state and narrative re-anchoring."* |
| **Hacker News (`Show HN`)** | 硅谷工程师、架构师 | *"Show HN: Local Affective Memory Engine – State-space mood modeling and episodic memory in a single SQLite file."*（突出克制工程美学与数学模型） |
| **国内社区（Linux.do / V2EX / 知乎）** | AI 折腾党、独立开发者、酒馆玩家 | 《拒绝 8G 内存全家桶：我用单文件 SQLite 和施密特触发器，写了个抗上下文截断的本地 AI 情感记忆引擎》 |

---

## 六、 架构克制红线（2,000 Stars 前坚决不做的事）

为防止陷入独立开发者常见的“无限重构与功能蔓延”泥潭，确立以下 **4 条铁律**：

1. **坚决不引入外部数据库服务**：绝不添加 Redis、PostgreSQL、Neo4j 或 Qdrant 必选依赖，死守 `better-sqlite3 + sqlite-vec` 单文件护城河。
2. **坚决不先做“LLM 夜间异步梦境合成”**：现有确定性规则提炼（0 成本、0 幻觉、0 延迟）完全够用；在用户量未起之前，引入后台 LLM 自由总结只会带来幻觉污染与 Token 投诉。
3. **坚决不强加高权重的“心境距离过滤”**：坚持“语义与事实召回优先，心境一致性仅作 $\le 0.05$ 微扰系数”，绝不因情绪差异过滤掉关键技术或事实记忆。
4. **坚决不做复杂的多租户权限与计费系统**：保持单机/边缘网关的纯粹性，认证与多租户交给上层业务系统处理。

---

## 七、 近期立即可执行的 Top 3 行动项（Next Actions）

1. **[Action 1 - 脚本验证]**：编写 `scripts/self-play-arena.ts`（约 80 行代码），实现双角色自动对抗 30 轮，并加入第 20 轮人为截断上下文的模拟测试，跑出第一份真实长周期日志。
2. **[Action 2 - 视觉外显]**：完善 `public/index.html` 仪表盘，将 PAD 状态曲线、当前激活姿态、召回记忆列表与抗压缩重锚定状态在同一屏直观呈现。
3. **[Action 3 - 生态接口]**：在 `PersonaManager` 中增加对 SillyTavern V2 JSON 角色卡的导入支持，打通最大潜在用户池的最后一公里。
