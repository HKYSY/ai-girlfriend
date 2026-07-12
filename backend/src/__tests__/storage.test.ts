import { describe, it, expect } from "vitest";
import { generateId } from "../storage.js";

describe("generateId", () => {
  it("返回以 char- 开头的字符串", () => {
    const id = generateId();
    expect(id.startsWith("char-")).toBe(true);
  });

  it("格式为 char-{timestamp}-{random}", () => {
    const id = generateId();
    const parts = id.split("-");
    // char-{timestamp}-{random5}
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("char");
    // timestamp 应该是数字
    expect(Number.isNaN(Number(parts[1]))).toBe(false);
    // random 部分长度为 5
    expect(parts[2].length).toBe(5);
  });

  it("生成多个 ID 都不同", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });
});
