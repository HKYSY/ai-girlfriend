// 前端纯函数工具模块（从 App.tsx 提取，便于单元测试）

// 心情值 → emoji
export function moodToEmoji(mood: number): string {
  if (mood >= 90) return "😍";
  if (mood >= 70) return "😊";
  if (mood >= 50) return "🙂";
  if (mood >= 30) return "😟";
  if (mood >= 10) return "😢";
  return "😭";
}
