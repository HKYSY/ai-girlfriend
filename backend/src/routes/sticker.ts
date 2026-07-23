// 表情包管理路由

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db, dbStickers, dbMessageStickers } from '../database.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据目录（与 database.ts 保持一致）
const DATA_DIR = process.env.APP_DATA_DIR
  ? path.join(process.env.APP_DATA_DIR, 'data')
  : path.join(__dirname, '../../data');

// 配置表情包上传中间件
// 上传临时目录放在 stickers 主目录之外，避免被 /stickers 静态服务暴露临时文件
const STICKER_TMP_DIR = path.join(DATA_DIR, '.sticker-tmp');
if (!fs.existsSync(STICKER_TMP_DIR)) fs.mkdirSync(STICKER_TMP_DIR, { recursive: true });
const stickerUpload = multer({ dest: STICKER_TMP_DIR });

// 获取表情包列表（支持分页 + 分类过滤，按使用次数倒序）
router.get('/stickers', (req, res) => {
  try {
    const category = (req.query.category as string) || 'all';
    // 用最简单的 SELECT 避免复杂查询卡住，内存过滤+排序
    let stickers = db.prepare('SELECT * FROM stickers').all() as any[];
    if (category !== 'all') {
      stickers = stickers.filter((s) => s.category === category);
    }
    stickers.sort((a, b) => b.usageCount - a.usageCount);
    const total = stickers.length;
    res.json({ ok: true, stickers, total, hasMore: false });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// 最近使用的表情包（QQ 风格面板的"最近"区域用），返回使用过且次数高的前 N 个
router.get('/stickers/recent', (req, res) => {
  try {
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    // 简单查询 + 内存过滤，避免复杂查询卡住
    const all = db.prepare('SELECT * FROM stickers').all() as any[];
    const stickers = all.filter((s) => s.usageCount > 0).sort((a, b) => b.usageCount - a.usageCount).slice(0, limit);
    res.json({ ok: true, stickers });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// 按分类获取表情包
router.get('/stickers/category/:category', (req, res) => {
  try {
    const { category } = req.params;
    const stickers = dbStickers.getByCategory(category);
    res.json({ ok: true, stickers });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// 搜索表情包
router.get('/stickers/search/:keyword', (req, res) => {
  try {
    const { keyword } = req.params;
    const stickers = dbStickers.search(keyword);
    res.json({ ok: true, stickers });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// 上传表情包
router.post('/stickers/upload', stickerUpload.single('sticker'), (req, res) => {
  try {
    if (!req.file) {
      return res.json({ ok: false, error: '未上传文件' });
    }

    const { category, keywords, emotionMatch } = req.body;
    const ext = path.extname(req.file.originalname) || '.png';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const stickerDir = path.join(DATA_DIR, 'stickers');

    if (!fs.existsSync(stickerDir)) {
      fs.mkdirSync(stickerDir, { recursive: true });
    }

    const finalPath = path.join(stickerDir, filename);
    fs.renameSync(req.file.path, finalPath);

    const id = dbStickers.add({
      filename,
      category: category || 'general',
      keywords: keywords || '[]',
      emotionMatch: emotionMatch || '',
    });

    res.json({ ok: true, id, filename, path: `/stickers/${filename}` });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// 扫描 stickers/temp 目录，批量导入用户手动放入的图片
// 把文件从 temp 移到 stickers 主目录，登记入库（默认 general 分类），导入后清空 temp
router.post('/stickers/scan-import', (_req, res) => {
  try {
    const stickerDir = path.join(DATA_DIR, 'stickers');
    const tempDir = path.join(stickerDir, 'temp');
    if (!fs.existsSync(tempDir)) {
      return res.json({ ok: true, imported: 0, skipped: 0, total: dbStickers.count(), message: 'temp 目录不存在' });
    }

    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const files = fs.readdirSync(tempDir).filter((f) => allowedExts.includes(path.extname(f).toLowerCase()));

    if (files.length === 0) {
      return res.json({ ok: true, imported: 0, skipped: 0, total: dbStickers.count(), message: 'temp 目录无图片文件' });
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const file of files) {
      const srcPath = path.join(tempDir, file);

      // 去重：数据库已有该 filename 则跳过（之前导入过），并清理 temp 残留
      if (dbStickers.getByFilename(file)) {
        skipped++;
        try { fs.unlinkSync(srcPath); } catch { /* 忽略删除失败 */ }
        continue;
      }

      // 主目录已有同名文件但数据库无记录（异常残留），重命名避免覆盖
      let finalName = file;
      if (fs.existsSync(path.join(stickerDir, file))) {
        finalName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file)}`;
      }

      try {
        fs.renameSync(srcPath, path.join(stickerDir, finalName));
        dbStickers.add({ filename: finalName, category: 'general', keywords: '[]', emotionMatch: '' });
        imported++;
      } catch (e) {
        errors.push(`${file}: ${(e as Error).message}`);
      }
    }

    // 导入完成后，尝试清空 temp 目录（仅删除空文件夹或残留的非图片文件）
    try {
      const remaining = fs.readdirSync(tempDir);
      for (const f of remaining) {
        try { fs.unlinkSync(path.join(tempDir, f)); } catch { /* 忽略 */ }
      }
    } catch { /* 忽略 */ }

    console.log(`[stickers/scan-import] 导入 ${imported}，跳过 ${skipped}，错误 ${errors.length}`);
    res.json({ ok: true, imported, skipped, errors, total: dbStickers.count() });
  } catch (e: any) {
    console.error('[stickers/scan-import] 失败:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 标注表情包（手动更新分类/关键词/情绪匹配，供前端标注功能调用）
router.patch('/stickers/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { category, keywords, emotionMatch } = req.body as {
      category?: string; keywords?: string | string[]; emotionMatch?: string;
    };

    const validCategories = ['happy', 'angry', 'cute', 'confused', 'sad', 'general'];
    if (category !== undefined && !validCategories.includes(category)) {
      return res.json({ ok: false, error: '无效的分类' });
    }
    // emotionMatch 允许空字符串（清除标注）或 8 种情绪之一
    const validEmotions = ['', '开心', '生气', '难过', '撒娇', '惊讶', '疑惑', '害羞', '平静'];
    if (emotionMatch !== undefined && !validEmotions.includes(emotionMatch)) {
      return res.json({ ok: false, error: '无效的情绪标签' });
    }

    const keywordsStr = keywords !== undefined
      ? (Array.isArray(keywords) ? JSON.stringify(keywords) : (keywords as string))
      : undefined;

    const updated = dbStickers.update(id, {
      category,
      keywords: keywordsStr,
      emotionMatch,
    });

    res.json({ ok: updated, sticker: dbStickers.getById(id) });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// 删除表情包
router.delete('/stickers/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sticker = dbStickers.getById(id);
    if (!sticker) {
      return res.json({ ok: false, error: '表情包不存在' });
    }

    // 删除文件
    const filePath = path.join(DATA_DIR, 'stickers', sticker.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 删除数据库记录
    const deleted = dbStickers.delete(id);
    res.json({ ok: deleted, message: deleted ? '删除成功' : '删除失败' });
  } catch (e: any) {
    res.json({ ok: false, error: e.message });
  }
});

// 注意：POST /api/send-sticker 路由保留在 index.ts 中，因为它依赖太多 AI 调用逻辑

export default router;