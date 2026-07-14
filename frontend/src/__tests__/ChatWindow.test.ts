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

  // 新增：测试过滤未用括号的场景描写
  it("过滤未用括号的动作描写（被你一说...）", () => {
    const input = "被你一说，我愣了一下，指尖停在屏幕上。然后慢吞吞地打字回你： 唔…我这不是习惯了嘛😣";
    const result = cleanAssistantText(input);
    expect(result).toBe("唔…我这不是习惯了嘛😣");
  });

  it("过滤未用括号的心理描写（看着...心里...）", () => {
    const input = "看着你的消息，我心里五味杂陈，不知道该说什么好。 唔...好吧";
    const result = cleanAssistantText(input);
    expect(result).toBe("唔...好吧");
  });

  it("过滤未用括号的神态描写（歪了歪头...眼神...）", () => {
    const input = "歪了歪头，眼神里带着疑惑，凑近了屏幕。 好像是这样哦";
    const result = cleanAssistantText(input);
    expect(result).toBe("好像是这样哦");
  });

  it("保留正常消息（无场景描写）", () => {
    const input = "今天去漫展了！超开心！遇到好多可爱的小姐姐✨";
    const result = cleanAssistantText(input);
    expect(result).toBe("今天去漫展了！超开心！遇到好多可爱的小姐姐✨");
  });

  it("综合过滤：括号+未用括号的场景描写", () => {
    const input = "（歪头想了想）被你一说，我愣了一下。 然后慢吞吞地打字： 唔...好吧";
    const result = cleanAssistantText(input);
    expect(result).toBe("唔...好吧");
  });
});
