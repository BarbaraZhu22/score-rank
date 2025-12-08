# Competition Admin System

比赛管理系统 - 浏览器端 OCR + AI 自动评分模板

## 功能特性

- 🖼️ **浏览器端 OCR**：使用 tesseract.js 读取图片中的评分表信息
- 🤖 **AI 操作代理**：DeepSeek 或 mock，生成 JSON Actions
- ✅ **操作预览与确认**：确保数据不丢失
- 💾 **本地持久化**：IndexedDB via Dexie
- 📊 **Excel 导出**：可导出当前表格
- 🎨 **响应式布局**：街头风配色
- ↶ **Undo / Redo**：历史回滚功能

## 技术栈

- Next.js 14
- React 18
- TypeScript
- Dexie (IndexedDB)
- tesseract.js (OCR)
- xlsx (Excel 导出)

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

浏览器访问：http://localhost:3000

## 使用指南

### 1. 创建比赛

- 点击首页的 "+ 创建比赛" 按钮
- 输入比赛名称（必填）
- 输入裁判名称（可选，用逗号或换行分隔）
- 输入选手名称（可选，用逗号或换行分隔）
- 点击创建进入比赛详情页

### 2. AI 操作

- 点击右下角的浮动 AI 按钮（🤖）
- 上传图片（OCR 识别）或输入文字指令
- 点击"发送给 AI"
- 在确认弹窗中预览操作
- 确认后应用到评分表

### 3. 编辑表格

- 双击单元格可手动修改分数
- 自动计算总分和平均分
- 空值 / AI 值 / 错误值用不同颜色显示

### 4. 导出 Excel

- 在比赛详情页点击"导出 Excel"按钮
- 保存当前表格（包含所有数据）

### 5. 历史回滚

- 使用 Undo / Redo 按钮恢复或重做操作

## 项目结构

```
competition-admin/
├─ pages/
│  ├─ index.tsx           # 比赛列表 + 创建比赛入口
│  └─ match/[id].tsx      # 比赛详情页
├─ components/
│  ├─ TableView.tsx       # 主评分表格
│  ├─ AiPrompt.tsx        # AI 操作输入组件
│  └─ ConfirmModal.tsx    # AI 变更确认弹窗
├─ lib/
│  ├─ db.ts               # Dexie 数据库封装
│  ├─ actions.ts          # Action handler
│  ├─ ai.ts               # DeepSeek API stub
│  └─ ocr.ts              # 浏览器端 OCR 封装
├─ styles/
│  └─ globals.css         # 响应式布局 + 街头风配色
└─ package.json
```

## AI 指令示例

- `张三 Judge A 8.8` - 更新分数
- `添加选手 王五` - 添加新选手
- `添加裁判 Judge B` - 添加新裁判

## 配置 DeepSeek API

编辑 `lib/ai.ts`，取消注释 DeepSeek API 调用代码，并设置 API Key：

```typescript
const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
  // ... 配置 API Key
});
```

## 构建生产版本

```bash
npm run build
npm start
```

## 许可证

MIT

