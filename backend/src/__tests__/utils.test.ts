import { describe, it, expect } from "vitest";
import { parseMarkers, mergeDiaryEntries } from "../utils.js";
import type { DiaryEntry } from "../utils.js";

describe("parseMarkers", () => {
  it("解析完整标记（mood + emotion）", () => {
    const result = parseMarkers("<|mood:65|><|emotion:开心|>你好呀");
    expect(result.mood).toBe(65);
    expect(result.emotion).toBe("开心");
    expect(result.rest).toBe("你好呀");
  });

  it("只有 mood 标记", () => {
    const result = parseMarkers("<|mood:50|>你好");
    expect(result.mood).toBe(50);
    expect(result.emotion).toBeNull();
    expect(result.rest).toBe("你好");
  });

  it("只有 emotion 标记", () => {
    const result = parseMarkers("<|emotion:生气|>哼");
    expect(result.mood).toBeNull();
    expect(result.emotion).toBe("生气");
    expect(result.rest).toBe("哼");
  });

  it("无标记", () => {
    const result = parseMarkers("你好呀");
    expect(result.mood).toBeNull();
    expect(result.emotion).toBeNull();
    expect(result.rest).toBe("你好呀");
  });

  it("容错：标记内允许空格", () => {
    const result = parseMarkers("<| mood: 65 |><| emotion: 开心 |>你好");
    expect(result.mood).toBe(65);
    expect(result.emotion).toBe("开心");
    expect(result.rest).toBe("你好");
  });

  it("容错：前导空白", () => {
    const result = parseMarkers("  <|mood:65|>你好");
    expect(result.mood).toBe(65);
    expect(result.rest).toBe("你好");
  });

  it("mood 为 0 时正确解析", () => {
    const result = parseMarkers("<|mood:0|><|emotion:难过|>呜呜");
    expect(result.mood).toBe(0);
    expect(result.emotion).toBe("难过");
  });

  it("mood 为 100 时正确解析", () => {
    const result = parseMarkers("<|mood:100|><|emotion:开心|>耶");
    expect(result.mood).toBe(100);
  });

  it("非标记开头的内容不解析", () => {
    const result = parseMarkers("你好<|mood:65|>");
    expect(result.mood).toBeNull();
    expect(result.rest).toBe("你好<|mood:65|>");
  });
});

describe("mergeDiaryEntries", () => {
  it("空数组返回空数组", () => {
    expect(mergeDiaryEntries([])).toEqual([]);
  });

  it("单条日记原样返回", () => {
    const entry: DiaryEntry = {
      date: "2026-07-12",
      content: "今天很开心",
      mood: 70,
      createdAt: "2026-07-12T10:00:00.000Z",
    };
    expect(mergeDiaryEntries([entry])).toEqual([entry]);
  });

  it("同一天多条不同内容按时间拼接", () => {
    const entries: DiaryEntry[] = [
      {
        date: "2026-07-12",
        content: "早上去了漫展",
        mood: 70,
        createdAt: "2026-07-12T10:00:00.000Z",
      },
      {
        date: "2026-07-12",
        content: "下午买了周边",
        mood: 80,
        createdAt: "2026-07-12T15:00:00.000Z",
      },
    ];
    const result = mergeDiaryEntries(entries);
    expect(result.length).toBe(1);
    expect(result[0].date).toBe("2026-07-12");
    expect(result[0].content).toContain("【10:00】");
    expect(result[0].content).toContain("早上去了漫展");
    expect(result[0].content).toContain("【15:00】");
    expect(result[0].content).toContain("下午买了周边");
    // mood 取最后一条
    expect(result[0].mood).toBe(80);
  });

  it("同一天完全相同的条目去重", () => {
    const entry: DiaryEntry = {
      date: "2026-07-12",
      content: "今天很开心",
      mood: 70,
      createdAt: "2026-07-12T10:00:00.000Z",
    };
    const result = mergeDiaryEntries([entry, { ...entry }]);
    expect(result.length).toBe(1);
  });

  it("不同天的日记保持独立", () => {
    const entries: DiaryEntry[] = [
      {
        date: "2026-07-11",
        content: "昨天的事",
        mood: 60,
        createdAt: "2026-07-11T10:00:00.000Z",
      },
      {
        date: "2026-07-12",
        content: "今天的事",
        mood: 70,
        createdAt: "2026-07-12T10:00:00.000Z",
      },
    ];
    const result = mergeDiaryEntries(entries);
    expect(result.length).toBe(2);
  });

  it("已有时间标记的内容不重复加", () => {
    const entries: DiaryEntry[] = [
      {
        date: "2026-07-12",
        content: "【09:00】\n早上的内容",
        mood: 70,
        createdAt: "2026-07-12T09:00:00.000Z",
      },
      {
        date: "2026-07-12",
        content: "下午的内容",
        mood: 80,
        createdAt: "2026-07-12T15:00:00.000Z",
      },
    ];
    const result = mergeDiaryEntries(entries);
    expect(result.length).toBe(1);
    // 第一条已有标记，不应该被重复添加
    const matches = result[0].content.match(/【09:00】/g);
    expect(matches).toHaveLength(1);
  });
});
