# API 接口文档

本文档列出虚拟伴侣项目所有后端 API 端点。

**基础路径**: `http://localhost:3001/api`

**认证方式**: 无（本地应用）

---

## 📋 目录

- [角色管理](#角色管理)
- [聊天](#聊天)
- [心情管理](#心情管理)
- [日记系统](#日记系统)
- [表情包管理](#表情包管理)
- [文件上传](#文件上传)
- [桌宠系统](#桌宠系统)
- [消息管理](#消息管理)
- [事实记忆](#事实记忆)
- [统计接口](#统计接口)

---

## 角色管理

### 获取所有角色

```http
GET /api/characters
```

**描述**: 获取所有角色列表

**响应示例**:

```json
[
  {
    "id": "abc123",
    "name": "玉子",
    "personalityTemplate": "yuko",
    "customPersonality": "",
    "modelUrl": "/live2d/icegirl/IceGirl.model3.json",
    "mood": 65,
    "live2dPosition": { "x": 0, "y": 0, "scale": 1 },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "apiProvider": "deepseek",
    "apiKey": "",
    "apiModel": "",
    "apiUrl": "",
    "avatarUrl": ""
  }
]
```

---

### 获取单个角色详情

```http
GET /api/characters/:id
```

**描述**: 获取角色详情及对话历史

**路径参数**:
- `id`: 角色 ID（必填）

**响应示例**:

```json
{
  "character": {
    "id": "abc123",
    "name": "玉子",
    "mood": 65,
    "modelUrl": "/live2d/icegirl/IceGirl.model3.json"
  },
  "conversation": {
    "messages": [
      { "role": "user", "content": "你好" },
      { "role": "assistant", "content": "你好呀~" }
    ],
    "summary": "",
    "lastMood": 65
  }
}
```

**心情惩罚机制**:
- 1 天未活跃：心情 -30
- 2 天未活跃：心情 -50
- 3 天及以上：心情归零

---

### 创建角色

```http
POST /api/characters
```

**描述**: 创建新角色

**请求体**:

```json
{
  "name": "玉子",
  "personalityTemplate": "yuko",
  "customPersonality": "",
  "modelUrl": "/live2d/icegirl/IceGirl.model3.json"
}
```

**参数说明**:
- `name` (string, 必填): 角色名称
- `personalityTemplate` (string, 可选): 性格模板，默认 `yuko`
- `customPersonality` (string, 可选): 自定义性格描述
- `modelUrl` (string, 可选): Live2D 模型路径

**响应示例**:

```json
{
  "id": "abc123",
  "name": "玉子",
  "mood": 60,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

### 更新角色

```http
PUT /api/characters/:id
```

**描述**: 更新角色信息

**路径参数**:
- `id`: 角色 ID（必填）

**请求体**:

```json
{
  "name": "新名字",
  "mood": 80,
  "apiProvider": "deepseek",
  "apiKey": "sk-xxx",
  "apiModel": "deepseek-v4-flash"
}
```

**响应示例**:

```json
{
  "id": "abc123",
  "name": "新名字",
  "mood": 80
}
```

---

### 删除角色

```http
DELETE /api/characters/:id
```

**描述**: 删除角色及关联数据

**响应示例**:

```json
{
  "ok": true
}
```

---

### 清空对话记忆

```http
DELETE /api/characters/:id/conversation
```

**描述**: 清空角色对话记忆并重置心情为 60

**响应示例**:

```json
{
  "ok": true,
  "message": "记忆已清空"
}
```

---

### 导出对话记录

```http
GET /api/characters/:id/export
```

**描述**: 导出角色的全部对话记录（JSON 下载）

**响应**: JSON 文件下载

---

### 测试 API 连接

```http
POST /api/test-connection
```

**描述**: 测试 AI API 连接是否正常

**请求体**:

```json
{
  "provider": "deepseek",
  "apiKey": "sk-xxx",
  "apiModel": "deepseek-v4-flash",
  "apiUrl": "https://api.deepseek.com/v1/chat/completions"
}
```

**响应示例**:

```json
{
  "ok": true,
  "latency": 523,
  "model": "deepseek-v4-flash"
}
```

---

## 聊天

### 发送消息（SSE 流式）

```http
POST /api/chat
```

**描述**: 发送消息并获取 AI 流式回复

**请求体**:

```json
{
  "message": "你好",
  "characterId": "abc123"
}
```

**参数说明**:
- `message` (string, 必填): 用户消息
- `characterId` (string, 必填): 角色 ID

**响应**: Server-Sent Events (SSE)

**事件类型**:

| 事件 | 说明 | 数据示例 |
|------|------|----------|
| `text` | 文本片段（逐字推送） | `{ "type": "text", "text": "你好" }` |
| `mood` | 心情值更新 | `{ "type": "mood", "mood": 75 }` |
| `emotion` | 情绪标签 | `{ "type": "emotion", "emotion": "开心" }` |
| `sticker` | AI 发送表情包 | `{ "type": "sticker", "sticker": { "id": 1, "url": "/stickers/xxx.png" } }` |
| `petState` | 桌宠状态更新 | `{ "type": "petState", "petState": {...}, "coinReward": 5 }` |
| `done` | 流式结束 | `{ "type": "done" }` |
| `error` | 错误信息 | `{ "type": "error", "error": "错误描述" }` |

---

### AI 主动发消息

```http
POST /api/proactive
```

**描述**: 触发 AI 主动发送消息（5 分钟无互动时调用）

**请求体**:

```json
{
  "characterId": "abc123"
}
```

**响应**: SSE 流式（同 `/api/chat`）

---

### 每日首次问候

```http
POST /api/daily-greeting
```

**描述**: 每天首次打开页面时触发（75% 概率）

**请求体**:

```json
{
  "characterId": "abc123"
}
```

**响应示例**:

```json
{
  "ok": true,
  "triggered": true
}
```

或

```json
{
  "ok": true,
  "triggered": false,
  "reason": "already_greeted"
}
```

---

### 心情衰减

```http
POST /api/mood-decay
```

**描述**: 用户长时间不回复时心情衰减（每次 -5）

**请求体**:

```json
{
  "characterId": "abc123"
}
```

**响应示例**:

```json
{
  "ok": true,
  "mood": 55,
  "level": "还不错",
  "emoji": "😊"
}
```

---

## 心情管理

### 获取心情历史

```http
GET /api/mood-history
```

**描述**: 获取角色心情历史记录

**查询参数**:
- `characterId` (string, 必填): 角色 ID
- `days` (number, 可选): 天数，默认 7，范围 1-30

**请求示例**:

```
GET /api/mood-history?characterId=abc123&days=7
```

**响应示例**:

```json
{
  "ok": true,
  "history": [
    { "t": 1704067200000, "mood": 65 },
    { "t": 1704153600000, "mood": 70 }
  ],
  "days": 7
}
```

---

## 日记系统

### 获取日记列表

```http
GET /api/diary
```

**描述**: 获取角色的日记列表

**查询参数**:
- `characterId` (string, 必填): 角色 ID

**响应示例**:

```json
{
  "ok": true,
  "entries": [
    {
      "date": "2024-01-01",
      "content": "今天他来找我了，好开心...",
      "mood": 70,
      "createdAt": "2024-01-02T00:00:00.000Z"
    }
  ],
  "hasToday": false
}
```

---

### 生成日记

```http
POST /api/diary/generate
```

**描述**: AI 生成指定日期的日记（默认昨天）

**请求体**:

```json
{
  "characterId": "abc123",
  "date": "2024-01-01"
}
```

**参数说明**:
- `characterId` (string, 必填): 角色 ID
- `date` (string, 可选): 日期，格式 `YYYY-MM-DD`，默认昨天

**响应示例**:

```json
{
  "ok": true,
  "entry": {
    "date": "2024-01-01",
    "content": "今天...",
    "mood": 70
  },
  "alreadyExists": false
}
```

---

### 补生成日记

```http
POST /api/diary/backfill
```

**描述**: 补生成最近 N 天缺失的日记

**请求体**:

```json
{
  "characterId": "abc123",
  "days": 7
}
```

**响应示例**:

```json
{
  "ok": true,
  "generated": ["2024-01-01", "2024-01-02"],
  "checked": 7
}
```

---

## 表情包管理

### 获取表情包列表

```http
GET /api/stickers
```

**描述**: 获取表情包列表（支持分类过滤）

**查询参数**:
- `category` (string, 可选): 分类，默认 `all`

**响应示例**:

```json
{
  "ok": true,
  "stickers": [
    {
      "id": 1,
      "filename": "sticker-001.png",
      "category": "happy",
      "keywords": "[\"开心\", \"哈哈\"]",
      "emotionMatch": "开心",
      "usageCount": 5
    }
  ],
  "total": 10,
  "hasMore": false
}
```

---

### 获取最近使用的表情包

```http
GET /api/stickers/recent
```

**查询参数**:
- `limit` (number, 可选): 数量，默认 20，最大 30

**响应示例**:

```json
{
  "ok": true,
  "stickers": [...]
}
```

---

### 上传表情包

```http
POST /api/stickers/upload
```

**请求类型**: `multipart/form-data`

**表单字段**:
- `sticker` (file, 必填): 图片文件
- `category` (string, 可选): 分类，默认 `general`
- `keywords` (string, 可选): JSON 数组，如 `["开心", "哈哈"]`
- `emotionMatch` (string, 可选): 情绪标签

**响应示例**:

```json
{
  "ok": true,
  "id": 123,
  "filename": "sticker-001.png",
  "path": "/stickers/sticker-001.png"
}
```

---

### 扫描导入表情包

```http
POST /api/stickers/scan-import
```

**描述**: 扫描 `data/stickers/temp/` 目录，批量导入图片

**响应示例**:

```json
{
  "ok": true,
  "imported": 5,
  "skipped": 2,
  "total": 100
}
```

---

### 更新表情包标注

```http
PATCH /api/stickers/:id
```

**请求体**:

```json
{
  "category": "happy",
  "keywords": "[\"开心\"]",
  "emotionMatch": "开心"
}
```

---

### 删除表情包

```http
DELETE /api/stickers/:id
```

---

### 发送表情包（SSE 流式）

```http
POST /api/send-sticker
```

**描述**: 用户发送表情包，触发 AI 流式回复

**请求体**:

```json
{
  "characterId": "abc123",
  "stickerId": 1
}
```

**响应**: SSE 流式（同 `/api/chat`）

---

## 文件上传

### 获取上传的模型列表

```http
GET /api/models
```

**响应示例**:

```json
[
  {
    "id": "model-001",
    "name": "自定义角色",
    "modelUrl": "/api/models/model-001/Model.model3.json"
  }
]
```

---

### 获取预置模型列表

```http
GET /api/preset-models
```

**响应示例**:

```json
[
  {
    "id": "icegirl",
    "name": "IceGirl",
    "modelUrl": "/live2d/icegirl/IceGirl.model3.json",
    "format": "cubism4"
  }
]
```

---

### 上传 Live2D 模型

```http
POST /api/upload-model
```

**请求类型**: `multipart/form-data`

**表单字段**:
- `model` (file, 必填): 压缩文件（ZIP/RAR/7Z）
- `name` (string, 可选): 模型显示名称

**响应示例**:

```json
{
  "ok": true,
  "modelId": "model-001",
  "modelUrl": "/api/models/model-001/Model.model3.json",
  "name": "自定义角色",
  "format": "cubism4"
}
```

---

### 删除已上传的模型

```http
DELETE /api/models/:id
```

---

### 上传头像

```http
POST /api/upload-avatar
```

**请求类型**: `multipart/form-data`

**表单字段**:
- `avatar` (file, 必填): 图片文件（JPG/PNG/GIF/WEBP，最大 2MB）

**响应示例**:

```json
{
  "ok": true,
  "url": "/api/avatars/avatar-001.png"
}
```

---

## 桌宠系统

### 获取宠物状态

```http
GET /api/pet/state
```

**查询参数**:
- `characterId` (string, 必填): 角色 ID

**响应示例**:

```json
{
  "petState": {
    "coins": 100,
    "hunger": 80,
    "fatigue": 20,
    "intimacy": 50,
    "lastSignDate": "2024-01-01",
    "chatCount": 5,
    "lastActiveTime": "2024-01-01T00:00:00.000Z",
    "totalChats": 100,
    "totalSignIns": 30,
    "unlockedAchievements": ["first_chat"]
  },
  "shopItems": [...],
  "dateActivities": [...]
}
```

---

### 每日签到

```http
POST /api/pet/sign
```

**请求体**:

```json
{
  "characterId": "abc123"
}
```

**响应示例**:

```json
{
  "ok": true,
  "message": "签到成功！获得 20 金币💰",
  "reward": 20,
  "petState": {...},
  "newAchievements": ["sign_in_7"]
}
```

---

### 购买商品

```http
POST /api/pet/buy
```

**请求体**:

```json
{
  "characterId": "abc123",
  "itemId": "gift-001"
}
```

**响应示例**:

```json
{
  "ok": true,
  "message": "送出了🎁礼物，她好开心！",
  "petState": {...},
  "moodChange": 10,
  "aiContext": "用户刚送你了一份礼物..."
}
```

---

### 约会活动

```http
POST /api/pet/date
```

**请求体**:

```json
{
  "characterId": "abc123",
  "activityId": "movie"
}
```

---

### 猜拳游戏

```http
POST /api/pet/game
```

**请求体**:

```json
{
  "characterId": "abc123",
  "choice": "rock"
}
```

**参数说明**:
- `choice`: `rock` | `scissors` | `paper`

**响应示例**:

```json
{
  "ok": true,
  "result": "win",
  "aiChoice": "scissors",
  "reward": 10,
  "message": "你赢了！✊ vs ✌️ 获得 10 金币💰",
  "petState": {...}
}
```

---

### 猜数字游戏 - 开始

```http
POST /api/pet/game/guess/start
```

**请求体**:

```json
{
  "characterId": "abc123",
  "range": 30
}
```

**参数说明**:
- `range`: 数字范围，可选 `30` | `50` | `100`，默认 `30`

**响应示例**:

```json
{
  "ok": true,
  "range": 30,
  "attemptsLeft": 5,
  "maxAttempts": 5,
  "petState": {...}
}
```

---

### 猜数字游戏 - 猜数

```http
POST /api/pet/game/guess
```

**请求体**:

```json
{
  "characterId": "abc123",
  "number": 15
}
```

**响应示例**:

```json
{
  "ok": true,
  "hint": "big",
  "attemptsLeft": 4,
  "finished": false,
  "message": "猜大了！还剩 4 次机会",
  "petState": {...}
}
```

---

### 幸运转盘

```http
POST /api/pet/game/wheel
```

**请求体**:

```json
{
  "characterId": "abc123",
  "bet": 10
}
```

**响应示例**:

```json
{
  "ok": true,
  "bet": 10,
  "multiplier": 2,
  "returnAmount": 20,
  "netChange": 10,
  "won": true,
  "message": "🥈 中了 ×2！获得 20 金币（净赚 10）",
  "petState": {...}
}
```

---

### 桌宠状态衰减

```http
POST /api/pet/decay
```

**描述**: 长时间不互动时状态衰减（饱腹感下降、疲劳度恢复）

---

### 桌宠操作触发 AI 回复

```http
POST /api/pet/ai-reply
```

**描述**: 送礼物、约会等操作后触发 AI 回复（SSE 流式）

---

## 消息管理

### 消息分页查询

```http
GET /api/messages
```

**查询参数**:
- `characterId` (string, 必填): 角色 ID
- `beforeId` (number, 可选): 分页游标
- `limit` (number, 可选): 数量，默认 50，最大 100

**响应示例**:

```json
{
  "ok": true,
  "messages": [
    { "id": 1, "role": "user", "content": "你好", "createdAt": "..." },
    { "id": 2, "role": "assistant", "content": "你好呀~", "createdAt": "..." }
  ],
  "total": 100,
  "hasMore": true
}
```

---

### 消息全文搜索

```http
GET /api/messages/search
```

**查询参数**:
- `characterId` (string, 必填): 角色 ID
- `q` (string, 必填): 搜索关键词

**响应示例**:

```json
{
  "ok": true,
  "results": [
    { "id": 1, "role": "user", "content": "你好", "createdAt": "..." }
  ],
  "query": "你好"
}
```

---

## 事实记忆

### 获取事实列表

```http
GET /api/facts
```

**查询参数**:
- `characterId` (string, 必填): 角色 ID

**响应示例**:

```json
{
  "ok": true,
  "facts": [
    { "id": 1, "fact": "用户喜欢猫", "type": "like", "createdAt": "..." }
  ],
  "count": 5
}
```

---

### AI 提取事实

```http
POST /api/facts/extract
```

**描述**: AI 自动从最近对话中提取关键事实

**请求体**:

```json
{
  "characterId": "abc123"
}
```

**响应示例**:

```json
{
  "ok": true,
  "extracted": 3
}
```

---

## 统计接口

### 全局统计

```http
GET /api/stats
```

**响应示例**:

```json
{
  "ok": true,
  "stats": [
    {
      "id": "abc123",
      "name": "玉子",
      "mood": 65,
      "msgCount": 500,
      "daysAgo": 30,
      "lastActiveTime": "2024-01-01T00:00:00.000Z"
    }
  ],
  "totalMessages": 1500,
  "totalCharacters": 3,
  "totalDays": 90
}
```

---

### 获取成就列表

```http
GET /api/achievements
```

**查询参数**:
- `characterId` (string, 必填): 角色 ID

**响应示例**:

```json
{
  "ok": true,
  "achievements": [
    {
      "baseId": "first_chat",
      "name": "初次相遇",
      "desc": "第一次聊天",
      "emoji": "💬",
      "category": "social",
      "currentValue": 1,
      "tiers": [
        { "threshold": 1, "title": "初次相遇", "unlocked": true }
      ]
    }
  ],
  "unlockedCount": 5,
  "totalTiers": 20
}
```

---

### 获取性格模板

```http
GET /api/personality-templates
```

**响应示例**:

```json
{
  "yuko": {
    "name": "玉子",
    "description": "温柔体贴的性格",
    "traits": ["温柔", "体贴", "善解人意"]
  }
}
```

---

## 错误响应

所有 API 在出错时返回统一格式：

```json
{
  "error": "错误描述"
}
```

常见 HTTP 状态码：
- `400`: 参数错误
- `404`: 资源不存在
- `500`: 服务器内部错误

---

## 注意事项

1. **SSE 连接**: `/api/chat`、`/api/send-sticker` 等端点使用 Server-Sent Events，前端需使用 `EventSource` 接收
2. **文件上传**: 上传接口使用 `multipart/form-data`，注意文件大小限制
3. **心情范围**: 心情值范围 `0-100`，所有操作会自动 clamp 到此范围
4. **并发限制**: 建议避免同时发送多个聊天请求，可能导致上下文错乱

---

**最后更新**: 2026-07-24