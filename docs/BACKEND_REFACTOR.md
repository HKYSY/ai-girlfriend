# 后端路由拆分方案

## 1. 概述

### 当前状态
- `backend/src/index.ts`：2911行，包含所有API路由
- 难以维护、难以测试、难以扩展

### 目标
- 按功能模块拆分路由
- 提高可维护性
- 便于单元测试
- 统一错误处理

---

## 2. 目录结构

```
backend/src/
├── index.ts          # 主入口，注册路由
├── routes/
│   ├── chat.ts       # 聊天相关API
│   ├── character.ts  # 角色管理API
│   ├── pet.ts        # 桌宠互动API
│   ├── diary.ts      # 日记API
│   ├── sticker.ts    # 表情包API
│   ├── mood.ts       # 心情历史API
│   └── upload.ts     # 文件上传API
├── middleware/
│   ├── errorHandler.ts   # 统一错误处理
│   └── validate.ts       # 请求验证
├── types/
│   └── index.ts      # 共享类型定义
├── database.ts       # 数据库操作
├── persona.ts        # AI人格提示词
├── storage.ts        # 存储服务
└── utils.ts          # 工具函数
```

---

## 3. 路由拆分详情

### 3.1 chat.ts - 聊天相关（约400行）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/chat` | POST | 流式聊天（SSE） |
| `/api/proactive` | POST | 主动消息 |
| `/api/pet-interact` | POST | 桌宠互动触发AI回复 |
| `/api/daily-greeting` | POST | 每日问候 |

**依赖模块**：`persona.ts`, `database.ts`, `utils.ts`

---

### 3.2 character.ts - 角色管理（约300行）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/characters` | GET | 获取角色列表 |
| `/api/characters/:id` | GET | 获取角色详情 |
| `/api/characters` | POST | 创建角色 |
| `/api/characters/:id` | PUT | 更新角色 |
| `/api/characters/:id` | DELETE | 删除角色 |
| `/api/characters/:id/messages` | GET | 获取消息历史 |
| `/api/clear-conversation/:id` | POST | 清空对话 |
| `/api/export/:id` | GET | 导出对话 |
| `/api/test-connection` | POST | 测试API连接 |

**依赖模块**：`database.ts`

---

### 3.3 pet.ts - 桌宠互动（约350行）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/pet-state/:id` | GET | 获取桌宠状态 |
| `/api/pet-interact` | POST | 互动操作（摸头/喂食/玩耍） |
| `/api/pet-decay/:id` | POST | 状态衰减 |
| `/api/mood-decay/:id` | POST | 心情衰减 |

**依赖模块**：`database.ts`, `persona.ts`

---

### 3.4 diary.ts - 日记系统（约200行）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/diary/:characterId` | GET | 获取日记列表 |
| `/api/diary/:characterId/:date` | GET | 获取单篇日记 |
| `/api/backfill-diaries/:id` | POST | 补生成日记 |

**依赖模块**：`database.ts`, `persona.ts`

---

### 3.5 sticker.ts - 表情包（约150行）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/stickers` | GET | 获取所有表情包 |
| `/api/stickers/category/:category` | GET | 按分类获取 |
| `/api/stickers/search/:keyword` | GET | 搜索表情包 |
| `/api/stickers/upload` | POST | 上传表情包 |
| `/api/stickers/:id` | DELETE | 删除表情包 |

**依赖模块**：`database.ts`

---

### 3.6 mood.ts - 心情历史（约100行）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/mood-history/:id` | GET | 获取心情历史 |

**依赖模块**：`database.ts`

---

### 3.7 upload.ts - 文件上传（约150行）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/upload-live2d` | POST | 上传Live2D模型 |
| `/api/models` | GET | 获取模型列表 |
| `/api/models/:id` | DELETE | 删除模型 |
| `/api/preset-models` | GET | 获取预设模型 |

**依赖模块**：`storage.ts`

---

## 4. 中间件设计

### 4.1 errorHandler.ts

```typescript
import { Request, Response, NextFunction } from 'express';

// 自定义错误类
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
  }
}

// 统一错误处理中间件
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[Error]', err);
  
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }
  
  // 未知错误
  return res.status(500).json({
    error: '服务器内部错误',
  });
}

// 异步路由包装器
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

---

## 5. 主入口重构示例

### index.ts（重构后）

```typescript
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import chatRoutes from './routes/chat';
import characterRoutes from './routes/character';
import petRoutes from './routes/pet';
import diaryRoutes from './routes/diary';
import stickerRoutes from './routes/sticker';
import moodRoutes from './routes/mood';
import uploadRoutes from './routes/upload';

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件
app.use('/live2d', express.static('public/live2d'));
app.use('/stickers', express.static('data/stickers'));

// 注册路由
app.use('/api', chatRoutes);
app.use('/api', characterRoutes);
app.use('/api', petRoutes);
app.use('/api', diaryRoutes);
app.use('/api', stickerRoutes);
app.use('/api', moodRoutes);
app.use('/api', uploadRoutes);

// 错误处理
app.use(errorHandler);

// 启动服务器
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`后端服务已启动: http://localhost:${PORT}`);
});
```

---

## 6. 执行步骤

### 阶段1：准备工作
1. 创建`routes/`目录
2. 创建`middleware/`目录
3. 创建`types/`目录
4. 创建错误处理中间件

### 阶段2：拆分路由（按优先级）
1. **P1**：`character.ts` - 角色管理（独立性强）
2. **P2**：`upload.ts` - 文件上传（独立性强）
3. **P3**：`sticker.ts` - 表情包（独立性强）
4. **P4**：`diary.ts` - 日记（独立性强）
5. **P5**：`mood.ts` - 心情历史（独立性强）
6. **P6**：`pet.ts` - 桌宠互动（依赖persona）
7. **P7**：`chat.ts` - 聊天（最复杂，依赖最多）

### 阶段3：更新主入口
1. 导入所有路由模块
2. 注册路由
3. 添加错误处理中间件

### 阶段4：测试验证
1. 运行现有单元测试
2. 手动测试所有API端点
3. 检查错误处理是否正常

---

## 7. 风险与回滚

### 风险
- 拆分过程中可能引入bug
- 依赖关系复杂，可能遗漏导入
- SSE流式响应可能需要特殊处理

### 回滚方案
- Git提交前创建备份分支
- 保留原`index.ts`备份
- 出现问题时可快速回滚

---

## 8. 预估时间

| 任务 | 预估时间 |
|------|----------|
| 创建目录结构 | 5分钟 |
| 创建中间件 | 10分钟 |
| 拆分character.ts | 15分钟 |
| 拆分upload.ts | 10分钟 |
| 拆分sticker.ts | 10分钟 |
| 拆分diary.ts | 10分钟 |
| 拆分mood.ts | 5分钟 |
| 拆分pet.ts | 15分钟 |
| 拆分chat.ts | 20分钟 |
| 更新主入口 | 10分钟 |
| 测试验证 | 20分钟 |
| **总计** | **约2小时** |

---

## 9. 确认事项

请确认以下内容后开始执行：

1. ✅ 已提交当前代码到Git
2. ✅ 理解拆分方案和风险
3. ✅ 同意预估时间
4. ✅ 准备好测试验证

**确认后回复"开始执行"即可开始拆分。**