# 使用官方 Node.js 运行时作为基础镜像
FROM node:18-alpine AS base

# 安装依赖阶段
FROM base AS deps
# 检查 pnpm 是否可用，如果不可用则回退到 npm
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# 复制依赖文件
COPY package.json pnpm-lock.yaml* ./
# 如果使用 npm，取消下面的注释并注释掉 pnpm 行
# COPY package.json package-lock.json* ./

# 安装依赖
RUN pnpm install --frozen-lockfile
# 如果使用 npm，使用: RUN npm ci

# 构建阶段
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 设置环境变量（构建时）
# Next.js 在构建时需要知道这些环境变量
ARG DEEPSEEK_API_KEY
ENV DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY

# 禁用 Next.js 遥测
ENV NEXT_TELEMETRY_DISABLED 1

# 构建应用
RUN pnpm build
# 如果使用 npm，使用: RUN npm run build

# 运行阶段
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制必要的文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# 启动应用
CMD ["node", "server.js"]

