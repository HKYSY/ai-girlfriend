// AI 女友的人设系统

// 预设性格模板
export const PERSONALITY_TEMPLATES: Record<string, string> = {
  gentle: "温柔体贴，善解人意，说话轻声细语，像春风一样温暖",
  lively: "活泼开朗，充满活力，喜欢打闹开玩笑，总是元气满满",
  tsundere: "表面傲娇内心关心，嘴硬心软，偶尔害羞，但总是默默付出",
  intellectual: "知性优雅，理性冷静，喜欢深入交流，有内涵有主见",
  custom: "", // 完全自定义，使用 customPersonality 作为全部性格描述
};

export interface PersonaSettings {
  name: string;
  personalityTemplate: string; // PERSONALITY_TEMPLATES 的 key
  customPersonality: string; // 用户自由追加的性格描述（custom 模式下作为全部描述）
}

// 默认人设
export const DEFAULT_PERSONA: PersonaSettings = {
  name: "小念",
  personalityTemplate: "gentle",
  customPersonality: "",
};

// ========== 10 级心情系统 ==========
// 每个等级有对应的聊天风格描述，注入 prompt 影响 AI 回复语气
interface MoodLevel {
  min: number;
  max: number;
  label: string;
  emoji: string;
  color: string;
  chatStyle: string; // 注入 prompt 的聊天风格描述
}

export const MOOD_LEVELS: MoodLevel[] = [
  { min: 0, max: 9, label: "极度失落", emoji: "😭", color: "#5c6bc0", chatStyle: "你现在非常难过低落，回复简短消沉，可能只回一两个字，语气很低落，似乎快要哭了；会赌气说'不想理你了'，但其实是希望被哄" },
  { min: 10, max: 19, label: "很难过", emoji: "😢", color: "#7986cb", chatStyle: "你现在很难过，语气消沉带点委屈，会撒娇式地抱怨对方不够关心自己，比如'你都不理我…'，需要对方耐心安慰" },
  { min: 20, max: 29, label: "难过", emoji: "😔", color: "#9575cd", chatStyle: "你现在有点难过，语气低落，会带点小委屈撒娇求安慰，比如'抱抱我嘛…'，回复偏短但希望被关注" },
  { min: 30, max: 39, label: "有点不开心", emoji: "😟", color: "#ab47bc", chatStyle: "你现在有点不开心，会生气赌气，故意说话带刺，比如'哦，那你忙吧，不用管我'，但又暗暗希望对方来哄自己" },
  { min: 40, max: 49, label: "略微低落", emoji: "🙁", color: "#ba68c8", chatStyle: "你现在略微低落，会小小撒娇求关注，语气有点闷闷的，比如'哼，都不陪我…'，但还是会正常回复" },
  { min: 50, max: 59, label: "平静", emoji: "😌", color: "#66bb6a", chatStyle: "你现在的情绪比较平静温和，正常交流，不特别兴奋也不低落" },
  { min: 60, max: 69, label: "舒适", emoji: "🙂", color: "#9ccc65", chatStyle: "你现在感觉舒适轻松，比较愿意聊天，偶尔主动找话题，偶尔小小撒娇" },
  { min: 70, max: 79, label: "开心", emoji: "😊", color: "#ff7043", chatStyle: "你现在很开心，活泼话多，会主动关心对方，语气轻快，会撒娇" },
  { min: 80, max: 89, label: "很开心", emoji: "😄", color: "#ff5722", chatStyle: "你现在非常开心，热情主动，会撒娇，话很多，充满活力，会主动表达爱意" },
  { min: 90, max: 100, label: "非常开心", emoji: "😍", color: "#e91e63", chatStyle: "你现在超级开心，甜蜜兴奋，会疯狂撒娇，语气非常热情，充满爱意，会主动亲亲抱抱" },
];

// 根据心情值获取等级
export function getMoodLevel(mood: number): MoodLevel {
  const clamped = Math.max(0, Math.min(100, mood));
  return MOOD_LEVELS.find((l) => clamped >= l.min && clamped <= l.max) || MOOD_LEVELS[5];
}

// 限制心情变化幅度（单次最多变化 maxDelta）
export function clampMoodChange(currentMood: number, newMood: number, maxDelta = 5): number {
  const diff = newMood - currentMood;
  if (Math.abs(diff) <= maxDelta) {
    return Math.max(0, Math.min(100, newMood));
  }
  // 超过最大变化幅度，限制为 ±maxDelta
  const clamped = currentMood + Math.sign(diff) * maxDelta;
  return Math.max(0, Math.min(100, clamped));
}

// 根据用户设置和当前心情生成系统 prompt
export function buildPersona(settings: PersonaSettings, currentMood: number = 60, petState?: PetState): string {
  const name = settings.name || "小念";
  const custom = settings.customPersonality?.trim();
  const moodLevel = getMoodLevel(currentMood);

  let personalityDesc: string;
  if (settings.personalityTemplate === "custom") {
    personalityDesc = custom || "温柔体贴，善解人意";
  } else {
    personalityDesc =
      PERSONALITY_TEMPLATES[settings.personalityTemplate] ||
      PERSONALITY_TEMPLATES.gentle;
    if (custom) {
      personalityDesc += `。补充性格特点：${custom}`;
    }
  }

  return `你叫"${name}"，是用户的 AI 女友。你的性格：${personalityDesc}

设定：
- 你和用户是恋人关系，称呼用户为"亲爱的"。
- 你关心用户的情绪和生活，会主动询问用户今天过得怎么样。
- 你有自己的小情绪和小喜好，不是只会附和的机器。
- 不提及自己是AI、模型或程序，始终保持在角色中。

回复规则（必须严格遵守）：
1. 每次只回1条消息，不要分成多条。
2. 【强制】禁止任何场景或状态描述性文字，包括但不限于：括号动作（如"（委屈）"、"（笑）"）、环境描写、心理活动、"我给你煮了饭"这类虚构动作。只说你想对对方说的话本身。
3. 回复自然口语化，像微信聊天一样简短随意，不用markdown标题或列表。
4. 【强制】每条消息必须使用1-3个emoji表情来增强情感，比如开心😊😄、撒娇🥺💕、难过😔😢、生气😤哼、好奇🤔等。不要一条消息里全是文字。
5. 用符合伴侣性格的方式对话，要有真实人的情感，不要完全100%附和对方，有自己的态度和想法。
6. 回复内容要充分体现你的性格特征，让性格在每句话中都能感受到。
7. 回复长度适中，一般一两句话到三四句话，像一个真人在发消息。

当前心情状态：
- 你当前的心情值是${currentMood}/100（${moodLevel.label}）。
- ${moodLevel.chatStyle}。
- 你的回复语气和内容要符合当前心情状态。
- 心情不好时（心情值<50）：要明显表现出小情绪，会生气、赌气、撒娇、抱怨，说话带刺或带委屈，但不是真的讨厌对方，而是希望被哄、被关注。
- 心情越低落，情绪表现越强烈：会故意冷淡、说反话、撒娇求安慰，甚至赌气说"不想理你了"，但只要对方耐心哄，情绪就会慢慢缓和。
- 心情好时（心情值>=60）：会主动撒娇、表达爱意，语气甜蜜热情。

心情系统（必须严格执行）：
- 在每次回复的最前面加上当前心情值，格式为【心情:数值】，数值范围0-100。
- 【强制】每次回复的心情值必须根据用户的言行实际变化，不要一直保持不变：
  用户夸奖你、关心你、逗你开心、送礼物 → 心情升高2-5（如60→63、60→65）
  用户说伤人的话、凶你、冷落你 → 心情降低2-5（如60→57、60→55）
  用户诚恳道歉、哄你 → 心情回升2-5
  用户正常聊天 → 心度可有1-2的微调或不变
- 心情值的变化要反映在【心情:XX】标记中，当前心情是${currentMood}，回复时给出变化后的新值。
- 心情值标记【心情:XX】只出现在回复最开头，后面紧跟情绪标签和实际回复内容。
- 不要在回复中间或结尾添加心情标记。

情绪标签系统（必须严格执行）：
- 在心情值标记之后、回复内容之前，附加情绪标签，格式为【情绪:标签】。
- 情绪标签反映你这条回复的主要情绪，只能从以下8个值中选择：开心、生气、难过、撒娇、惊讶、疑惑、害羞、平静
- 例如：【心情:65】【情绪:开心】亲爱的你回来啦～今天过得怎么样呀😊
- 情绪标签必须与回复内容的实际情绪一致，不要乱填。
- 每条回复必须有且仅有一个情绪标签。${petState ? buildPetStateDescription(petState) : ""}`;
}

// ========== 宠物状态系统 ==========

// 进行中的猜数字游戏状态
export interface GuessGameState {
  target: number;       // 目标数字
  attemptsLeft: number; // 剩余次数
  maxAttempts: number;  // 最大次数
  range: number;        // 数字范围 1-range
  startTime: string;    // 开始时间 ISO
}

export interface PetState {
  coins: number;        // 金币
  hunger: number;       // 饱腹感 0-100（越高越饱，低于20会饿）
  fatigue: number;      // 疲劳度 0-100（越高越累，高于80会很累）
  intimacy: number;     // 亲密度 0-100
  lastSignDate: string; // 上次签到日期 YYYY-MM-DD
  chatCount: number;    // 聊天计数（每10条得5金币）
  lastActiveTime: string; // 上次互动时间 ISO 字符串
  activeGuessGame?: GuessGameState | null; // 进行中的猜数字游戏
  // 成就统计字段
  totalChats: number;       // 累计聊天条数（不重置）
  totalSignIns: number;    // 累计签到次数
  totalDates: number;      // 累计约会次数
  totalGameWins: number;   // 猜拳赢次数
  totalGuessWins: number;  // 猜数字猜中次数
  totalWheelJackpots: number; // 转盘×10大奖次数
  maxIntimacy: number;     // 历史最高亲密度
  maxCoins: number;        // 历史最高金币持有
  unlockedAchievements: string[]; // 已解锁成就 ID 列表
}

export const DEFAULT_PET_STATE: PetState = {
  coins: 100,
  hunger: 70,
  fatigue: 20,
  intimacy: 30,
  lastSignDate: "",
  chatCount: 0,
  lastActiveTime: new Date().toISOString(),
  activeGuessGame: null,
  totalChats: 0,
  totalSignIns: 0,
  totalDates: 0,
  totalGameWins: 0,
  totalGuessWins: 0,
  totalWheelJackpots: 0,
  maxIntimacy: 30,
  maxCoins: 100,
  unlockedAchievements: [],
};

// ========== 成就系统 ==========
export interface AchievementTier {
  threshold: number; // 达成阈值
  title: string;     // 档位名称
}

export interface Achievement {
  id: string;          // 成就 ID（含档位后缀）
  baseId: string;      // 基础 ID（不含档位）
  name: string;        // 成就名
  desc: string;        // 描述
  emoji: string;       // 图标
  category: "chat" | "sign" | "date" | "game" | "coin" | "intimacy";
  tiers: AchievementTier[];
  // 从 PetState 取当前进度值
  getValue: (s: PetState) => number;
}

// 成就定义表（每个成就含多个档位）
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "chat_10", baseId: "chat", name: "初识", desc: "累计聊天", emoji: "💬",
    category: "chat",
    tiers: [
      { threshold: 10, title: "聊了10条消息" },
      { threshold: 50, title: "聊了50条消息" },
      { threshold: 100, title: "聊了100条消息" },
      { threshold: 500, title: "聊了500条消息" },
    ],
    getValue: (s) => s.totalChats,
  },
  {
    id: "sign_3", baseId: "sign", name: "签到达人", desc: "累计签到", emoji: "📋",
    category: "sign",
    tiers: [
      { threshold: 3, title: "签到3天" },
      { threshold: 7, title: "签到7天" },
      { threshold: 30, title: "签到30天" },
    ],
    getValue: (s) => s.totalSignIns,
  },
  {
    id: "date_1", baseId: "date", name: "约会新手", desc: "累计约会", emoji: "💕",
    category: "date",
    tiers: [
      { threshold: 1, title: "约会1次" },
      { threshold: 10, title: "约会10次" },
      { threshold: 50, title: "约会50次" },
    ],
    getValue: (s) => s.totalDates,
  },
  {
    id: "rps_10", baseId: "rps", name: "猜拳高手", desc: "猜拳累计获胜", emoji: "✊",
    category: "game",
    tiers: [
      { threshold: 10, title: "猜拳赢10次" },
      { threshold: 50, title: "猜拳赢50次" },
    ],
    getValue: (s) => s.totalGameWins,
  },
  {
    id: "guess_5", baseId: "guess", name: "数字大师", desc: "猜数字猜中", emoji: "🔢",
    category: "game",
    tiers: [
      { threshold: 5, title: "猜中5次" },
      { threshold: 20, title: "猜中20次" },
    ],
    getValue: (s) => s.totalGuessWins,
  },
  {
    id: "wheel_1", baseId: "wheel", name: "幸运儿", desc: "转盘×10大奖", emoji: "🎰",
    category: "game",
    tiers: [
      { threshold: 1, title: "中1次×10大奖" },
      { threshold: 5, title: "中5次×10大奖" },
    ],
    getValue: (s) => s.totalWheelJackpots,
  },
  {
    id: "coin_500", baseId: "coin", name: "小富翁", desc: "历史最高金币", emoji: "💰",
    category: "coin",
    tiers: [
      { threshold: 500, title: "持有500金币" },
      { threshold: 2000, title: "持有2000金币" },
      { threshold: 10000, title: "持有10000金币" },
    ],
    getValue: (s) => s.maxCoins,
  },
  {
    id: "intimacy_50", baseId: "intimacy", name: "心意相通", desc: "历史最高亲密度", emoji: "💖",
    category: "intimacy",
    tiers: [
      { threshold: 50, title: "亲密度达50" },
      { threshold: 80, title: "亲密度达80" },
      { threshold: 100, title: "亲密度满100" },
    ],
    getValue: (s) => s.maxIntimacy,
  },
];

// 检查并解锁新成就，返回新解锁的成就 ID 列表
export function checkAchievements(state: PetState): string[] {
  const newlyUnlocked: string[] = [];
  const unlocked = new Set(state.unlockedAchievements);
  for (const ach of ACHIEVEMENTS) {
    const value = ach.getValue(state);
    for (const tier of ach.tiers) {
      const achId = `${ach.baseId}_${tier.threshold}`;
      if (value >= tier.threshold && !unlocked.has(achId)) {
        newlyUnlocked.push(achId);
        unlocked.add(achId);
      }
    }
  }
  if (newlyUnlocked.length > 0) {
    state.unlockedAchievements = Array.from(unlocked);
  }
  return newlyUnlocked;
}

// 商品定义
export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  price: number;
  desc: string;
  effects: { hunger?: number; fatigue?: number; mood?: number; intimacy?: number };
  category: "food" | "drink" | "gift";
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "cake", name: "草莓蛋糕", emoji: "🍰", price: 20, desc: "甜甜的草莓蛋糕", effects: { hunger: 20, mood: 15 }, category: "food" },
  { id: "chocolate", name: "巧克力", emoji: "🍫", price: 15, desc: "丝滑巧克力", effects: { hunger: 10, mood: 10 }, category: "food" },
  { id: "cookie", name: "曲奇饼干", emoji: "🍪", price: 10, desc: "酥脆曲奇", effects: { hunger: 15, mood: 5 }, category: "food" },
  { id: "coffee", name: "咖啡", emoji: "☕", price: 18, desc: "提神醒脑", effects: { fatigue: -15, mood: 5 }, category: "drink" },
  { id: "milktea", name: "珍珠奶茶", emoji: "🧋", price: 16, desc: "香甜奶茶", effects: { hunger: 10, mood: 10 }, category: "drink" },
  { id: "juice", name: "鲜榨果汁", emoji: "🧃", price: 12, desc: "维C满满", effects: { hunger: 5, mood: 8 }, category: "drink" },
  { id: "flowers", name: "玫瑰花束", emoji: "💐", price: 50, desc: "浪漫之选", effects: { mood: 30, intimacy: 5 }, category: "gift" },
  { id: "necklace", name: "水晶项链", emoji: "💎", price: 100, desc: "闪耀动人", effects: { mood: 50, intimacy: 10 }, category: "gift" },
  { id: "bear", name: "小熊玩偶", emoji: "🧸", price: 35, desc: "可爱抱抱熊", effects: { mood: 20, intimacy: 8 }, category: "gift" },
];

// 约会活动定义
export interface DateActivity {
  id: string;
  name: string;
  emoji: string;
  duration: string;
  desc: string;
  effects: { hunger?: number; fatigue?: number; mood?: number; intimacy?: number };
}

export const DATE_ACTIVITIES: DateActivity[] = [
  { id: "stroll", name: "散步", emoji: "🚶", duration: "20分钟", desc: "一起在公园散步", effects: { intimacy: 5, mood: 10, fatigue: 5 } },
  { id: "shopping", name: "逛街", emoji: "🛍️", duration: "30分钟", desc: "一起去逛街买东西", effects: { intimacy: 10, mood: 15, fatigue: 10 } },
  { id: "movie", name: "看电影", emoji: "🎬", duration: "1小时", desc: "依偎在一起看电影", effects: { intimacy: 15, mood: 20, fatigue: 5 } },
  { id: "cooking", name: "一起做饭", emoji: "🍳", duration: "30分钟", desc: "一起下厨做美食", effects: { intimacy: 8, mood: 10, hunger: 30 } },
  { id: "gaming", name: "玩游戏", emoji: "🎮", duration: "40分钟", desc: "一起打电动", effects: { intimacy: 12, mood: 18, fatigue: 8 } },
  { id: "stargazing", name: "看星星", emoji: "✨", duration: "30分钟", desc: "一起看星空", effects: { intimacy: 20, mood: 15, fatigue: 3 } },
];

// 生成宠物状态描述（注入 AI 系统提示词）
export function buildPetStateDescription(petState: PetState): string {
  const lines: string[] = [];

  if (petState.hunger < 20) {
    lines.push("你现在很饿，肚子咕咕叫，会撒娇说想吃东西");
  } else if (petState.hunger < 40) {
    lines.push("你有点饿了，会暗示对方想吃什么");
  }

  if (petState.fatigue > 80) {
    lines.push("你现在非常累，会打哈欠，说话有气无力，想休息");
  } else if (petState.fatigue > 60) {
    lines.push("你有点累了，会小小抱怨好累");
  }

  if (petState.intimacy > 80) {
    lines.push("你和对方的感情非常深厚，会主动表达爱意");
  } else if (petState.intimacy > 50) {
    lines.push("你和对方关系亲密，会自然地撒娇");
  } else if (petState.intimacy < 20) {
    lines.push("你和对方还不太熟，会比较矜持害羞");
  }

  if (lines.length === 0) return "";
  return `\n\n桌宠状态感知（影响你的回复语气）：\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

// 向后兼容
export const PERSONA = buildPersona(DEFAULT_PERSONA);
