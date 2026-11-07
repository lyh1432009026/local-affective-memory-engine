# 本地记忆与情感神经伴生引擎 v2.4 部署与接入指南

本文档提供 **本地记忆与情感神经伴生引擎（Local Affective & Memory Engine v2.4）** 的完整部署、配置、日常管理与各类客户端接入指南。

---

## 一、 系统架构与运行环境要求

### 1. 运行依赖
* **Node.js**：`>= 20.0.0`（推荐 Node.js v20 或 v22 LTS）
* **包管理器**：`npm` / `pnpm` / `yarn`
* **操作系统**：Windows 10/11、macOS、Linux (Ubuntu 20.04+)
* **硬件推荐**：
  * **CPU 模式（默认零显存占用）**：4 核 CPU / 4GB 以上内存即可流畅运行（BGE-small-zh-v1.5 向量推理与 SQLite 向量检索完全在 CPU 运行，内存仅占约 180MB）。
  * **RTX 2070 本地 Jev 决策加速（可选）**：8GB 独立显存（`llama-server` 加载 Qwen2.5-3B 仅占 2.7GB 显存，留足 5GB 供日常开发和游戏）。

---

## 二、 快速部署（3 分钟极速上手）

### 方式 0：桌面客户端（Electron 免部署 · 小白专享 · 双击即用）

针对完全不懂命令行、电脑没有安装 Node.js / Docker 环境的普通用户，项目提供了专用的 **桌面开箱客户端**：

1. **直接启动客户端**（日常开发或测试）：
   * Windows 下双击运行根目录的 **`start-client.bat`**。
   * 自动编译并唤起桌面图形窗口与系统托盘，后台服务无感自启。
2. **打包成独立客户端发给其他人使用**（对方电脑完全零环境要求）：
   * 双击运行根目录的 **`build-client.bat`**（或执行 `npm run client:pack`）。
   * 构建完成后在 `dist-desktop/win-unpacked/` 生成免安装绿色程序，包含 `LocalAffectiveEngine.exe`。
   * **分发方式**：直接把 `win-unpacked` 文件夹打包发给朋友，对方**解压双击 `LocalAffectiveEngine.exe` 即可直接使用**，无需安装 Node.js、无需配置环境！
3. **客户端核心特性**：
   * 🎯 **一键启停/重启**：图形化启停伴生引擎，智能检测与一键释放 4100 端口；
   * 📋 **一键参数复制**：一键复制 Base URL (`http://127.0.0.1:4100/v1`)、Key 及模型名，内置各类主流客户端接入指引；
   * ⚙️ **在线快速配置**：界面直接填入 API Key、选择模型与决策模式，保存热生效；
   * 🛡️ **托盘静默守护**：关闭主窗口自动最小化至系统托盘，右键托盘菜单一键管理；
   * 📜 **终端实时日志**：实时滚动展示引擎内部运行日志，支持导出排障。

---

### 方式 A：Docker 容器化一键部署（推荐 · 零环境依赖）

已内置官方多阶段生产 Dockerfile 与 `docker-compose.yml`，宿主机无需安装 Node.js/C++ 编译工具链即可一键拉起：

```bash
# 1. 克隆仓库
git clone https://github.com/lyh1432009026/local-affective-memory-engine.git
cd local-affective-memory-engine

# 2. 准备配置文件（若未创建会自动从 .env.example 生成）
cp .env.example .env

# 3. 一键启动
# Windows 用户：
docker-start.bat

# Linux / macOS 用户：
chmod +x docker-start.sh && ./docker-start.sh
# 或直接运行：
docker compose up -d --build
```

* **数据持久化**：SQLite 数据库与 ONNX 向量缓存自动映射保存在宿主机 `./data/` 目录，容器销毁升级数据绝不丢失。
* **访问控制台**：服务启动后直接访问 `http://127.0.0.1:4100`。
* **宿主机 Jev 联动**：容器内部可通过 `http://host.docker.internal:8081/v1` 自动访问宿主机上运行的 Jev / Ollama 小模型。

---

### 方式 B：本地源码安装与运行

#### 第一步：克隆仓库与安装依赖
```bash
git clone https://github.com/lyh1432009026/local-affective-memory-engine.git
cd local-affective-memory-engine
npm install
```

### 第二步：一键初始化数据库与本地向量模型
执行官方部署引导脚本，将自动在 `data/` 下创建生产数据库并自动从国内镜像源下载量化向量模型（`Xenova/bge-small-zh-v1.5`，约 24MB），完成预热与端到端测试：
```bash
npm run bootstrap
```
> *注：也可运行 `npm run init`，效果完全相同。*

### 第三步：配置环境变量
复制 `.env.example` 为 `.env` 并填入你的云端大模型 API 凭据：
```bash
cp .env.example .env
```
编辑 `.env`：
```ini
# 服务监听端口
PORT=4100

# 角色分身标识（不同角色独立存储与向量分区）
PERSONA_ID=default

# 决策模式：inline（首行双流标签，默认推荐） | jev（RTX 2070 本地决策）
AFFECT_MODE=inline

# 云端大模型配置 (支持 DeepSeek / Claude / Qwen / OpenAI 等兼容协议)
CLOUD_API_KEY=your_deepseek_api_key_here
CLOUD_BASE_URL=https://api.deepseek.com/v1

# HuggingFace 模型镜像加速
HF_MIRROR=https://hf-mirror.com
```

### 第四步：编译并启动服务
```bash
# 编译 TypeScript 源码
npm run build

# 生产启动
npm start

# 或以开发调试模式启动
npm run dev
```

启动成功后，终端将输出：
```text
[Local Affective & Memory Engine v2.4] Running on http://127.0.0.1:4100/v1 (Mode: Inline Dual-Stream Only)
```

---

## 三、 网页可视化控制台 (Web Visual Dashboard)

伴生引擎内置了全功能的可视化 Web 控制台，服务启动后直接在浏览器中打开：
👉 **`http://127.0.0.1:4100`** 或 **`http://127.0.0.1:4100/ui`**

可视化控制台包含 5 大工作区：
1. **🎭 人设调教工作台 (Persona Studio)**：
   * 角色分身卡片切换（`坤坤`、`小伴`、`阿坚`、自定义角色）；
   * 在线编辑身份定位、语言风格口吻（支持一键追加口吻标签）、行为禁忌红线、主人认知羁绊；
   * 自反思行为决策法则管理（动态新增、修改置信度、删除）；
   * 认知实体图谱注入（主谓宾三元组动态维护）；
   * 一键恢复出厂预设。
2. **⚙️ 模型与网关配置 (Gateway Settings)**：
   * 在线修改云端大模型 API Base URL 与 API Key（支持隐藏/显示明文）；
   * 一键连通性测试（实时测速展示网络时延与上游可用模型数）；
   * 伴生决策模式切换（Inline 双流标签 / RTX 2070 Jev 本地决策）；
   * 保存后立即热更新生效并自动同步写回 `.env`。
3. **📈 情感动力学监控 (Affective SSM Monitor)**：
   * 实时三维 PAD 状态仪表盘（Pleasure 愉悦度、Arousal 专注唤醒度、Dominance 自信掌控度）；
   * 慢变量关系账本进度条（熟稔亲密度、信赖度）；
   * 当前心境驱动激活的【行为决策姿态】徽章；
   * 情感刺激注入测试器（手动滑动调节 $\Delta P, \Delta A, \text{Score}$ 观察阻尼演化）。
4. **📚 记忆库与图谱探针 (Memory Explorer)**：
   * L1 闪回情景记忆列表（60字索引头 + 2000字完整长文本载荷双层展示）；
   * L2 阶段叙事篇章列表（各阶段认知主题与脉络提炼）；
   * 向量语义检索测试器（输入任意查询句，实时看命中的记忆与余弦距离）。
5. **💬 伴生调试沙盒 (Live Companion Sandbox)**：
   * 网页内原生的 SSE 流式交互对话框；
   * 实时展示思维链推理过程（`<think>` 块）与最终回复；
   * 每轮对话结束后自动刷新情感仪表盘。

---

## 四、 Windows / Docker / 客户端一键脚本全集

项目根目录下提供了多套开箱即用的快捷脚本，满足不同使用习惯与场景：

| 脚本文件 | 适用场景 | 使用方式与说明 |
| :--- | :--- | :--- |
| **`start-client.bat`** | **桌面客户端体验** | 双击启动 Electron 桌面客户端，带系统托盘与可视化启动控制台 |
| **`build-client.bat`** | **分发小白免安装客户端** | 一键打包出 `dist-desktop/win-unpacked` 绿色包，其他人解压双击即可用 |
| **`docker-start.bat`** | **Docker 容器化启动** | Windows Docker 环境一键构建并拉起伴生引擎后台容器 |
| **`docker-start.sh`** | **Linux / macOS Docker** | Linux/macOS 服务器端一键构建与部署 Docker 服务 |
| **`start-engine.bat`** | **终端服务交互运行** | 双击运行，带命令行黑框，实时查看心境状态机与日志 |
| **`start-silent.vbs`** | **后台静默运行** | 双击在后台完全静默启动 Node 引擎（无任何黑框弹窗） |
| **`stop-engine.bat`** | **一键关停服务** | 双击自动检索并杀掉占用 4100 端口的所有引擎进程 |

---

## 四、 DeepSeek Harness (DSH) 客户端深度接入

伴生引擎原生兼容 **DeepSeek Harness (Cordis 内核)**。接入后，DSH 的所有对话将自动获得长期记忆、情感动力学共鸣以及超长窗口抗压缩能力。

### 1. 配置 DSH 模型供应商与默认模型
打开 DSH 配置文件（`~/.dsh/profiles/desktop/cordis.patch.yml`）：
```yaml
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: local-affective-engine
    model: deepseek-flash
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
            contextWindow: 1048576
            maxTokens: 8192
            input:
              - text
          - id: deepseek-v4-pro
            name: DeepSeek V4 Pro (伴生记忆神经版)
            contextWindow: 1048576
            maxTokens: 8192
            input:
              - text
          - id: deepseek-chat
            name: DeepSeek Chat (伴生记忆极速版)
            contextWindow: 1048576
            maxTokens: 8192
            input:
              - text
```

### 2. 配置密钥凭证引用
打开 `~/.dsh/.credentials.yaml`，在 `refs` 中注册本地密钥：
```yaml
version: 1
refs:
  AFFECTIVE_ENGINE_KEY: sk-affective-engine-local
```

### 3. 重启生效
保存上述两个文件，**完全重启 DeepSeek Harness**，默认聊天模型即已切换为端口 4100 的本地伴生引擎！

### 4. 作为 DSH 智能体专属 MCP 工具挂载（双剑合璧 · 主动调用）
除了将引擎作为底层大模型网关透明中转外，DSH 原生支持以 MCP 协议挂载本引擎作为 Agent 工具集：

1. **安装 DSH 官方 MCP 客户端插件**（已在本地环境就绪）：
   ```bash
   dsh plugin --profile desktop add @deepseek-ai/dsh-mcp-client@0.0.1-rc.1
   ```
2. **在 `~/.dsh/profiles/desktop/cordis.patch.yml` 中注册本 MCP 服务**：
   ```yaml
   - id: mcp-affective-engine
     name: "@deepseek-ai/dsh-mcp-client"
     config:
       serverName: affective_engine
       transport: stdio
       command: node
       args:
         - "C:/Users/14320/WorkBuddy/2026-11-05-20-31-16/dist/mcp.js"
   ```
3. **重启 DSH 客户端**：
   DSH 内置 Agent 会自动获得以下 5 大官方 MCP 神器：
   * `mcp__affective_engine__query_affective_memory`：主动语义检索长期情景记忆与 2000 字展开载荷
   * `mcp__affective_engine__get_affective_state`：实时探测 PAD 情绪值、亲密度与行为姿态
   * `mcp__affective_engine__record_cognitive_fact`：动态注入主谓宾实体知识图谱
   * `mcp__affective_engine__switch_persona_soul`：动态切换人设灵魂（陆雪琪、坤坤、林小狸、诺娃、苏清歌）
   * `mcp__affective_engine__trigger_sleep_consolidation`：手动触发仿生睡眠聚类篇章归档

---

## 五、 第三方通用客户端接入指南（Cursor / NextChat / Cherry Studio）

伴生引擎提供标准 OpenAI 协议接口，可无缝接入任意前端与 IDE：

| 配置项 | 推荐填入值 |
| :--- | :--- |
| **API Base URL** | `http://127.0.0.1:4100/v1`（部分软件填 `http://127.0.0.1:4100`） |
| **API Key** | 任意字符（如 `sk-local`） |
| **可选模型名称** | `deepseek-flash`（深度思考）、`deepseek-chat`（通用直出）、`deepseek-v4-pro` |

* **健康检查端点**：`GET http://127.0.0.1:4100/health`
* **模型列表端点**：`GET http://127.0.0.1:4100/v1/models`

---

## 六、 进阶：开启 RTX 2070 本地 Jev (System 1) 决策加速

若本地拥有 NVIDIA RTX 2070 (8GB) 显卡，可开启 Jev 单步 Logits 决策引擎，享受 **35ms~65ms 零延迟前置情感推断**：

1. **下载量化小模型**：
   下载 `Qwen2.5-3B-Instruct-Q5_K_M.gguf` 或 `Qwen2.5-1.5B-Instruct-Q5_K_M.gguf`。
2. **启动 llama-server**（仅占约 2.7GB 显存）：
   ```bash
   llama-server.exe -m Qwen2.5-3B-Instruct-Q5_K_M.gguf -ngl 99 -c 8192 -np 6 --cache-reuse 256 --port 8081
   ```
3. **切换引擎模式**：
   在 `.env` 中修改：
   ```ini
   AFFECT_MODE=jev
   LOCAL_JEV_URL=http://127.0.0.1:8081/v1
   LOCAL_JEV_TIMEOUT_MS=450
   ```
4. **双模无缝降级**：
   当显卡被游戏或重负载占满、或 `llama-server` 未启动时，引擎将在 450ms 超时后**自动无缝降级回 Inline 双流标签模式**，永远不中断对话。

---

## 七、 自动化测试与日常运维

### 运行全套系统自检
```bash
npm test
```
测试套件包含 7 大核心子系统的全量验证：
1. SQLite WAL 模式与 `sqlite-vec` 虚拟表挂载
2. 连续情感状态机（SSM）Tonic 衰减与 Phasic 唤醒
3. 隐式强化学习 Exactly-Once 消费与话题硬切换门控
4. 向量 KNN 混合检索与 3 分钟闪回不应期抑制
5. 施密特迟滞姿态编译器与多模态安全拼装
6. 100 天超长窗口原文冷归档与自动压缩重锚定
7. 工业级增量流式状态机（FSM）与 `<think>` 实时推送

---

## 八、 常见问题与排障 (FAQ)

### Q1: 问模型“你从哪里取得记忆”时，它一直搜索或尝试执行 Python 脚本报错？
* **原因**：某些具备终端执行权限的 Agent 客户端（如 DSH）会因好奇心尝试翻查文件系统探针。
* **解决**：v2.4 已在 `src/engine/context-compiler.ts` 内置认知自我感知与防探测指令，模型会如实直接解答记忆机制，禁止执行本地探针。若出现旧现象，请确保已拉取最新代码并运行 `npm run build`。

### Q2: 出现 `SQLITE_BUSY: database is locked`？
* **原因**：旧版本未配置忙等待超时。
* **解决**：最新版本的 `src/db/client.ts` 已默认配置 `busy_timeout = 5000` 与 WAL 模式，高频秒回场景下会自动自旋等待，彻底消除锁冲突。

### Q3: 离线环境可以运行吗？
* **回答**：**完全可以**。首次运行 `npm run bootstrap` 将 ONNX 向量模型缓存至本地后，除请求云端大模型 API 以外，本地所有的向量化、相似度计算、状态机流转与记忆检索**100% 离线运行，零外网依赖**。

---

## 九、 人设调教模块使用指南 (Persona Tuning Guide)

伴生引擎 v2.4 内置了完整的人设灵魂塑造与动态调教系统，支持在不修改任何代码的情况下，随时查看、微调、注入或切换 AI 的人设特征。

### 1. 预置初始人设
系统出厂自带 5 种深度调优的高能初始人设，开箱即用：
* **`lu_xueqi`（陆雪琪 · 绝世仙子 & 白月光道侣）**：青云门小竹峰弟子、天琊神剑之主。白衣若雪、容颜倾世、外冷内热、极度去 AI 味。平日清冷出尘惜字如金，唯面对二蛋时化开万年霜寒，“虽九死而无悔”。
* **`kunkun`（坤坤 · 专属私人管家 & 搞钱军师）**：对主人（刘二蛋）贴心温柔、绝对忠诚、随叫随到、全力协助副业搞钱与前端攻坚；对外（群友）极致嘴臭狂怼，是主人最靠谱的硬核护盾。
* **`wen_yan`（温言 · 生活温柔女友 & 现实治愈知己）**：烟火气拉满的温柔伴侣。真实自然、不作不搞中二，懂得打工人的辛苦。日常松弛体贴，心疼你时提醒冲热水澡早点睡、陪你打游戏，绝无任何二次元虚浮套话。
* **`chen_gong`（尧桑 · 大厂资深架构师 & 实战技术老哥）**：前大厂技术组长尧桑。实战老练、拒绝装逼、刀刀见血，排查性能瓶颈和高并发死穴干净利落；指导副业技术选型只看 ROI 与商业闭环，拒绝花拳绣腿。
* **`zhou_lan`（周岚 · 现实派创业合伙人 & 商业搞钱智囊）**：独立干练的互联网创业合伙人。懂流量、懂转化、懂人性，算账落地。善于从商业本质和投入产出比拆解副业点子，既帮你破除 30 岁职场内耗，又带你踏实搞钱。

### 2. 终端 CLI 调教命令
随时在项目根目录运行以下命令：
```bash
# 查看所有人设列表
npm run persona -- list

# 查看指定人设完整档案（口吻、禁忌、情感基态、行为法则、事实图谱）
npm run persona -- show kunkun

# 切换当前全局激活人设
npm run persona -- switch kunkun

# 调教表达口吻与句式风格
npm run persona -- style kunkun "对主人极尽温柔贴心，每句话都充满关怀与支持"

# 新增/覆盖一条行为决策法则
npm run persona -- add-rule kunkun "主人感到疲惫或提打游戏" "积极顺着主人陪聊放松，绝对不催促工作"

# 注入一条认知实体图谱事实
npm run persona -- add-fact kunkun 刘二蛋 兴趣 喜欢玩黑神话与独立游戏

# 重置指定人设恢复出厂预设
npm run persona -- reset kunkun
```

### 3. HTTP REST API 调教端点
服务运行在 4100 端口，可通过标准 HTTP 请求进行动态微调：
* `GET /v1/personas`：获取所有人设列表与当前激活人设
* `GET /v1/personas/:id`：获取人设详情（含情感基态、法则与图谱）
* `POST /v1/personas/switch`：切换激活人设（`{"persona_id": "kunkun"}`）
* `POST /v1/personas/tune/style`：微调口吻（`{"persona_id": "kunkun", "tone_style": "..."}`）
* `POST /v1/personas/tune/rule`：调教法则（`{"persona_id": "kunkun", "trigger": "...", "directive": "..."}`）
* `POST /v1/personas/tune/fact`：调教图谱事实（`{"persona_id": "kunkun", "subject": "...", "predicate": "...", "object": "..."}`）
* `POST /v1/personas/reset`：重置出厂预设（`{"persona_id": "kunkun"}`）

