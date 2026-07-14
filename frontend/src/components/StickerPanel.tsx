import { useState, useEffect } from "react";
import "./StickerPanel.css";

interface Sticker {
  id: number;
  filename: string;
  category: string;
  keywords: string;
  emotionMatch: string;
  usageCount: number;
  createdAt: string;
}

interface StickerPanelProps {
  onSend: (sticker: Sticker) => void;
  onClose: () => void;
}

export function StickerPanel({ onSend, onClose }: StickerPanelProps) {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState("");

  const categories = [
    { value: "all", label: "全部" },
    { value: "happy", label: "开心" },
    { value: "angry", label: "生气" },
    { value: "cute", label: "撒娇" },
    { value: "confused", label: "疑惑" },
    { value: "sad", label: "难过" },
    { value: "general", label: "通用" },
  ];

  useEffect(() => {
    loadStickers();
  }, []);

  const loadStickers = async () => {
    try {
      const res = await fetch("/api/stickers");
      const data = await res.json();
      if (data.ok) {
        setStickers(data.stickers);
      }
    } catch (error) {
      console.error("加载表情包失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredStickers = stickers.filter((s) => {
    const matchCategory = selectedCategory === "all" || s.category === selectedCategory;
    const matchSearch =
      searchKeyword === "" ||
      s.keywords.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      s.category.toLowerCase().includes(searchKeyword.toLowerCase());
    return matchCategory && matchSearch;
  });

  const handleSend = (sticker: Sticker) => {
    onSend(sticker);
    onClose();
  };

  return (
    <div className="sticker-panel-overlay" onClick={onClose}>
      <div className="sticker-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sticker-panel-header">
          <h3>表情包</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="sticker-panel-controls">
          <div className="category-tabs">
            {categories.map((cat) => (
              <button
                key={cat.value}
                className={`category-tab ${selectedCategory === cat.value ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat.value)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            className="search-input"
            placeholder="搜索表情包..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>

        <div className="sticker-grid">
          {loading ? (
            <div className="loading">加载中...</div>
          ) : filteredStickers.length === 0 ? (
            <div className="empty">暂无表情包</div>
          ) : (
            filteredStickers.map((sticker) => (
              <div
                key={sticker.id}
                className="sticker-item"
                onClick={() => handleSend(sticker)}
              >
                <img
                  src={`/stickers/${sticker.filename}`}
                  alt={sticker.category}
                  className="sticker-image"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/placeholder-sticker.png";
                  }}
                />
                <div className="sticker-category">{sticker.category}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}