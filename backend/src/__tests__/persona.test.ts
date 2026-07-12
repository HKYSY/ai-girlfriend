import { describe, it, expect } from "vitest";
import {
  getMoodLevel,
  clampMoodChange,
  buildPersona,
  checkAchievements,
  DEFAULT_PET_STATE,
  MOOD_LEVELS,
} from "../persona.js";
import type { PersonaSettings, PetState } from "../persona.js";

describe("getMoodLevel", () => {
  it("返回极度失落 (mood=0)", () => {
    const level = getMoodLevel(0);
    expect(level.label).toBe("极度失落");
    expect(level.min).toBe(0);
    expect(level.max).toBe(9);
  });

  it("返回极度失落 (mood=9，边界)", () => {
    expect(getMoodLevel(9).label).toBe("极度失落");
  });

  it("返回很难过 (mood=10，边界)", () => {
    expect(getMoodLevel(10).label).toBe("很难过");
  });

  it("返回平静 (mood=50)", () => {
    expect(getMoodLevel(50).label).toBe("平静");
  });

  it("返回非常开心 (mood=100)", () => {
    expect(getMoodLevel(100).label).toBe("非常开心");
  });

  it("负数 clamp 到 0", () => {
    expect(getMoodLevel(-5).label).toBe("极度失落");
  });

  it("超过 100 clamp 到 100", () => {
    expect(getMoodLevel(105).label).toBe("非常开心");
  });

  it("覆盖所有 10 个等级", () => {
    expect(MOOD_LEVELS.length).toBe(10);
  });
});

describe("clampMoodChange", () => {
  it("变化小于 maxDelta 时直接返回 newMood", () => {
    expect(clampMoodChange(60, 65, 10)).toBe(65);
  });

  it("变化等于 maxDelta 时直接返回 newMood", () => {
    expect(clampMoodChange(60, 70, 10)).toBe(70);
  });

  it("变化超过 maxDelta 时限制为 +maxDelta", () => {
    expect(clampMoodChange(60, 85, 10)).toBe(70);
  });

  it("变化超过 maxDelta 时限制为 -maxDelta", () => {
    expect(clampMoodChange(60, 40, 10)).toBe(50);
  });

  it("不超过 100 上限", () => {
    expect(clampMoodChange(95, 110, 10)).toBe(100);
  });

  it("不低于 0 下限", () => {
    expect(clampMoodChange(5, -10, 10)).toBe(0);
  });

  it("默认 maxDelta 为 10", () => {
    expect(clampMoodChange(50, 70)).toBe(60);
  });
});

describe("buildPersona", () => {
  const settings: PersonaSettings = {
    name: "玉子",
    personalityTemplate: "yuko",
    customPersonality: "",
  };

  it("包含角色名", () => {
    const prompt = buildPersona(settings, 60);
    expect(prompt).toContain("玉子");
  });

  it("包含当前心情值", () => {
    const prompt = buildPersona(settings, 65);
    expect(prompt).toContain("65/100");
  });

  it("包含心情等级标签", () => {
    const prompt = buildPersona(settings, 65);
    expect(prompt).toContain("舒适");
  });

  it("包含回复规则", () => {
    const prompt = buildPersona(settings, 60);
    expect(prompt).toContain("回复规则");
  });

  it("包含隐藏标记格式说明", () => {
    const prompt = buildPersona(settings, 60);
    expect(prompt).toContain("<|mood:数值|><|emotion:情绪|>");
  });

  it("custom 模式使用 customPersonality", () => {
    const customSettings: PersonaSettings = {
      name: "测试角色",
      personalityTemplate: "custom",
      customPersonality: "这是一个测试性格",
    };
    const prompt = buildPersona(customSettings, 60);
    expect(prompt).toContain("这是一个测试性格");
    expect(prompt).toContain("测试角色");
  });

  it("yuko 模式追加 customPersonality", () => {
    const settingsWithCustom: PersonaSettings = {
      name: "玉子",
      personalityTemplate: "yuko",
      customPersonality: "额外性格特点",
    };
    const prompt = buildPersona(settingsWithCustom, 60);
    expect(prompt).toContain("额外性格特点");
  });

  it("包含 petState 描述（当传入 petState 时）", () => {
    const petState: PetState = { ...DEFAULT_PET_STATE };
    const prompt = buildPersona(settings, 60, petState);
    expect(prompt.length).toBeGreaterThan(buildPersona(settings, 60).length);
  });
});

describe("checkAchievements", () => {
  it("初始状态无新成就解锁", () => {
    const state: PetState = { ...DEFAULT_PET_STATE, unlockedAchievements: [] };
    const newOnes = checkAchievements(state);
    expect(newOnes).toEqual([]);
  });

  it("聊天满 10 条解锁初识成就", () => {
    const state: PetState = {
      ...DEFAULT_PET_STATE,
      totalChats: 10,
      unlockedAchievements: [],
    };
    const newOnes = checkAchievements(state);
    expect(newOnes).toContain("chat_10");
  });

  it("不会重复解锁已解锁的成就", () => {
    const state: PetState = {
      ...DEFAULT_PET_STATE,
      totalChats: 50,
      unlockedAchievements: ["chat_10", "chat_50"],
    };
    const newOnes = checkAchievements(state);
    expect(newOnes).not.toContain("chat_10");
    expect(newOnes).not.toContain("chat_50");
  });

  it("同时解锁多个档位", () => {
    const state: PetState = {
      ...DEFAULT_PET_STATE,
      totalChats: 100,
      unlockedAchievements: [],
    };
    const newOnes = checkAchievements(state);
    expect(newOnes).toContain("chat_10");
    expect(newOnes).toContain("chat_50");
    expect(newOnes).toContain("chat_100");
  });

  it("解锁后写入 unlockedAchievements", () => {
    const state: PetState = {
      ...DEFAULT_PET_STATE,
      totalChats: 10,
      unlockedAchievements: [],
    };
    checkAchievements(state);
    expect(state.unlockedAchievements).toContain("chat_10");
  });
});
