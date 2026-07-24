# 贡献指南

感谢你对虚拟伴侣项目的关注！本文档将帮助你了解如何为项目做出贡献。

---

## 📖 项目介绍

**虚拟伴侣** 是一个基于 Live2D 虚拟形象和大语言模型的桌面端 Web 应用。她具有以下特性：

- **情感化对话**：10 级心情系统、8 种情绪标签、SSE 流式输出
- **长期记忆**：对话永久保留、事实记忆、智能摘要
- **桌宠养成**：金币/饱腹感/疲劳度/亲密度状态系统
- **Live2D 交互**：Cubism 4 模型渲染、拖拽/缩放/表情/动作
- **日记系统**：AI 自动生成第一人称日记
- **表情包系统**：用户上传、AI 自动匹配

技术栈：**React + TypeScript + Vite + PixiJS + Express + SQLite + Electron**

---

## 🛠 开发环境搭建

### 前置条件

- **Node.js** ≥ 18（推荐 20 LTS）
- **npm** ≥ 9 或 **pnpm** ≥ 8
- **Git** ≥ 2.30
- **DeepSeek API Key**（从 [platform.deepseek.com](https://platform.deepseek.com) 获取）

### 克隆项目

```bash
git clone https://github.com/your-username/virtual-companion.git
cd virtual-companion
```

### 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖（新开终端）
cd ../frontend
npm install

# 安装根目录依赖（用于 Electron 打包）
cd ..
npm install
```

### 环境配置

```bash
# 后端环境变量
cd backend
cp .env.example .env
```

编辑 `backend/.env`：

```env
# DeepSeek API 配置（必填）
DEEPSEEK_API_KEY=your_api_key_here

# 模型选择（可选，默认 deepseek-v4-flash）
DEEPSEEK_MODEL=deepseek-v4-flash

# 后端端口（可选，默认 3001）
PORT=3001
```

### 启动开发服务器

```bash
# 终端 1：启动后端（端口 3001，热重载）
cd backend
npm run dev

# 终端 2：启动前端（端口 5173）
cd frontend
npm run dev
```

浏览器打开 `http://localhost:5173` 即可看到应用。

---

## 📝 代码规范

### TypeScript

- 所有新代码必须使用 **TypeScript** 编写
- 避免使用 `any` 类型，优先定义接口或类型别名
- 函数必须明确返回类型
- 公共 API 必须有 JSDoc 注释

```typescript
// ✅ 推荐
interface Character {
  id: string;
  name: string;
  mood: number;
}

function getCharacter(id: string): Character | null {
  // ...
}

// ❌ 避免
function getCharacter(id: any): any {
  // ...
}
```

### ESLint

项目使用 TypeScript 内置检查，暂未配置 ESLint。推荐遵循以下规则：

- 使用 `const` 优先，避免 `var`
- 函数参数不超过 4 个，超过时使用对象解构
- 避免嵌套三元表达式
- 使用可选链 `?.` 和空值合并 `??`

### 文件命名

- **组件**：`PascalCase.tsx`（如 `ChatWindow.tsx`）
- **工具函数**：`camelCase.ts`（如 `utils.ts`）
- **类型定义**：`index.ts` 或 `types.ts`
- **样式文件**：与组件同名，如 `App.css`

---

## 🔀 Git 提交规范

本项目采用 **Conventional Commits** 规范。

### 提交格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(chat): 添加语音消息支持` |
| `fix` | Bug 修复 | `fix(mood): 修复心情值未正确保存的问题` |
| `docs` | 文档更新 | `docs(readme): 更新安装说明` |
| `style` | 代码格式（不影响功能） | `style: 统一缩进为 2 空格` |
| `refactor` | 重构（不是新功能也不是修复） | `refactor(database): 优化查询性能` |
| `perf` | 性能优化 | `perf(messages): 减少内存占用` |
| `test` | 测试相关 | `test(chat): 添加聊天 API 单元测试` |
| `chore` | 构建/工具相关 | `chore: 升级依赖版本` |

### Scope 范围

- `chat`：聊天功能
- `mood`：心情系统
- `diary`：日记系统
- `sticker`：表情包功能
- `live2d`：Live2D 模型相关
- `pet`：桌宠系统
- `database`：数据库层
- `api`：后端 API
- `frontend`：前端组件

### 示例

```bash
# 新功能
git commit -m "feat(sticker): 添加表情包搜索功能"

# Bug 修复
git commit -m "fix(mood): 修复心情值超过 100 的边界问题"

# 文档更新
git commit -m "docs(api): 补充表情包接口文档"

# 重构
git commit -m "refactor(database): 将消息查询改为分页模式"
```

---

## 🔀 提交 PR 流程

### 1. Fork 并创建分支

```bash
# Fork 后克隆你的仓库
git clone https://github.com/YOUR-USERNAME/virtual-companion.git
cd virtual-companion

# 创建功能分支
git checkout -b feat/your-feature-name
```

### 2. 编写代码

- 确保代码符合 TypeScript 规范
- 添加必要的单元测试（如有）
- 更新相关文档

### 3. 运行测试

```bash
# 后端测试
cd backend
npm test

# 前端测试
cd ../frontend
npm test
```

### 4. 提交代码

```bash
git add .
git commit -m "feat(scope): 你的功能描述"
git push origin feat/your-feature-name
```

### 5. 创建 Pull Request

1. 访问你的 Fork 仓库页面
2. 点击 "New Pull Request"
3. 填写 PR 标题和描述：
   - 标题：遵循 Conventional Commits 格式
   - 描述：说明改动内容、测试方法、相关 Issue

### 6. 代码审查

- 等待维护者审查代码
- 根据反馈修改代码（追加提交即可）
- 确保所有检查通过

### PR 模板

```markdown
## 📝 改动描述

<!-- 简要描述本次 PR 的目的 -->

## 🔧 改动类型

- [ ] 🐛 Bug 修复
- [ ] ✨ 新功能
- [ ] 📝 文档更新
- [ ] 🔨 重构
- [ ] 🎨 样式调整

## ✅ 测试清单

- [ ] 本地测试通过
- [ ] 不影响现有功能
- [ ] 代码符合规范

## 📸 截图（如有）

<!-- 如果是 UI 改动，请附上截图 -->

## 🔗 相关 Issue

<!-- 关联的 Issue 编号 -->
```

---

## 🧪 测试运行方法

### 后端测试

```bash
cd backend

# 运行所有测试
npm test

# 监听模式（开发时使用）
npm test -- --watch

# 生成覆盖率报告
npm test -- --coverage
```

测试框架：**Vitest**

### 前端测试

```bash
cd frontend

# 运行所有测试
npm test

# 监听模式
npm test -- --watch
```

### 测试文件命名

- 后端：`__tests__/*.test.ts`（如 `persona.test.ts`）
- 前端：`__tests__/*.test.ts`（如 `App.test.ts`）

---

## 🎨 开发技巧

### 后端开发

- 使用 `tsx watch src/index.ts` 启动热重载
- API 路由按模块拆分到 `routes/` 目录
- 数据库操作集中在 `database.ts`
- 复杂 AI 逻辑保留在 `index.ts`（如摘要生成、情感分析）

### 前端开发

- 组件放在 `src/components/`
- 自定义 Hook 放在 `src/hooks/`
- API 调用集中在 `src/api.ts`
- 样式使用 CSS 文件或内联样式

### 调试技巧

- 后端日志：控制台输出（`console.log`）
- 前端调试：浏览器 DevTools + React DevTools
- 数据库调试：使用 [DB Browser for SQLite](https://sqlitebrowser.org/) 查看 `data/app.db`

---

## 📚 相关文档

- [API 接口文档](docs/API.md)
- [架构设计文档](docs/ARCHITECTURE.md)
- [更新日志](docs/CHANGELOG.md)

---

## 🤝 行为准则

- 尊重所有贡献者
- 接受建设性批评
- 关注对项目最有利的事情
- 保持友好、包容的交流氛围

---

## 📧 联系方式

如有问题，请通过 GitHub Issues 提交。

感谢你的贡献！ 🎉