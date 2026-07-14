import { useState, useEffect, useCallback, useRef } from "react";
import { scanImportStickers } from "../api";
import type { Sticker } from "../api";
import "./StickerPanel.css";

// 带超时的 fetch（防止后端无响应时一直 pending 导致界面卡死）
function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 30000): Promise<Response> {
  const ctrl = new AbortController();
  const id = window.setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => window.clearTimeout(id));
}

// 模块级 freeze 缓存（防止 React 重渲染后重复处理）
const frozenGifSet = new Set<string>();

// 把 GIF 提取为静态首帧 PNG（面板里 GIF 不动，仅发送后才动）
async function freezeGif(img: HTMLImageElement, filename: string) {
  if (!filename.toLowerCase().endsWith(".gif")) return;
  if (frozenGifSet.has(filename)) return;
  frozenGifSet.add(filename);
  try {
    const resp = await fetch(img.src, { cache: "force-cache" });
    if (!resp.ok) { frozenGifSet.delete(filename); return; }
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const tmp = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode fail"));
      i.src = blobUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = tmp.naturalWidth || 100;
    canvas.height = tmp.naturalHeight || 100;
    const ctx = canvas.getContext("2d");
    if (!ctx) { URL.revokeObjectURL(blobUrl); frozenGifSet.delete(filename); return; }
    ctx.drawImage(tmp, 0, 0);
    img.src = canvas.toDataURL("image/png");
    URL.revokeObjectURL(blobUrl);
  } catch {
    frozenGifSet.delete(filename);
  }
}

// 图标用 emoji/文字，100% 可靠显示
const Ic = {
  Plus: () => <span style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1, userSelect: "none" }}>+</span>,
  X: () => <span style={{ fontSize: "16px", fontWeight: 600, lineHeight: 1, userSelect: "none" }}>✕</span>,
  Search: () => <span style={{ fontSize: "13px", lineHeight: 1, userSelect: "none" }}>🔍</span>,
  Smile: () => <span style={{ fontSize: "18px", lineHeight: 1, userSelect: "none" }}>😊</span>,
  FolderOpen: () => <span style={{ fontSize: "17px", lineHeight: 1, userSelect: "none" }}>📂</span>,
  Trash: () => <span style={{ fontSize: "15px", lineHeight: 1, userSelect: "none" }}>🗑️</span>,
  Check: () => <span style={{ fontSize: "16px", fontWeight: 600, lineHeight: 1, userSelect: "none" }}>✓</span>,
  Back: () => <span style={{ fontSize: "16px", lineHeight: 1, userSelect: "none" }}>←</span>,
};

interface StickerPanelProps {
  onSend: (sticker: Sticker) => void;
  onClose: () => void;
}

export function StickerPanel({ onSend, onClose }: StickerPanelProps) {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ cur: number; total: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 删除模式
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const loadMain = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/stickers?limit=200", { cache: "no-store" }, 15000);
      const data = await res.json();
      if (data.ok) setStickers(data.stickers);
    } catch (e) {
      console.error("加载表情包失败:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMain();
  }, [loadMain]);

  // 点击面板外（且不在输入区）关闭，不影响输入框打字
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (panelRef.current?.contains(target) || target.closest(".chat-input")) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered = stickers.filter((s) => {
    if (!keyword) return true;
    const hay = (s.keywords + " " + s.category + " " + s.emotionMatch).toLowerCase();
    return hay.includes(keyword.toLowerCase());
  });

  // ========== 上传 ==========
  const handlePickFiles = () => {
    if (!fileInputRef.current) {
      showToast("选择器未就绪，请重试");
      return;
    }
    fileInputRef.current.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setBusy(true);
    setUploadProgress({ cur: 0, total: files.length });
    let ok = 0;
    const newStickers: Sticker[] = [];
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ cur: i + 1, total: files.length });
      try {
        const fd = new FormData();
        fd.append("sticker", files[i]);
        fd.append("category", "general");
        const res = await fetchWithTimeout("/api/stickers/upload", { method: "POST", body: fd }, 30000);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.filename) {
            ok++;
            newStickers.push({
              id: data.id,
              filename: data.filename,
              category: "general",
              keywords: "[]",
              emotionMatch: "",
              usageCount: 0,
              createdAt: new Date().toISOString(),
            });
          }
        }
      } catch { /* 忽略单张失败 */ }
    }
    setUploadProgress(null);
    setBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (ok > 0) {
      setStickers((prev) => [...newStickers, ...prev]);
      showToast(`已上传 ${ok} 张`);
      loadMain().catch(() => {});
    } else {
      showToast("上传失败，请检查后端是否运行");
    }
  };

  const handleScanImport = async () => {
    setBusy(true);
    try {
      const r = await scanImportStickers();
      if (r.imported > 0) {
        showToast(`已导入 ${r.imported} 张`);
        await loadMain();
      } else {
        showToast(r.message || "temp 目录无图片");
      }
    } catch {
      showToast("扫描失败");
    } finally {
      setBusy(false);
    }
  };

  // ========== 删除模式 ==========
  const enterDeleteMode = () => {
    setDeleteMode(true);
    setSelectedIds(new Set());
    setKeyword("");
  };

  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  };

  // 批量删除
  const [confirmingBatch, setConfirmingBatch] = useState(false);
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirmingBatch) {
      setConfirmingBatch(true);
      window.setTimeout(() => setConfirmingBatch(false), 3000);
      return;
    }
    const ids = Array.from(selectedIds);
    // 乐观更新
    setStickers((prev) => prev.filter((s) => !selectedIds.has(s.id)));
    showToast(`已删除 ${ids.length} 张`);
    setConfirmingBatch(false);
    exitDeleteMode();
    // 并行删除
    Promise.allSettled(
      ids.map((id) => fetchWithTimeout(`/api/stickers/${id}`, { method: "DELETE" }, 10000))
    ).then((results) => {
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed > 0) {
        showToast(`${failed} 张删除失败，已恢复`);
        loadMain();
      }
    });
  };

  return (
    <div className="sticker-panel" ref={panelRef} onClick={(e) => e.stopPropagation()}>
      {/* 隐藏的文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
        style={{ position: "absolute", left: "-9999px", top: "0", opacity: "0", width: "1px", height: "1px", pointerEvents: "none" }}
        onChange={handleFileChange}
      />

      {/* Header: 根据模式切换 */}
      {deleteMode ? (
        <div className="sp-header sp-header--delete">
          <button className="sp-icon-btn" onClick={exitDeleteMode} title="退出删除模式" aria-label="退出删除">
            <Ic.Back />
          </button>
          <div className="sp-delete-info">
            已选 <strong>{selectedIds.size}</strong> / {filtered.length}
          </div>
          <button
            className={`sp-delete-confirm${confirmingBatch ? " confirming" : ""}${selectedIds.size === 0 ? " disabled" : ""}`}
            onClick={handleBatchDelete}
            disabled={selectedIds.size === 0}
            title="删除所选表情包"
          >
            {confirmingBatch ? "再次点击确认" : `🗑️ 删除 ${selectedIds.size} 个`}
          </button>
        </div>
      ) : (
        <div className="sp-header">
          <button
            className="sp-icon-btn sp-icon-btn--primary"
            onClick={handlePickFiles}
            disabled={busy}
            title="选择图片上传"
            aria-label="选择图片上传"
          >
            <Ic.Plus />
          </button>
          <div className="sp-search">
            <Ic.Search />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索表情包"
            />
          </div>
          <button
            className="sp-icon-btn"
            onClick={enterDeleteMode}
            disabled={stickers.length === 0}
            title="删除模式（多选）"
            aria-label="删除模式"
          >
            <Ic.Trash />
          </button>
          <button className="sp-icon-btn" onClick={onClose} title="关闭" aria-label="关闭">
            <Ic.X />
          </button>
        </div>
      )}

      {/* Main grid: 4 列表情包 */}
      <div className={`sp-main${deleteMode ? " delete-mode" : ""}`}>
        {loading ? (
          <div className="sp-skeleton-grid">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="sp-skeleton" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="sp-empty">
            <div className="sp-empty-icon">🗂️</div>
            <div className="sp-empty-text">{keyword ? "没找到匹配的表情" : "还没有表情包"}</div>
            {!keyword && !deleteMode && (
              <div className="sp-empty-hint">
                点左上角 <strong>+</strong> 选择图片上传
                <br />
                或把图放到 <code>backend/data/stickers/temp</code> 后点底部 📂
              </div>
            )}
          </div>
        ) : (
          filtered.map((s) => {
            const isSelected = selectedIds.has(s.id);
            return (
              <div
                key={s.id}
                className={`sp-item${deleteMode ? " selectable" : ""}${isSelected ? " selected" : ""}`}
                onClick={() => {
                  if (deleteMode) toggleSelect(s.id);
                  else { onSend(s); onClose(); }
                }}
                title={deleteMode ? (isSelected ? "取消选择" : "选择") : "点击发送"}
              >
                <img
                  src={`/stickers/${s.filename}`}
                  alt=""
                  loading="lazy"
                  onLoad={(e) => freezeGif(e.currentTarget, s.filename)}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.opacity = "0.15";
                  }}
                />
                {deleteMode && (
                  <div className={`sp-item-check${isSelected ? " checked" : ""}`}>
                    {isSelected && <Ic.Check />}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer toolbar: 表情(active) + 扫描temp导入 + 全选（仅删除模式） + 计数 */}
      <div className="sp-footer">
        <button className="sp-tool active" title="表情">
          <Ic.Smile />
        </button>
        <button
          className="sp-tool"
          onClick={handleScanImport}
          disabled={busy}
          title="扫描 temp 目录批量导入"
        >
          <Ic.FolderOpen />
        </button>
        {deleteMode && (
          <button className="sp-tool" onClick={selectAll} title="全选/取消全选">
            <span style={{ fontSize: "11px", fontWeight: 600, userSelect: "none" }}>全选</span>
          </button>
        )}
        <span className="sp-footer-spacer" />
        <span className="sp-footer-info">
          {uploadProgress ? `上传中 ${uploadProgress.cur}/${uploadProgress.total}` : busy ? "处理中…" : `${stickers.length} 个`}
        </span>
      </div>

      {/* Toast */}
      {toast && <div className="sp-toast">{toast}</div>}
    </div>
  );
}
