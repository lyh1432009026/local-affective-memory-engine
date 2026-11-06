# ==========================================
# 阶段 1: 依赖安装与 TypeScript 编译阶段
# ==========================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# 安装 C++ 编译工具链（better-sqlite3 等原生模块必需）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    gcc \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 复制依赖定义
COPY package.json package-lock.json ./

# 安装全量依赖（包括 devDependencies 用于编译）
RUN npm ci

# 复制源码与配置
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

# 编译 TypeScript 并同步 schema.sql
RUN npm run build

# 剔除 devDependencies，仅保留生产运行时原生依赖
RUN npm prune --omit=dev

# ==========================================
# 阶段 2: 极简轻量生产运行时镜像
# ==========================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# 安装生产环境基础运维依赖（curl 用于健康检查）
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 从构建阶段复制生产依赖与编译产物
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# 创建持久化数据与模型缓存目录
RUN mkdir -p /app/data /app/data/hf_cache

# 生产环境变量配置
ENV NODE_ENV=production \
    PORT=4100 \
    HF_HOME=/app/data/hf_cache \
    HF_MIRROR=https://hf-mirror.com

# 声明数据持久化挂载卷
VOLUME ["/app/data"]

# 暴露服务端口
EXPOSE 4100

# 容器健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:4100/health || exit 1

# 启动引擎
CMD ["node", "dist/index.js"]
