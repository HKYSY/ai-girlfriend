// 纯函数工具模块（从 index.ts 提取，便于单元测试）

// 日记条目结构
export interface DiaryEntry {
  date: string;       // YYYY-MM-DD
  content: string;    // 日记内容
  mood: number;       // 写日记时的心情
  createdAt: string;  // 创建时间 ISO
}

// 合并同一天的多条日记：去重完全相同的条目，不同内容的按时间拼接
export function mergeDiaryEntries(entries: DiaryEntry[]): DiaryEntry[] {
  // 按 date 分组
  const byDate = new Map<string, DiaryEntry[]>();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }

  const result: DiaryEntry[] = [];
  for (const [date, dayEntries] of byDate) {
    if (dayEntries.length === 1) {
      result.push(dayEntries[0]);
      continue;
    }

    // 去重完全相同的条目（content + createdAt 都相同）
    const seen = new Set<string>();
    const unique = dayEntries.filter((e) => {
      const key = e.content + "|" + e.createdAt;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length === 1) {
      result.push(unique[0]);
      continue;
    }

    // 不同内容的多条：按 createdAt 升序拼接，每段加时间标记
    unique.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const parts = unique.map((e) => {
      const time = e.createdAt.slice(11, 16); // HH:MM
      const content = e.content.trim();
      // 已有【时间】开头则不重复加
      if (/^【\d{2}:\d{2}】/.test(content)) return content;
      return `【${time}】\n${content}`;
    });

    result.push({
      date,
      content: parts.join("\n\n"),
      mood: unique[unique.length - 1].mood,
      createdAt: unique[unique.length - 1].createdAt,
    });
  }
  return result;
}

// 解析心情和情绪标记（隐藏格式 <|mood:XX|><|emotion:标签|>，用户不可见）
// 支持容错：允许标记内出现空格（如 <| mood: 65 |>），允许前导空白
export function parseMarkers(buffer: string): { mood: number | null; emotion: string | null; rest: string } {
  let mood: number | null = null;
  let emotion: string | null = null;
  let rest = buffer.trimStart();

  // 解析心情标记 <|mood:XX|>（容错：允许标记内空格）
  const moodMatch = rest.match(/^<\|\s*mood:\s*(\d{1,3})\s*\|>/);
  if (moodMatch) {
    mood = parseInt(moodMatch[1], 10);
    rest = rest.slice(moodMatch[0].length);
  }

  // 解析情绪标记 <|emotion:XX|>（容错：允许标记内空格）
  const emotionMatch = rest.match(/^<\|\s*emotion:\s*(\S+?)\s*\|>/);
  if (emotionMatch) {
    emotion = emotionMatch[1];
    rest = rest.slice(emotionMatch[0].length);
  }

  return { mood, emotion, rest };
}
