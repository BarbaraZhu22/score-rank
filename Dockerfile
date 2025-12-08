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
# 启用 pnpm（与 deps 阶段保持一致）
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 注意：环境变量 DEEPSEEK_API_KEY 应该在运行时通过云平台的环境变量配置传入
# 不需要在构建时传入，因为 API 调用是在运行时进行的

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

# 复制 standalone 输出
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# 注意：环境变量 DEEPSEEK_API_KEY 需要在运行时通过云平台的环境变量配置传入
# 云平台会自动将环境变量注入到容器运行时环境中
# 如果使用 docker run，使用: docker run -e DEEPSEEK_API_KEY=your_key ...
# 如果使用 docker-compose，环境变量会从 .env 文件或环境变量中读取

# 启动应用
CMD ["node", "server.js"]

