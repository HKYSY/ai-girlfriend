// 文件上传路由（Live2D 模型、头像等）

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
// @ts-expect-error - node-7z 没有自带类型声明，CommonJS 模块用默认导入
import Seven from 'node-7z';
import { path7za } from '7zip-bin';

const router = Router();

// 上传目录：桌面模式用系统目录（APP_DATA_DIR），开发模式用相对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_BASE = process.env.APP_DATA_DIR
  ? path.join(process.env.APP_DATA_DIR, 'uploads')
  : path.join(__dirname, '../../uploads');
const UPLOADS_DIR = path.join(UPLOADS_BASE, 'live2d');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 静态服务上传的模型文件（在 index.ts 中已注册，这里不需要重复注册）

// multer 配置
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// 获取上传的模型列表
router.get('/models', (_req, res) => {
  try {
    const models: { id: string; name: string; modelUrl: string }[] = [];
    const entries = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const modelDir = path.join(UPLOADS_DIR, entry.name);
      const files = fs.readdirSync(modelDir);
      const model3File = files.find((f) => f.endsWith('.model3.json'));
      if (model3File) {
        // 读取自定义名字
        let displayName = entry.name;
        const nameFile = path.join(modelDir, '.model-name');
        if (fs.existsSync(nameFile)) {
          displayName = fs.readFileSync(nameFile, 'utf-8').trim() || entry.name;
        }
        models.push({
          id: entry.name,
          name: displayName,
          modelUrl: `/api/models/${entry.name}/${model3File}`,
        });
      }
    }
    res.json(models);
  } catch {
    res.json([]);
  }
});

// 删除已上传的模型
router.delete('/models/:id', (req, res) => {
  try {
    const modelId = req.params.id;
    // 安全检查：只允许删除 uploads 目录下的模型，防止路径遍历攻击
    if (modelId.includes('..') || modelId.includes('/') || modelId.includes('\\')) {
      return res.status(400).json({ error: '非法的模型ID' });
    }
    const modelDir = path.join(UPLOADS_DIR, modelId);
    if (!fs.existsSync(modelDir)) {
      return res.status(404).json({ error: '模型不存在' });
    }
    // 递归删除模型目录（Windows 上 fs.rmSync 可能静默失败，用 child_process 确保删除）
    try {
      fs.rmSync(modelDir, { recursive: true, force: true });
    } catch (e) {
      console.error('[delete-model] fs.rmSync 失败:', e);
    }
    // 二次检查：如果目录仍存在，用 rmdir 命令强制删除
    if (fs.existsSync(modelDir)) {
      execSync(`rmdir /s /q "${modelDir}"`, { stdio: 'ignore' });
    }
    res.json({ ok: true, deleted: !fs.existsSync(modelDir) });
  } catch (err) {
    console.error('[delete-model] 删除失败:', err);
    res.status(500).json({ error: '删除模型失败' });
  }
});

// 预置模型列表（前端 public 目录中的模型）
router.get('/preset-models', (_req, res) => {
  const presets = [
    { id: 'icegirl', name: 'IceGirl', modelUrl: '/live2d/icegirl/IceGirl.model3.json', format: 'cubism4' },
    { id: 'haru', name: 'Haru', modelUrl: '/live2d/haru/Haru.model3.json', format: 'cubism4' },
  ];
  res.json(presets);
});

// 上传 Live2D 模型（支持 ZIP/RAR/7Z 等压缩格式）
router.post('/upload-model', upload.single('model'), async (req, res) => {
  const tmpArchive = path.join(UPLOADS_DIR, `model-${Date.now()}.tmp`);
  try {
    if (!req.file) return res.status(400).json({ error: '请上传压缩文件' });

    const modelId = `model-${Date.now()}`;
    const extractDir = path.join(UPLOADS_DIR, modelId);
    fs.mkdirSync(extractDir, { recursive: true });

    // node-7z 需要文件路径，先把 buffer 写入临时文件
    fs.writeFileSync(tmpArchive, req.file.buffer);

    // 用 7-Zip 解压（支持 ZIP/RAR/7Z/TAR/GZ/BZ2/XZ 等格式）
    await new Promise<void>((resolve, reject) => {
      const stream = Seven.extractFull(tmpArchive, extractDir, {
        $bin: path7za,
        $progress: false,
      });
      stream.on('end', () => resolve());
      stream.on('error', (err: Error) => reject(err));
    });

    // 删除临时压缩文件
    fs.rmSync(tmpArchive, { force: true });

    // 查找模型文件（优先 .model3.json，其次 .model.json）
    type Found = { file: string; format: 'cubism4' | 'cubism2' };
    const findAll = (dir: string): Found[] => {
      const results: Found[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findAll(fullPath));
        } else if (entry.name.endsWith('.model3.json')) {
          results.push({
            file: path.relative(extractDir, fullPath).replace(/\\/g, '/'),
            format: 'cubism4',
          });
        } else if (entry.name.endsWith('.model.json')) {
          results.push({
            file: path.relative(extractDir, fullPath).replace(/\\/g, '/'),
            format: 'cubism2',
          });
        }
      }
      return results;
    };

    const allModels = findAll(extractDir);
    const found = allModels.find((m) => m.format === 'cubism4') || allModels[0];
    if (!found) {
      fs.rmSync(extractDir, { recursive: true });
      return res.status(400).json({
        error: '压缩包中未找到 .model3.json 或 .model.json 文件',
      });
    }

    let modelFile = found.file;

    // 子目录提顶层
    const modelDir = path.dirname(path.join(extractDir, modelFile));
    if (modelDir !== extractDir) {
      const tempDir = path.join(UPLOADS_DIR, `${modelId}-tmp`);
      fs.renameSync(modelDir, tempDir);
      fs.rmSync(extractDir, { recursive: true });
      fs.renameSync(tempDir, extractDir);
      modelFile = path.basename(modelFile);
    }

    const modelUrl = `/api/models/${modelId}/${modelFile}`;
    // 持久化自定义名字
    const customName = (req.body?.name as string | undefined)?.trim();
    if (customName) {
      fs.writeFileSync(path.join(extractDir, '.model-name'), customName, 'utf-8');
    }
    res.json({
      ok: true,
      modelId,
      modelUrl,
      name: (customName && customName.trim()) || req.file.originalname,
      format: found.format,
    });
  } catch (err) {
    console.error('模型上传失败:', err);
    fs.rmSync(tmpArchive, { force: true });
    res.status(500).json({ error: '模型上传处理失败，请检查压缩文件格式' });
  }
});

// ========== 头像上传 ==========
const AVATARS_DIR = path.join(UPLOADS_BASE, 'avatars');
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.post('/upload-avatar', avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: '仅支持 JPG/PNG/GIF/WEBP 格式' });
    }
    const ext = req.file.originalname.split('.').pop() || 'png';
    const filename = `avatar-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(AVATARS_DIR, filename), req.file.buffer);
    res.json({ ok: true, url: `/api/avatars/${filename}` });
  } catch (err) {
    console.error('[avatar] 上传失败:', err);
    res.status(500).json({ error: '头像上传失败' });
  }
});

export default router;