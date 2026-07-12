import { describe, it, expect } from "vitest";
import { cleanAssistantText } from "../components/ChatWindow.js";

describe("cleanAssistantText", () => {
  it("过滤全角括号场景描写", () => {
    const input = "（看到消息，手指顿住）我没有无理取闹。";
    const result = cleanAssistantText(input);
    expect(result).toBe("我没有无理取闹。");
  });

  it("过滤多个全角括号", () => {
    const input = "（凑过来）嘿嘿（歪头）好像是这样哦";
    const result = cleanAssistantText(input);
    expect(result).toBe("嘿嘿好像是这样哦");
  });

  it("保留颜文字（半角括号）", () => {
    const input = "今天好开心 (≧▽≦)";
    const result = cleanAssistantText(input);
    expect(result).toBe("今天好开心 (≧▽≦)");
  });

  it("保留含数字的括号", () => {
    const input = "猜数字游戏范围1-100";
    const result = cleanAssistantText(input);
    expect(result).toBe("猜数字游戏范围1-100");
  });

  it("保留含英文的括号", () => {
    const input = "我看了re0很好看";
    const result = cleanAssistantText(input);
    expect(result).toBe("我看了re0很好看");
  });

  it("无括号的原样返回", () => {
    const input = "今天去漫展了！超开心！";
    const result = cleanAssistantText(input);
    expect(result).toBe("今天去漫展了！超开心！");
  });

  it("过滤长段落括号描写（1-100字）", () => {
    const input = "（发完把手机翻扣在床上，用被子蒙住头。过了几十秒，又忍不住把手机翻过来，看见你没有回复，眼泪终于啪嗒掉在屏幕上。她用力抹了一把眼睛）你不想哄就不哄了。";
    const result = cleanAssistantText(input);
    expect(result).toBe("你不想哄就不哄了。");
  });

  it("过滤后清理多余空格", () => {
    const input = "（歪头）  好像是这样哦";
    const result = cleanAssistantText(input);
    expect(result).toBe("好像是这样哦");
  });

  it("空字符串原样返回", () => {
    expect(cleanAssistantText("")).toBe("");
  });
});
