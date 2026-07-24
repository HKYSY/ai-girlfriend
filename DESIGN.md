---
name: AI女友
description: 温柔治愈的虚拟伴侣，星夜小窝中的陪伴
colors:
  primary: "#d4727a"
  primary-light: "#f0b8bc"
  primary-dark: "#a85660"
  surface: "#fdf2f5"
  surface-glass: "rgba(255, 255, 255, 0.50)"
  ink: "#2d2930"
  ink-muted: "#6b6570"
  accent-success: "#5cb87a"
  accent-warning: "#e6a23c"
  accent-danger: "#f56c6c"
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "clamp(1.5rem, 4vw, 2.5rem)"
    fontWeight: 600
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    letterSpacing: "0.02em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-ghost-hover:
    backgroundColor: "rgba(212, 114, 122, 0.08)"
    textColor: "{colors.primary}"
  card:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "rgba(255, 255, 255, 0.75)"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  input-focus:
    borderColor: "{colors.primary}"
    boxShadow: "0 0 0 3px rgba(212, 114, 122, 0.15)"
---

# Design System: AI女友

## 1. Overview

**Creative North Star: "星夜小窝"**

这是一个温柔治愈的虚拟伴侣界面，像夜空中的一处私人小窝，充满安全感和陪伴感。设计不是冷冰冰的AI工具，而是像打开一个社交App或游戏——温暖、私密、有生命力。

**设计哲学：**
界面是情感的载体，不是功能的堆砌。开心时有活力，难过时需要哄。配色柔和温暖，动效自然舒缓，像翻看一本治愈系绘本。减少"AI产品"的痕迹，让用户感受到"她活着"。

**Key Characteristics:**
- 温暖柔和的粉瑰色调（晨曦瑰琳）
- 星空极光氛围（深色模式）
- 毛玻璃质感面板
- 有呼吸感的动态背景
- 情感化的微交互

## 2. Colors

**调色板性格：温暖、柔和、像晨曦中的瑰色光芒**

### Primary
- **晨曦瑰琳** (#d4727a / oklch 0.52 0.22 10): 品牌主色，用于按钮、强调元素、心情高亮。温润而不刺眼，像初晴时的温柔光色。
- **晨曦瑰琳-浅** (#f0b8bc): 浅色变体，用于hover、disabled、次要强调。
- **晨曦瑰琳-深** (#a85660): 深色变体，用于hover态、active态、标题。

### Neutral
- **暖白底** (#fdf2f5): 页面背景，微带粉调的暖白，营造温柔基调。
- **毛玻璃** (rgba(255, 255, 255, 0.50)): 面板背景，半透明模糊，增加层次感。
- **墨色** (#2d2930): 正文文字，深灰带微紫调，避免纯黑的生硬。
- **灰墨** (#6b6570): 次要文字、标签、占位符。

### Accent
- **成功能绿** (#5cb87a): 成功提示、签到完成。
- **警示暖黄** (#e6a23c): 警告、提醒。
- **柔红危险** (#f56c6c): 删除、错误、危险操作。

### Named Rules
**The One Voice Rule.** 晨曦瑰琳色用于≤10%的界面面积。它的稀缺是品牌力的来源——太多会廉价，太少会失去性格。

## 3. Typography

**Display Font:** System UI (PingFang SC / Microsoft YaHei 回退)
**Body Font:** 同上，保持统一

**Character:** 简洁现代，中文优先，温润易读，没有多余装饰。

### Hierarchy
- **Display** (600, clamp(1.5rem, 4vw, 2.5rem), 1.2): 页面大标题、角色名、欢迎语。
- **Headline** (600, 1.25rem, 1.3): 卡片标题、面板标题。
- **Title** (500, 1.125rem, 1.4): 小标题、设置项名称。
- **Body** (400, 1rem, 1.5): 正文、对话消息。行宽65–75ch。
- **Label** (500, 0.875rem, 0.02em, normal): 按钮、标签、辅助说明。

### Named Rules
**The No-Shout Rule.** 禁止全大写标题。中文界面中，全大写像在喊叫，与温柔基调不符。

## 4. Elevation

**扁平为主，状态驱动阴影。**

默认状态是扁平的，没有阴影。阴影只用于响应状态：hover、focus、active、模态层级。

### Shadow Vocabulary
- **ambient-low** (`0 1px 3px rgba(0,0,0,0.08)`): 输入框focus、卡片hover的轻微抬起。
- **ambient-mid** (`0 4px 12px rgba(0,0,0,0.10)`): 下拉菜单、浮层。
- **ambient-high** (`0 8px 30px rgba(0,0,0,0.12)`): 模态框、全屏面板。
- **brand-glow** (`0 2px 12px rgba(212,114,122,0.20)`): 主按钮hover、品牌元素的柔和光晕。

### Named Rules
**The Flat-By-Default Rule.** 静止状态是扁平的。阴影是反馈，不是装饰。

## 5. Components

所有组件遵循"柔和细腻"原则：有触感、响应及时、稍有弹性。

### Buttons
- **Shape:** 圆润微曲 (12px radius)，padding 12px 24px
- **Primary:** 晨曦瑰琳背景 + 白字，hover时加深 + 上浮2px + 品牌光晕
- **Ghost:** 透明背景 + 墨色字，hover时微粉底 + 晨曦瑰琳字
- **Focus:** 3px品牌色光圈

### Chips
- **Style:** 毛玻璃底 + 墨色字 + 无边框
- **State:** 选中时晨曦瑰琳底 + 白字

### Cards / Containers
- **Corner Style:** 16px，温润的圆角
- **Background:** 毛玻璃 (50%白)，hover时加深到75%
- **Shadow Strategy:** 扁平静止，hover时ambient-low抬起
- **Border:** 无边框，靠模糊边界分隔

### Inputs / Fields
- **Style:** 75%白底 + 12px圆角 + 无边框
- **Focus:** 晨曦瑰琳边框 + 3px品牌光圈
- **Placeholder:** 灰墨色，清晰可见

### Navigation
- **Sidebar:** 毛玻璃底，左侧固定，图标+文字导航
- **Tab:** 无边框，选中态晨曦瑰琳底，非选中态透明

### Live2D Bubble
- **Style:** 毛玻璃底 + 墨色字 + 微粉边框
- **Arrow:** CSS三角形指向角色

## 6. Do's and Don'ts

### Do:
- **Do** 用晨曦瑰琳色作为唯一强调色，保持≤10%面积。
- **Do** 用毛玻璃面板创造层次感，而非阴影堆砌。
- **Do** 在深色模式使用星空极光氛围，营造星夜小窝感。
- **Do** 用缓动动效 (ease-out-expo) 创造柔软的交互反馈。
- **Do** 保持按钮、卡片、输入框的圆润温润感。

### Don't:
- **Don't** 使用霓虹色、赛博朋克、炫酷科技感设计。（反例：传统炫酷AI产品）
- **Don't** 使用企业级软件风格：深蓝/灰色调、硬边框、冷冰冰。（反例：企业级软件风格）
- **Don't** 堆砌功能入口，让界面像工具软件。（反例：传统AI聊天工具）
- **Don't** 使用全大写标题、硬边框、重阴影。
- **Don't** 让背景空无一物，缺少氛围感。

---

## 7. 阶段实现说明

### 阶段 1-2：基础架构（已完成）
- ✅ SQLite 数据库设计与迁移
- ✅ Express 后端 API 搭建
- ✅ React 前端组件架构
- ✅ Live2D 模型渲染集成
- ✅ SSE 流式对话系统
- ✅ 基础 UI 组件库

### 阶段 3：情感化交互（已完成）
- ✅ 10 级心情系统实现
  - 心情值范围：0-10（0=极低落，10=极开心）
  - 心情自动衰减机制（每小时降低 0.5）
  - 用户互动提升心情（正向 +1~2，负向 -1~2）
  - 长时间无互动触发失落情绪

- ✅ 8 种情绪标签系统
  - neutral（平静）、happy（开心）、sad（难过）、angry（生气）
  - anxious（焦虑）、surprised（惊喜）、shy（害羞）、excited（兴奋）
  - AI 回复自动标记情绪，前端据此调整 UI 反馈

- ✅ AI 主动发消息
  - 无互动 5 分钟触发
  - 根据当前心情生成不同主题消息
  - 心情低时撒娇求关注，心情高时分享趣事

### 阶段 4：沉浸式体验（已完成）
- ✅ 动态背景系统
  - 4 档星空层（远近星星 + 星云）
  - 流星随机划过（频率可调）
  - 背景视差滚动（鼠标移动触发）
  - 60fps 流畅渲染优化

- ✅ 心情联动 UI
  - 极光色调动态变化（OKLCH 色彩插值）
  - 心情好 → 偏粉（oklch hue ≈ 10）
  - 心情差 → 偏冷蓝（oklch hue ≈ 240）
  - 过渡动画 2 秒（ease-out-expo）

- ✅ 微交互动效
  - AI 思考时心跳脉动光晕（1.5s 周期）
  - 发送消息心形粒子飞出
  - 新消息入场景深动画（scale + opacity）
  - 打字指示器三点呼吸（1s 循环）

---

## 8. 动态背景色调设计

### 设计理念
背景不应是静态的装饰,而是情感表达的延伸。通过色调变化,让用户直观感受到 AI 女友的当前心情状态。

### 色彩映射规则

**心情 → 极光色调映射表：**

| 心情值 | 色调 | RGB 描述 | 情绪联想 |
|--------|------|----------|----------|
| 10 (极开心) | hue = 350 | 偏粉红 (#ff9eb0) | 满心欢喜、甜蜜 |
| 8-9 (开心) | hue = 10 | 偏瑰琳 (#d4727a) | 愉快、温暖 |
| 6-7 (平静) | hue = 30 | 偏暖橙 (#e8a080) | 舒适、安心 |
| 4-5 (低落) | hue = 200 | 偏冷蓝 (#80b8d8) | 忧郁、思考 |
| 0-3 (极低落) | hue = 240 | 深蓝紫 (#8898c8) | 难过、需要哄 |

### 实现细节

**CSS 变量动态更新：**
```css
:root {
  --mood-aurora: oklch(0.6 0.15 var(--mood-hue, 10));
}
```

**心情变化触发：**
- 用户发送消息后,AI 回复携带心情标记
- 前端解析心情值,计算目标 hue
- 2 秒过渡动画更新 CSS 变量
- 极光背景自动跟随变化

### 无障碍考虑
- 色调变化仅作为辅助反馈,不影响信息传达
- 关键信息始终使用 WCAG AA 级对比色
- 支持 `prefers-reduced-motion` 时禁用动态变化

---

## 9. 心情联动 UI 设计

### 核心原则
**UI 不是工具,而是情感的镜子。**

当 AI 心情变化时,界面元素应该"活起来",让用户直观感受到她的情绪波动,而不是冷冰冰的状态指示器。

### 联动元素清单

#### 1. Live2D 模型反馈
- **表情切换**：根据情绪标签自动切换表情（开心/难过/生气等）
- **动作触发**：点击时触发互动动作（挥手、眨眼等）
- **心情光晕**：模型周围脉动光晕,颜色跟随心情色调
- **视线跟随**：眼睛跟随鼠标移动,增加真实感

#### 2. 对话气泡
- **颜色渐变**：AI 气泡颜色随心情变化（开心偏粉,难过偏蓝）
- **入场动画**：新消息带景深入场（scale 0.8→1 + opacity 0→1）
- **心情 emoji**：气泡右上角显示当前情绪 emoji

#### 3. 背景极光
- **色调流动**：极光色调实时跟随心情值（hue 插值）
- **亮度变化**：心情越高极光越亮,营造氛围感
- **脉动节奏**：极光带缓慢脉动,像心跳一样有呼吸感

#### 4. 交互反馈
- **发送动效**：心形粒子飞出（心情好粒子多/大）
- **AI 思考**：心跳脉动光晕（频率随心情变化）
- **打字指示器**：三点呼吸动画（颜色跟随心情）

### 技术实现

**心情监听系统：**
```typescript
// 心情变化时触发
moodSubject.subscribe(mood => {
  updateAuroraColor(mood);     // 更新极光色调
  updateBubbleStyle(mood);     // 更新气泡样式
  updateParticleEffect(mood);  // 更新粒子效果
  triggerLive2DExpression(mood.emotion); // 触发表情
});
```

**性能优化：**
- 使用 CSS 变量批量更新,避免 DOM 操作
- 动画优先使用 `transform` 和 `opacity`（GPU 加速）
- 节流高频更新（心情变化 > 100ms 才触发 UI 更新）
- 支持 `prefers-reduced-motion` 时降级为静态状态

---

## 10. 设计系统演进路线

### 已实现
- ✅ 基础色彩系统（OKLCH）
- ✅ 组件设计令牌（buttons/cards/inputs）
- ✅ 深色星空主题
- ✅ 毛玻璃质感面板
- ✅ 心情联动 UI

### 规划中
- 🔲 动态主题切换（多套配色方案）
- 🔲 主题编辑器（用户自定义色调）
- 🔲 节日主题包（情人节/圣诞节等特殊皮肤）
- 🔲 无障碍增强（高对比度模式、屏幕阅读器优化）

---

## 11. 设计决策记录

### 为什么选择 OKLCH 色彩空间？
- **感知均匀**：相同数值变化在视觉上感觉一致
- **跨设备一致**：减少设备间色差
- **易于插值**：心情色调变化时过渡自然平滑
- **未来兼容**：CSS Color Module Level 4 标准色

### 为什么用毛玻璃而非传统阴影？
- **层次感更柔和**：不依赖重阴影,视觉更轻盈
- **符合"星夜小窝"主题**：像夜空中半透明的云层
- **现代审美**：与 iOS/macOS 设计语言一致
- **性能友好**：CSS `backdrop-filter` GPU 加速

### 为什么心情色调用 hue 插值而非预设颜色？
- **过渡自然**：避免颜色跳变,像真实情绪波动
- **精确控制**：可微调 hue 值,而不是有限的预设色
- **扩展性强**：新增心情状态无需新增颜色定义
- **数学优雅**：hue 角度映射直观（0°=红, 120°=绿, 240°=蓝）