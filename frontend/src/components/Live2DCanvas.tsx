import { useEffect, useRef, useState, useCallback } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "@sekai-world/pixi-live2d-display-mulmotion";

interface Live2DCanvasProps {
  modelUrl: string;
  mood: number; // 0-100 心情值
  emotion?: string | null; // 情绪标签：开心/生气/难过/撒娇/惊讶/疑惑/害羞/平静
  position: { x: number; y: number; scale: number };
  onPositionChange: (pos: { x: number; y: number; scale: number }) => void;
}

// 心情值 → 候选表情名映射（按优先级排列，兼容不同模型）
function moodToExpressions(mood: number): string[] {
  if (mood >= 90) return ["爱心眼", "F01"]; // 非常开心
  if (mood >= 70) return ["星星眼", "F02"]; // 开心
  if (mood >= 50) return ["脸红", "F03"]; // 平静/舒适
  if (mood >= 30) return ["疑惑", "F04"]; // 有点不开心
  if (mood >= 10) return ["流泪", "F05"]; // 难过
  return ["生气", "F05"]; // 极度失落/生气
}

// 情绪标签 → 候选表情名映射（按优先级排列，兼容 IceGirl 和 Haru）
// 当 AI 回复带有情绪标签时，优先使用此映射而非心情值映射
function emotionToExpressions(emotion: string): string[] {
  switch (emotion) {
    case "开心": return ["爱心眼", "星星眼", "F01", "F02"];
    case "生气": return ["生气", "脸黑", "白眼", "歪嘴", "F04"];
    case "难过": return ["流泪", "F05"];
    case "撒娇": return ["脸红", "猫耳", "F03"];
    case "惊讶": return ["惊讶", "F06"];
    case "疑惑": return ["疑惑", "歪嘴右", "F07"];
    case "害羞": return ["脸红", "猫耳", "F03"];
    case "平静": return ["脸红", "F08"];
    default: return [];
  }
}

// 情绪标签 → 候选动作组映射（情绪强烈时触发动作）
function emotionToMotions(emotion: string): string[] {
  switch (emotion) {
    case "开心":
    case "撒娇":
      return ["TapBody", "Tap"]; // 活泼动作
    default:
      return [];
  }
}

// 点击反馈文字（随机一个）
const CLICK_FEEDBACKS = ["♥", "呀！", "嗯？", "嘻嘻", "干嘛啦~", "嘿嘿"];
// 拖拽触发阈值（像素）
const DRAG_THRESHOLD = 5;
// 缩放倍率上下限
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.0;
// 动作优先级：FORCE = 2，强制重新播放
const MOTION_FORCE = 2;

export default function Live2DCanvas({
  modelUrl,
  mood,
  emotion,
  position,
  onPositionChange,
}: Live2DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const baseScaleRef = useRef<number>(1);
  const scaleMulRef = useRef<number>(1);

  // 拖拽状态
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startModelX: number;
    startModelY: number;
    isDragging: boolean;
  } | null>(null);

  // 始终指向最新回调
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ id: number; text: string } | null>(
    null
  );
  const [motionGroups, setMotionGroups] = useState<string[]>([]);
  const [expressions, setExpressions] = useState<string[]>([]);
  const [activeMotion, setActiveMotion] = useState<string | null>(null);
  const [activeExpression, setActiveExpression] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [selected, setSelected] = useState(false); // 是否选中（选中后才能拖拽缩放）

  // 始终指向最新 selected 状态（避免闭包捕获旧值，必须在 selected 声明之后）
  const selectedRef = useRef(false);
  selectedRef.current = selected;

  // 复位到默认居中、贴底位置
  const resetPosition = useCallback(() => {
    const model = modelRef.current;
    const app = appRef.current;
    if (!model || !app) return;
    model.scale.set(baseScaleRef.current);
    scaleMulRef.current = 1;
    model.x = app.renderer.width / 2 - model.width / 2;
    model.y = app.renderer.height - model.height;
    onPositionChangeRef.current({
      x: model.x,
      y: model.y,
      scale: 1,
    });
  }, []);

  // 加载 Live2D 模型
  useEffect(() => {
    let app: PIXI.Application | null = null;
    let destroyed = false;
    let cleanupHandlers: (() => void) | null = null;

    const init = async () => {
      (window as unknown as { PIXI: typeof PIXI }).PIXI = PIXI;

      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || 500;
      const height = container.clientHeight || 700;

      app = new PIXI.Application({
        backgroundAlpha: 0,
        antialias: true,
        autoStart: true,
        width,
        height,
      });
      appRef.current = app;
      if (destroyed) {
        app.destroy(true, { children: true });
        appRef.current = null;
        return;
      }
      container.appendChild(app.view as HTMLCanvasElement);

      try {
        const model = await Live2DModel.from(modelUrl);
        if (destroyed || !app) return;

        // 计算基准缩放
        const baseScale =
          Math.min(
            app.renderer.width / model.width,
            app.renderer.height / model.height
          ) * 0.85;
        baseScaleRef.current = baseScale;

        const isDefault =
          position.x === 0 && position.y === 0 && position.scale === 1;

        if (isDefault) {
          model.scale.set(baseScale);
          scaleMulRef.current = 1;
          model.x = app.renderer.width / 2 - model.width / 2;
          model.y = app.renderer.height - model.height;
        } else {
          scaleMulRef.current = position.scale;
          model.scale.set(baseScale * position.scale);
          model.x = position.x;
          model.y = position.y;
        }

        model.interactive = true;

        // 按下模型：左键记录拖拽起点，右键取消选中
        model.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
          e.stopPropagation();
          if (e.button === 2) {
            // 右键 → 取消选中
            setSelected(false);
            return;
          }
          // 左键 → 记录拖拽起点
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startModelX: model.x,
            startModelY: model.y,
            isDragging: false,
          };
        });

        // 鼠标移动：选中状态下才能拖拽
        const onMove = (e: MouseEvent) => {
          const d = dragRef.current;
          if (!d) return;
          if (!selectedRef.current) return; // 未选中不允许拖拽（用 ref 读最新值）
          const dx = e.clientX - d.startX;
          const dy = e.clientY - d.startY;
          if (!d.isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
            d.isDragging = true;
          }
          if (d.isDragging) {
            model.x = d.startModelX + dx;
            model.y = d.startModelY + dy;
          }
        };

        // 鼠标松开：区分选中/拖拽保存/点击反馈
        const onUp = () => {
          const d = dragRef.current;
          dragRef.current = null;
          if (!d) return;
          if (d.isDragging) {
            // 拖拽结束，保存位置
            onPositionChangeRef.current({
              x: model.x,
              y: model.y,
              scale: scaleMulRef.current,
            });
            return;
          }
          // 普通点击（用 ref 读最新值，避免闭包捕获旧 selected）
          if (!selectedRef.current) {
            // 未选中 → 选中
            setSelected(true);
          } else {
            // 已选中 → 触发 TapBody 动作 + 反馈
            try {
              model.motion("TapBody", undefined, MOTION_FORCE);
            } catch {
              // 忽略
            }
            const text =
              CLICK_FEEDBACKS[
                Math.floor(Math.random() * CLICK_FEEDBACKS.length)
              ];
            setFeedback({ id: Date.now(), text });
          }
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        cleanupHandlers = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };

        app.stage.addChild(model);
        modelRef.current = model;
        setLoading(false);

        // 读取动作组
        const motionDefs = (
          model.internalModel as unknown as {
            motionManager?: { definitions?: Record<string, unknown> };
          }
        )?.motionManager?.definitions;
        const groups = motionDefs ? Object.keys(motionDefs) : [];
        setMotionGroups(groups);

        // 读取表情列表
        const exprManager = (
          model.internalModel as unknown as {
            motionManager?: {
              expressionManager?: Record<string, unknown>;
            };
          }
        )?.motionManager?.expressionManager;
        const exprDefs = (exprManager as { definitions?: unknown[] })?.definitions;
        let exprNames: string[] = [];
        if (Array.isArray(exprDefs)) {
          exprNames = exprDefs
            .map((d) => {
              if (typeof d === "string") return d;
              if (d && typeof d === "object") {
                const obj = d as Record<string, unknown>;
                return (obj.Name as string) || (obj.name as string) || (obj.id as string) || "";
              }
              return "";
            })
            .filter(Boolean);
        }
        setExpressions(exprNames);

        // 初始表情
        try {
          const candidates = moodToExpressions(mood);
          const expr = candidates.find((e) => exprNames.includes(e));
          if (expr) {
            model.expression(expr);
            setActiveExpression(expr);
          }
        } catch {
          // 忽略
        }
      } catch (e) {
        console.error("[Live2D] 模型加载失败:", e);
        setLoading(false);
      }
    };

    init();

    return () => {
      destroyed = true;
      cleanupHandlers?.();
      modelRef.current = null;
      appRef.current = null;
      app?.destroy(true, { children: true });
      app = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl]);

  // 鼠标滚轮缩放：仅选中状态下生效
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (!selected) return; // 未选中不允许缩放
      e.preventDefault();
      const model = modelRef.current;
      const app = appRef.current;
      if (!model || !app) return;
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      let newMul = scaleMulRef.current + delta;
      newMul = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newMul));
      if (newMul === scaleMulRef.current) return;
      // 保持底部中心点不动
      const cx = model.x + model.width / 2;
      const by = model.y + model.height;
      model.scale.set(baseScaleRef.current * newMul);
      scaleMulRef.current = newMul;
      model.x = cx - model.width / 2;
      model.y = by - model.height;
      onPositionChangeRef.current({
        x: model.x,
        y: model.y,
        scale: newMul,
      });
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [selected]);

  // 右键容器：取消选中并阻止默认菜单
  const handleContainerContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setSelected(false);
  };

  // 心情变化时切换表情（仅当没有情绪标签时使用，情绪标签优先级更高）
  useEffect(() => {
    if (emotion) return; // 有情绪标签时跳过心情映射
    const model = modelRef.current;
    if (!model) return;
    try {
      const candidates = moodToExpressions(mood);
      const expr = candidates.find((e) => expressions.includes(e));
      if (expr) {
        model.expression(expr);
        setActiveExpression(expr);
      }
    } catch {
      // 忽略
    }
  }, [mood, expressions, emotion]);

  // 情绪标签变化时切换表情和动作（AI 回复驱动，优先级最高）
  useEffect(() => {
    if (!emotion) return;
    const model = modelRef.current;
    if (!model) return;
    try {
      // 1. 切换表情
      const exprCandidates = emotionToExpressions(emotion);
      const expr = exprCandidates.find((e) => expressions.includes(e));
      if (expr) {
        model.expression(expr);
        setActiveExpression(expr);
      }
      // 2. 触发动作（开心/撒娇等强烈情绪时）
      const motionCandidates = emotionToMotions(emotion);
      const motion = motionCandidates.find((m) => motionGroups.includes(m));
      if (motion) {
        model.motion(motion, undefined, MOTION_FORCE);
        setActiveMotion(motion);
      }
    } catch {
      // 忽略
    }
  }, [emotion, expressions, motionGroups]);

  // 点击反馈文字自动消失
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 1500);
    return () => clearTimeout(timer);
  }, [feedback]);

  // 播放指定动作组（强制重新播放，解决重复点击无反应）
  const playMotion = (group: string) => {
    const model = modelRef.current;
    if (!model) return;
    try {
      // 使用 FORCE 优先级强制重新播放
      model.motion(group, undefined, MOTION_FORCE);
    } catch {
      // 忽略
    }
    setActiveMotion(group);
  };

  // 切换表情
  const playExpression = (name: string) => {
    const model = modelRef.current;
    if (!model) return;
    try {
      model.expression(name);
      setActiveExpression(name);
    } catch {
      // 忽略
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
      onContextMenu={handleContainerContextMenu}
    >
      {/* 合并双栏面板：上栏表情，下栏动作 */}
      {(expressions.length > 0 || motionGroups.length > 0) && (
        <div className={`control-panel${panelCollapsed ? " collapsed" : ""}`}>
          <button
            className="control-panel-toggle"
            onClick={() => setPanelCollapsed((v) => !v)}
            title={panelCollapsed ? "展开" : "收起"}
          >
            {panelCollapsed ? "›" : "‹"}
          </button>
          {!panelCollapsed && (
            <>
              {/* 表情区 */}
              {expressions.length > 0 && (
                <div className="control-section">
                  <div className="control-section-title">表情</div>
                  <div className="control-btn-grid">
                    {expressions.map((name) => (
                      <button
                        key={name}
                        className={`control-btn${
                          activeExpression === name ? " active" : ""
                        }`}
                        onClick={() => playExpression(name)}
                        title={`表情: ${name}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* 动作区 */}
              {motionGroups.length > 0 && (
                <div className="control-section">
                  <div className="control-section-title">动作</div>
                  <div className="control-btn-grid">
                    {motionGroups.map((group) => (
                      <button
                        key={group}
                        className={`control-btn${
                          activeMotion === group ? " active" : ""
                        }`}
                        onClick={() => playMotion(group)}
                        title={`动作: ${group}`}
                      >
                        {group}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 复位按钮 */}
      {selected && (
        <button
          className="reset-btn"
          onClick={(e) => {
            e.stopPropagation();
            resetPosition();
          }}
          title="复位"
        >
          ⟲ 复位
        </button>
      )}

      {/* 选中状态指示 */}
      {selected && (
        <div className="selected-hint">已选中 · 可拖拽缩放</div>
      )}

      {loading && <div className="stage-loading">立绘加载中…</div>}
      {feedback && (
        <div key={feedback.id} className="click-feedback">
          {feedback.text}
        </div>
      )}
    </div>
  );
}
