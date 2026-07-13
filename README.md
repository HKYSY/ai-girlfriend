# 虚拟伴侣 💕

> 基于 Live2D 虚拟形象 + 大语言模型的桌面端 Web 应用——"有情感记忆的虚拟伴侣"。
> 支持 **浏览器开发模式** 和 **Electron 桌面应用** 双形态运行。

她记得你说过的话，会因为你开心而开心，也会因为你冷落她而撒娇生气——不只是一个聊天框，而是一个会成长、会写日记、会陪你玩游戏的虚拟伴侣。

---

## ✨ 特性亮点

### 情感化对话
- **SSE 流式输出**，逐字显示，像真人发微信
- **10 级心情系统** + 8 种情绪标签，回复语气随心情变化
- **AI 主动发消息**（5 分钟无互动触发）
- **心情自动衰减**，长时间不聊她会失落
- **情感分析兜底**，AI 没输出心情标记时自动分析

### 长期记忆
- **对话永久保留**（SQLite 数据库，不自动删除）
- **对话分级发送**（Token 优化）：近 10 条原文 → 11-25 条截断 → 26+ 走摘要，省约 60% token
- **事实记忆**：AI 自动提取关键事实（生日、约定、喜好等，7 种类型）
- **智能搜索**：按关键词搜索历史聊天
- **对话摘要**：超 50 条自动压缩存档

### 桌宠养成
- 金币 / 饱腹感 / 疲劳度 / 亲密度状态系统
- 每日签到、商店、约会、猜拳、猜数字、幸运转盘
- 8 类多档位成就系统
- 状态衰减（长时间不互动饱腹感下降）

### Live2D 交互
- Cubism 4 模型渲染，拖拽 / 缩放 / 表情 / 动作
- 视线跟随鼠标、对话气泡、点击反馈
- 分栏布局可拖拽调整

### 日记系统
- 每天首次打开自动生成**昨天**的日记
- 字数根据当天聊天量动态调整（50-400 字）
- 一天一篇，AI 女友第一人称视角
- 连续多天未打开自动补生成最近 7 天

### 沉浸式动效
- 🌌 深色模式星空主题 + 流星划过
- 💗 AI 思考时心跳脉动光晕
- 🌈 心情联动极光色调（心情好偏粉，差偏冷蓝）
- ✨ 消息景深入场、打字三点呼吸、新消息光带
- 💕 发送心形粒子、心情 emoji 弹性变脸
- 🎯 Live2D 模型心情光晕

### 自定义设置（5 大模块）
- **角色档案**：详细性格设计器（8 字段 + 2 预设模板）、头像上传
- **聊天外观**：用户头像、AI/用户气泡颜色（预设+取色器）、字体大小、实时预览
- **形象**：预设/上传模型、拖拽上传、格式标签
- **AI 模型**：自定义服务商/Key/模型、连接测试、快捷选择、申请引导
- **数据**：全角色统计总览、对话导出、清空管理

---

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + PixiJS + pixi-live2d-display-mulmotion + Ant Design + Recharts |
| 后端 | Express + TypeScript + better-sqlite3 + multer + node-7z |
| 桌面端 | Electron 31 + electron-builder（NSIS 安装包） |
| AI | DeepSeek API（OpenAI 兼容格式，SSE 流式），支持角色级自定义服务商 |
| 数据 | SQLite（WAL 模式）+ JSON 备份快照 |
| 设计 | OKLCH 色彩系统 + CSS 变量 tokens + 深色星空主题 |

---

## 🚀 快速开始

### 前置条件
- **Node.js** ≥ 18（推荐 20 LTS）
- **DeepSeek API Key**（从 [platform.deepseek.com](https://platform.deepseek.com) 获取）

### 安装运行

```bash
# 1. 后端配置
cd backend
cp .env.example .env      # 填入 DEEPSEEK_API_KEY
npm install
npm run dev               # 启动后端（端口 3001，热重载）

# 2. 前端启动（新开终端）
cd frontend
npm install
npm run dev               # 启动前端（Vite，端口 5173）
```

浏览器打开 `http://localhost:5173` 即可使用。

### 🖥 桌面应用打包（Electron）

除了浏览器开发模式，还支持打包成 Windows 桌面应用（.exe），双击即可运行，无需安装 Node.js。

```bash
# 根目录安装依赖（Electron 工具链 + 后端依赖提升）
npm install

# 打包桌面应用（生成 out/win-unpacked/虚拟伴侣.exe，用于测试）
npm run electron:build

# 打包 NSIS 安装包（生成 out/虚拟伴侣 Setup.exe，用于发布）
npm run electron:dist
```

**关键设计**：
- 打包后 native 模块（better-sqlite3）自动 rebuild 为 Electron ABI，打包完自动恢复 Node ABI，**开发模式 `npm run dev` 永远不受影响**
- 桌面版数据存储在系统 userData 目录（`%AppData%/虚拟伴侣/`），与开发模式数据隔离
- 启动日志写在 `%AppData%/virtual-companion/main.log`，方便排查问题
- 自定义图标放在 `build/icon.ico`

### 环境变量

| 变量 | 位置 | 必填 | 说明 |
|------|------|------|------|
| `DEEPSEEK_API_KEY` | backend/.env | 是 | DeepSeek API 密钥 |
| `DEEPSEEK_MODEL` | backend/.env | 否 | 模型名，默认 `deepseek-v4-flash` |
| `PORT` | backend/.env | 否 | 后端端口，默认 3001 |

> 也可以在前端「设置 → AI 模型」里为每个角色单独配置服务商/Key/模型，角色配置优先于 .env。

---

## 📁 目录结构

```
虚拟伴侣/
├── backend/
│   ├── src/
│   │   ├── index.ts          # API 路由 + SSE 流式聊天 + 日记/事实/摘要生成
│   │   ├── database.ts       # SQLite 数据层（8 张表 + 迁移 + CRUD）
│   │   ├── storage.ts        # 角色管理 + 对话上下文
│   │   ├── persona.ts        # AI 人设 + 心情系统 + 桌宠/成就定义
│   │   └── utils.ts          # 日记合并 + 心情标记解析
│   ├── data/app.db           # SQLite 数据库（运行时生成）
│   └── uploads/              # 上传的 Live2D 模型 + 头像
├── frontend/
│   ├── src/
│   │   ├── components/       # 16 个 React 组件
│   │   ├── api.ts            # 前端 API 客户端
│   │   ├── theme.ts          # 主题管理
│   │   ├── tokens.css        # 设计令牌 + 深色星空主题
│   │   ├── settings.css      # 设置页样式
│   │   └── App.tsx           # 主编排组件
│   └── public/live2d/        # 预设 Live2D 模型
├── electron/
│   └── main.mjs              # Electron 主进程（后端启动 + 窗口管理 + 错误处理）
├── build/
│   └── icon.ico              # 应用图标
├── package.json              # 根配置（Electron + 后端依赖提升 + 构建脚本）
└── 项目立项文档.md            # 详细设计文档
```

---

## 📊 数据库表

| 表 | 说明 |
|----|------|
| `characters` | 角色元数据（含 API 配置、头像） |
| `messages` | 对话消息（永久保留） |
| `conversation_meta` | 对话元信息（摘要、最后心情） |
| `memory_facts` | 事实记忆（7 种类型） |
| `memory_summaries` | 长期摘要 |
| `pet_state` | 桌宠状态 + 成就统计 |
| `mood_history` | 心情历史（30 天） |
| `diary` | AI 日记（90 天） |

---

## 🎨 设计系统

- **OKLCH 色彩**：感知均匀的色彩空间，深浅模式过渡自然
- **CSS 变量 tokens**：品牌色、间距、圆角、阴影、动效曲线统一管理
- **深色星空主题**：4 档星空层 + 极光光晕 + 流星，氛围沉浸
- **z-index 语义化**：dropdown < sticky < overlay < modal < toast
- **无障碍**：`prefers-reduced-motion` 全覆盖，所有动画可降级

---

## 🔧 开发说明

- 前后端均 TypeScript + ESM
- 后端开发用 `tsx watch` 热重载，生产用 `tsc` 编译
- Vite 自动代理 `/api/*` 到后端 3001
- 删除角色时数据库级联清理关联数据
- 对话每次聊天后自动 JSON 备份（每角色最多 50 份）

---

## 📝 版本

- **v1.1**：SQLite 迁移 + Token 优化 + 日记重构 + AI 模型自定义 + impeccable 设计系统
- **v1.2**：设置页 5 模块重构 + 聊天外观自定义 + 沉浸式动效 + 头像系统 + 数据管理升级 + 时区修复
- **v1.3**：Electron 桌面化 + 自定义图标 + native 模块 ABI 隔离 + 端口冲突处理 + 前端 dist 托管

---

## 📄 License

MIT
