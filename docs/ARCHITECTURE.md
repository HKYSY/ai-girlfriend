# 架构设计文档

本文档描述虚拟伴侣项目的系统架构、数据流和关键设计决策。

---

## 📐 系统架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                          用户界面层                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      React 应用 (前端)                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │  │
│  │  │ChatWindow│  │Live2D    │  │Settings  │  │DiaryPanel│    │  │
│  │  │          │  │Canvas    │  │Page      │  │          │    │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │  │
│  │       │             │             │             │           │  │
│  │       └──────────────┴─────────────┴─────────────┘           │  │
│  │                           │                                   │  │
│  │                    api.ts (API 客户端)                        │  │
│  └───────────────────────────┼───────────────────────────────────┘  │
│                              │ HTTP/SSE                             │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          服务层                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Express 应用 (后端)                         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │  │
│  │  │路由模块  │  │中间件    │  │Persona   │  │工具函数  │    │  │
│  │  │(routes/) │  │(errorHan │  │System    │  │(utils.ts)│    │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │  │
│  │       │             │             │             │           │  │
│  │       └──────────────┴─────────────┴─────────────┘           │  │
│  │                           │                                   │  │
│  │                 storage.ts (数据访问层)                        │  │
│  └───────────────────────────┼───────────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   database.ts (SQLite 数据层)                 │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │  │
│  │  │messages│ │characters│ │diary │ │mood   │ │facts  │    │  │
│  │  │        │ │          │ │      │ │history│ │        │    │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          外部服务                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   DeepSeek API (LLM)                          │  │
│  │                 OpenAI 兼容格式 / SSE 流式                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🗂 目录结构说明

```
虚拟伴侣/
├── backend/                    # 后端代码
│   ├── src/
│   │   ├── index.ts           # 主入口：API 路由、SSE 聊天、AI 调用
│   │   ├── database.ts        # SQLite 数据层：表定义、CRUD、迁移
│   │   ├── storage.ts         # 角色管理、对话上下文加载
│   │   ├── persona.ts         # AI 人设、心情系统、桌宠/成就定义
│   │   ├── utils.ts           # 日记合并、心情标记解析
│   │   ├── routes/            # 路由模块（按功能拆分）
│   │   │   ├── character.ts   # 角色 CRUD
│   │   │   ├── diary.ts       # 日记查询
│   │   │   ├── mood.ts        # 心情历史
│   │   │   ├── sticker.ts     # 表情包管理
│   │   │   └── upload.ts      # 文件上传
│   │   ├── middleware/        # 中间件
│   │   │   └── errorHandler.ts
│   │   ├── types/             # TypeScript 类型定义
│   │   │   └── index.ts
│   │   └── __tests__/         # 单元测试
│   ├── data/                   # 运行时数据目录
│   │   ├── app.db             # SQLite 数据库
│   │   └── stickers/          # 表情包存储
│   ├── uploads/               # 上传的 Live2D 模型、头像
│   ├── .env.example           # 环境变量示例
│   └── package.json
│
├── frontend/                   # 前端代码
│   ├── src/
│   │   ├── components/        # React 组件（16 个）
│   │   │   ├── ChatWindow.tsx # 聊天窗口（核心）
│   │   │   ├── Live2DCanvas.tsx # Live2D 渲染
│   │   │   ├── SettingsPage.tsx # 设置页
│   │   │   ├── DiaryPanel.tsx # 日记面板
│   │   │   ├── StickerPanel.tsx # 表情包面板
│   │   │   └── ...            # 其他组件
│   │   ├── hooks/             # 自定义 Hook
│   │   │   ├── useChat.ts     # 聊天逻辑
│   │   │   └── useMood.ts     # 心情管理
│   │   ├── api.ts             # API 客户端封装
│   │   ├── App.tsx            # 主编排组件
│   │   ├── theme.ts           # 主题管理
│   │   └── utils.ts           # 工具函数
│   ├── public/
│   │   └── live2d/            # 预置 Live2D 模型
│   └── package.json
│
├── electron/                   # Electron 桌面端
│   └── main.mjs               # 主进程：窗口管理、后端启动
│
├── build/                      # 构建资源
│   └── icon.ico               # 应用图标
│
├── docs/                       # 文档目录
│   ├── API.md                 # API 文档
│   ├── ARCHITECTURE.md        # 架构文档（本文件）
│   └── CHANGELOG.md           # 更新日志
│
└── package.json               # 根配置（Electron 构建脚本）
```

---

## 🔄 数据流图

### 1. 聊天数据流

```
用户输入消息
     │
     ▼
┌──────────────┐
│ ChatWindow   │ 1. 用户输入
│ 组件         │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ useChat Hook │ 2. 调用 api.sendMessage()
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ api.ts       │ 3. 发送 POST /api/chat
│ (EventSource)│    建立 SSE 连接
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Express      │ 4. 处理请求
│ index.ts     │    - 加载角色配置
└──────┬───────┘    - 加载对话历史
       │            - 构建 System Prompt
       ▼            - 调用 DeepSeek API
┌──────────────┐
│ DeepSeek API │ 5. 流式返回 token
│ (SSE)        │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Express      │ 6. 解析心情标记
│              │    提取 <|mood:xx|>
└──────┬───────┘    记录心情历史
       │
       ▼
┌──────────────┐
│ SQLite       │ 7. 持久化存储
│ database.ts  │    - dbMessages.add()
└──────┬───────┘    - updateMoodWithHistory()
       │
       ▼
┌──────────────┐
│ 前端 SSE     │ 8. 接收事件流
│ (EventSource)│    - text: 显示文本
└──────┬───────┘    - mood: 更新心情
       │            - done: 结束连接
       ▼
┌──────────────┐
│ UI 渲染      │ 9. 更新界面
│ ChatWindow   │    - 显示 AI 回复
└──────────────┘    - 心情指示器变色
```

### 2. 日记生成数据流

```
用户打开应用
     │
     ▼
┌──────────────┐
│ App.tsx      │ 1. 检查今天是否首次打开
│ useEffect    │    调用 GET /api/diary
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Express      │ 2. 检查昨天是否有日记
│ /api/diary   │    hasTodayDiary()
└──────┬───────┘
       │
       ▼ (无日记)
┌──────────────┐
│ generateDiary│ 3. 加载昨天对话记录
│ 函数         │    构建 Prompt
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ DeepSeek API │ 4. AI 生成日记内容
│              │    第一人称视角
└──────┬───────┘    情感细节
       │
       ▼
┌──────────────┐
│ SQLite       │ 5. 存储日记
│ dbDiary.add  │    characterId + date + content
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ DiaryPanel   │ 6. 显示日记列表
│ 组件         │
└──────────────┘
```

---

## 🗄 数据库设计

### 表结构

#### 1. characters（角色表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | 角色 ID |
| name | TEXT | 角色名称 |
| personalityTemplate | TEXT | 性格模板 |
| customPersonality | TEXT | 自定义性格 |
| modelUrl | TEXT | Live2D 模型路径 |
| mood | INTEGER | 心情值 (0-100) |
| live2dPosition | TEXT | 模型位置（JSON） |
| apiProvider | TEXT | API 提供商 |
| apiKey | TEXT | API 密钥 |
| apiModel | TEXT | 模型名称 |
| apiUrl | TEXT | API 地址 |
| avatarUrl | TEXT | 头像 URL |
| createdAt | TEXT | 创建时间 |

#### 2. messages（消息表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 消息 ID |
| characterId | TEXT | 角色 ID（外键） |
| role | TEXT | 角色（user/assistant） |
| content | TEXT | 消息内容 |
| hidden | INTEGER | 是否隐藏（互动消息） |
| createdAt | TEXT | 创建时间 |

#### 3. diary（日记表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 日记 ID |
| characterId | TEXT | 角色 ID |
| date | TEXT | 日期（YYYY-MM-DD） |
| content | TEXT | 日记内容 |
| mood | INTEGER | 当时心情 |
| createdAt | TEXT | 创建时间 |

#### 4. mood_history（心情历史表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 记录 ID |
| characterId | TEXT | 角色 ID |
| mood | INTEGER | 心情值 |
| timestamp | INTEGER | 时间戳（毫秒） |

#### 5. pet_state（桌宠状态表）

| 字段 | 类型 | 说明 |
|------|------|------|
| characterId | TEXT PRIMARY KEY | 角色 ID |
| coins | INTEGER | 金币 |
| hunger | INTEGER | 饱腹感 (0-100) |
| fatigue | INTEGER | 疲劳度 (0-100) |
| intimacy | INTEGER | 亲密度 (0-100) |
| lastSignDate | TEXT | 上次签到日期 |
| unlockedAchievements | TEXT | 已解锁成就（JSON） |

#### 6. stickers（表情包表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY | 表情包 ID |
| filename | TEXT | 文件名 |
| category | TEXT | 分类 |
| keywords | TEXT | 关键词（JSON） |
| emotionMatch | TEXT | 情绪标签 |
| usageCount | INTEGER | 使用次数 |

---

## 🔑 关键设计决策

### 1. Live2D 集成方案

**决策**: 使用 `pixi-live2d-display-mulmotion` 库在 PixiJS 中渲染 Live2D 模型。

**原因**:
- PixiJS 是高性能 2D 渲染引擎，适合处理复杂动效
- 该库支持 Cubism 4 SDK，兼容最新 Live2D 模型
- 内置鼠标追踪、点击事件、动作播放等功能

**实现细节**:

```typescript
// Live2DCanvas.tsx 核心代码
import * as PIXI from 'pixi.js';
import { Live2DPlayer } from '@sekai-world/pixi-live2d-display-mulmotion';

// 创建 PixiJS 应用
const app = new PIXI.Application({
  width: 800,
  height: 600,
  backgroundAlpha: 0,
});

// 加载 Live2D 模型
const model = await Live2DPlayer.fromModelSettings(modelUrl);

// 视线跟随鼠标
model.on('mousemove', (e) => {
  model.focusController.focus(e.data.global.x, e.data.global.y);
});

// 点击触发动作
model.on('click', () => {
  model.motionManager.startRandomMotion('tap_body');
});
```

---

### 2. 心情系统设计

**决策**: 采用 10 级心情值 + 8 种情绪标签的组合方案。

**心情等级映射**:

| 心情值范围 | 等级 | 标签 | Emoji |
|-----------|------|------|-------|
| 90-100 | 满分开心 | 超级开心 | 😍 |
| 75-89 | 很开心 | 开心 | 😊 |
| 60-74 | 还不错 | 平静 | 😌 |
| 45-59 | 有点低落 | 难过 | 😔 |
| 30-44 | 不开心 | 生气 | 😤 |
| 0-29 | 很不开心 | 难过 | 😢 |

**心情变化机制**:

1. **AI 输出心情标记**: AI 回复开头包含 `<|mood:75|>`
2. **AI 情感分析兜底**: AI 未输出时，分析用户消息情感
3. **保底机制**: 情绪标签与心情值不一致时强制调整
4. **衰减机制**: 长时间不聊天心情自动下降

**心情联动效果**:
- UI 极光色调变化（开心偏粉，低落偏蓝）
- 心情指示器颜色变化
- Live2D 模型表情切换

---

### 3. 日记生成策略

**决策**: AI 每天生成一篇第一人称日记，字数根据当天聊天量动态调整。

**字数规则**:

| 对话数量 | 字数范围 |
|---------|---------|
| ≤5 条 | 80-150 字 |
| 6-15 条 | 150-300 字 |
| 16-30 条 | 250-450 字 |
| >30 条 | 350-600 字 |

**Prompt 设计要点**:
- 明确角色身份："你是玉子，正在写自己的私人日记"
- 强调第一人称："用'我'来写，'我'指的是你"
- 禁止流水账："不要复述对话内容，而是写感受、想法"
- 鼓励细节："不只是说'很开心'，而是说'他主动说了xxx，心里像冒泡泡'"
- 禁止标记："不要出现 `<|mood:xx|>` 标记"

---

### 4. 对话记忆优化

**问题**: 长期对话导致 Token 消耗过大，成本高昂。

**解决方案**: 分级发送 + 自动摘要

**分级规则**:

| 位置 | 发送方式 | 原因 |
|------|---------|------|
| 最近 10 条 | 完整原文 | AI 需要清晰理解最近对话 |
| 11-25 条 | 截取前 100 字 | AI 只需知道聊了什么 |
| 26 条以上 | 不发送 | 靠摘要记忆 |

**自动摘要触发**:
- 对话超过 50 条时触发
- 将旧消息压缩成 400 字以内的摘要
- 保留关键信息：事实、约定、关系进展、用户信息

**Token 节省效果**: 约 60%

---

### 5. SSE 流式响应设计

**决策**: 所有 AI 回复采用 Server-Sent Events 流式传输。

**优势**:
- 用户体验：逐字显示，像真人发微信
- 降低延迟：无需等待完整回复生成
- 错误处理：可随时中断连接

**事件类型设计**:

| 事件 | 说明 | 前端处理 |
|------|------|---------|
| `text` | 文本片段 | 追加到聊天框 |
| `mood` | 心情值更新 | 更新心情指示器 |
| `emotion` | 情绪标签 | 触发表情/动作 |
| `sticker` | AI 发表情包 | 显示表情包图片 |
| `petState` | 桌宠状态更新 | 更新金币/疲劳度等 |
| `done` | 流式结束 | 关闭连接 |
| `error` | 错误信息 | 显示错误提示 |

**前端实现**:

```typescript
// api.ts
function sendMessage(message: string, characterId: string) {
  const eventSource = new EventSource(`/api/chat?...`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'text':
        appendText(data.text);
        break;
      case 'mood':
        updateMood(data.mood);
        break;
      case 'done':
        eventSource.close();
        break;
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    showError('连接中断');
  };
}
```

---

### 6. 数据持久化策略

**决策**: SQLite 数据库 + JSON 备份快照

**SQLite 优势**:
- 单文件部署，无需额外服务
- 支持 WAL 模式，读写性能好
- 适合桌面应用

**JSON 备份策略**:
- 每次聊天后自动备份到 `data/backups/`
- 每个角色最多保留 50 份快照
- 支持手动导出对话记录

**数据隔离**:
- 开发模式：数据存储在项目目录
- 桌面模式：数据存储在 `%AppData%/虚拟伴侣/`

---

### 7. 错误处理设计

**后端错误处理**:
- 全局错误中间件捕获异常
- AI 调用超时（120 秒）自动中断
- 网络错误时保存默认回复到数据库，保证对话连贯

**前端错误处理**:
- SSE 连接中断自动重连（最多 3 次）
- 显示友好错误提示
- 本地缓存未发送消息

---

## 🎨 设计系统

### OKLCH 色彩系统

项目使用 **OKLCH** 色彩空间，确保感知均匀的颜色过渡。

```css
/* 品牌色 */
--brand-primary: oklch(0.7 0.15 340);   /* 粉色 */
--brand-secondary: oklch(0.6 0.12 260);  /* 紫色 */

/* 心情联动色 */
--mood-happy: oklch(0.75 0.18 340);      /* 开心：偏粉 */
--mood-sad: oklch(0.45 0.08 260);        /* 低落：偏蓝 */
```

### 动效设计

- **入场动画**: 消息滑入 + 淡入（0.3s ease-out）
- **心跳脉动**: AI 思考时光晕呼吸（1.5s infinite）
- **极光流动**: 心情联动色调渐变（4s linear infinite）
- **流星划过**: 背景星空随机流星（每 5-15 秒）

---

## 🔧 性能优化

### 前端优化

1. **React 组件懒加载**: 设置页等非首屏组件使用 `React.lazy()`
2. **虚拟列表**: 消息列表使用虚拟滚动（超过 100 条时）
3. **Live2D 模型缓存**: 切换角色时不销毁模型，仅隐藏

### 后端优化

1. **数据库索引**: `characterId`、`createdAt` 字段建立索引
2. **连接池**: SQLite 使用 WAL 模式提升并发性能
3. **AI 调用优化**: 分级发送减少 Token 消耗

---

## 🔐 安全设计

1. **API Key 加密**: 不在前端存储，仅后端使用
2. **文件上传限制**: 模型文件最大 100MB，头像最大 2MB
3. **路径遍历防护**: 检查模型 ID 是否包含 `..`、`/`、`\`
4. **临时文件隔离**: 表情包临时目录拒绝外部访问

---

## 📚 相关文档

- [API 接口文档](API.md)
- [贡献指南](../CONTRIBUTING.md)
- [更新日志](CHANGELOG.md)

---

**最后更新**: 2026-07-24