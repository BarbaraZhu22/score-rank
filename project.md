⸻

Competition Admin System — 浏览器端 OCR + AI 自动评分模板

1. 项目简介

本项目是一个 基于 Next.js + React 的比赛管理系统模板，支持：
        •        浏览器端 OCR（tesseract.js）读取图片中的评分表信息
        •        AI 操作代理（DeepSeek 或 mock），生成 JSON Actions
        •        操作预览与确认机制，确保数据不丢失
        •        本地持久化（IndexedDB via Dexie）
        •        可导出 Excel 文件
        •        响应式布局与简单“街头风”配色
        •        Undo / Redo 功能

设计理念：一体化前端即可运行，无需任何独立服务或服务器端 OCR。

⸻

2. 项目结构说明

competition-admin/
├─ pages/
│  ├─ index.tsx           # 比赛列表 + 创建比赛入口
│  └─ match/[id].tsx      # 比赛详情页：TableView + AI Prompt + ConfirmModal
├─ components/
│  ├─ TableView.tsx       # 主评分表格
│  ├─ AiPrompt.tsx        # AI 操作输入组件（文本 / 图片上传）
│  └─ ConfirmModal.tsx    # AI 变更确认弹窗
├─ lib/
│  ├─ db.ts               # Dexie 数据库封装
│  ├─ actions.ts          # Action handler（updateScore / addContestant / recalc）
│  ├─ ai.ts               # DeepSeek API stub（可替换成真实 endpoint）
│  └─ ocr.ts              # 浏览器端 OCR 封装（tesseract.js）
├─ styles/
│  └─ globals.css         # 响应式布局 + 街头风配色
├─ package.json
├─ tsconfig.json
└─ next.config.js


⸻

3. 核心技术点

3.1 浏览器端 OCR
        •        使用 tesseract.js
        •        客户端直接处理图片 → 输出文本 → 作为 AI Prompt 输入
        •        无需额外服务器

示例调用：

import { runOCR } from '@/lib/ocr'

const text = await runOCR(uploadedFile)
console.log('OCR 结果：', text)


⸻

3.2 AI 操作管道
        •        输入：文字 / OCR 文本
        •        输出：JSON actions
        •        actions 示例：

[
  { "type": "updateScore", "contestant": "张三", "judge": "Judge A", "value": 8.8 },
  { "type": "addContestant", "name": "王五" }
]

        •        变更不会直接写入表格，而是先显示在 ConfirmModal 供用户确认

⸻

3.3 数据持久化
        •        使用 Dexie IndexedDB
        •        每次确认的变更写入 DB
        •        支持 Undo / Redo
        •        可持久保存比赛和历史记录

⸻

3.4 UI 与交互
        •        TableView：显示评分表，空值 / AI 修改 / 错误单元格颜色区分
        •        AI Prompt：上传图片 / 输入文字 → AI 生成 actions
        •        ConfirmModal：预览操作 → 用户确认写入
        •        浮动 AI 按钮：便于随时打开操作界面
        •        Excel 导出：可将当前表格导出，保留异常/未识别数据

⸻

4. 使用方式（Customer 指南）
        1.        安装依赖：

npm install

        2.        启动开发：

npm run dev

浏览器访问：http://localhost:3000
        3.        创建比赛：

        •        点击“+ 创建比赛”
        •        输入裁判名字 / 选手信息（可空）
        •        点击进入比赛详情

        4.        AI 操作：

        •        点击右下浮动 AI 按钮
        •        上传图片或输入文字 → 点击“发送给 AI”
        •        查看 ConfirmModal 预览操作 → 确认写入

        5.        编辑表格：

        •        双击单元格手动修改
        •        自动计算总分
        •        空值 / AI 值 / 错误值用不同颜色显示

        6.        导出 Excel：

        •        点击导出按钮 → 保存当前表格（包含异常行）

        7.        历史回滚：

        •        Undo / Redo 按钮恢复或重做操作

⸻

5. 技术战略说明
        1.        前端一体化：无服务器端 OCR，部署简单
        2.        数据安全：所有操作需用户确认才写入，确保数据不会丢失
        3.        AI 可扩展：DeepSeek 端点可替换或升级，现有结构支持多 Action 类型
        4.        用户体验：响应式布局 + 街头风配色，操作直观
        5.        可扩展性：
        •        可增加更多裁判 / 评分规则
        •        OCR 可替换成其他 JS OCR 库
        •        Excel 导出可自定义模板
        •        支持多比赛、多历史记录管理

