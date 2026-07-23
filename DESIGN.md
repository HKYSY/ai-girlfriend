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