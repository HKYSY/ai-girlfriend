import { describe, it, expect } from "vitest";
import { moodToEmoji } from "../utils.js";

describe("moodToEmoji", () => {
  it("mood >= 90 返回 😍", () => {
    expect(moodToEmoji(90)).toBe("😍");
    expect(moodToEmoji(100)).toBe("😍");
  });

  it("mood >= 70 返回 😊", () => {
    expect(moodToEmoji(70)).toBe("😊");
    expect(moodToEmoji(89)).toBe("😊");
  });

  it("mood >= 50 返回 🙂", () => {
    expect(moodToEmoji(50)).toBe("🙂");
    expect(moodToEmoji(69)).toBe("🙂");
  });

  it("mood >= 30 返回 😟", () => {
    expect(moodToEmoji(30)).toBe("😟");
    expect(moodToEmoji(49)).toBe("😟");
  });

  it("mood >= 10 返回 😢", () => {
    expect(moodToEmoji(10)).toBe("😢");
    expect(moodToEmoji(29)).toBe("😢");
  });

  it("mood < 10 返回 😭", () => {
    expect(moodToEmoji(0)).toBe("😭");
    expect(moodToEmoji(9)).toBe("😭");
  });
});
