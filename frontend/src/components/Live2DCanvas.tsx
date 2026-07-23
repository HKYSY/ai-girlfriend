import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import * as PIXI from "pixi.js";
import { Live2DModel } from "@sekai-world/pixi-live2d-display-mulmotion";
import InteractPanel from "./InteractPanel";
import type { PetState } from "../api";

interface Live2DCanvasProps {
  modelUrl: string;
  mood: number; // 0-100 心情值
  emotion?: string | null; // 情绪标签：开心/生气/难过/撒娇/惊讶/疑惑/害羞/平静
  position: { x: number; y: number; scale: number };
  onPositionChange: (pos: { x: number; y: number; scale: number }) => void;
  bubbleText?: { id: number; text: string } | null; // 外部触发的气泡文字
  // 互动栏所需数据
  characterId: string;
  petState: PetState | null;
  onPetStateChange: (state: PetState) => void;
  onAIContext: (context: string) => void;
  onBubble: (text: string) => void;
  // 外部强制关闭浮层信号（每次递增触发关闭）
  closeSignal?: number;
  // 控制 canvas 显示/隐藏（不卸载，保持模型加载状态）
  visible?: boolean;
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
      // 挥手动作（TapBody）有残影 bug，禁止自动触发，仅用 Tap
      return ["Tap"];
    default:
      return [];
  }
}

// 装饰/开关型表情名称（与普通表情区分开，单独显示为开关）
// 这些表情属于装饰/服装/发型切换，不是面部表情
const DECORATION_EXPRESSIONS = new Set([
  "手柄", "披发", "猫耳", "王冠", "直播套装", "翅膀", "马尾",
]);

// 点击反馈文字（随机一个，扩充更多类型）
const CLICK_FEEDBACKS = [
  "♥", "呀！", "嗯？", "嘻嘻", "干嘛啦~", "嘿嘿",
  "哼~", "不要戳我！", "在呢~", "喵~", "哼哼", "嘿嘿嘿",
  "干嘛呀", "嗯嗯~", "嘻", "呜...", "嘿嘿💕", "哼！",
  "呀呼~", "诶嘿嘿", "别戳啦~", "在的在的", "嗯哼~", "qvq",
];

// 点击小概率触发的撒娇气泡
const CLICK_BUBBLES = ["嘛~", "在呢~", "嗯哼~", "干嘛戳我~", "嘻嘻", "哼~", "陪陪我嘛~", "嘿嘿~"];

// 情绪 → 气泡短句映射（随机选一句，每种情绪扩充到 8-10 句）
const EMOTION_BUBBLES: Record<string, string[]> = {
  "开心": ["嘻嘻~", "好开心！", "嘿嘿💕", "今天真好~", "开心开心~", "啦啦啦~", "超开心的！", "嘿嘿嘿~", "好心情！", "✨开心~"],
  "生气": ["哼！", "不理你了！", "气死了！", "哼唧~", "讨厌！", "烦死了！", "哼，不想理你", "气呼呼", "再这样真生气了", "💢"],
  "难过": ["呜呜...", "好难过...", "想哭...", "抱抱我...", "心情不好...", "唉...", "好委屈...", "不想说话...", "呜呜呜", "😭"],
  "撒娇": ["嘛~", "抱抱嘛~", "人家想要~", "嗯哼~", "陪陪我嘛~", "不要嘛~", "嘿嘿嘛~", "求求啦~", "哼，哄我~", "🥺"],
  "惊讶": ["诶？！", "哇！", "不会吧？", "吓我一跳！", "真的吗？", "哈？", "诶诶？", "天哪！", "什么？！", "😱"],
  "疑惑": ["嗯？", "什么呀？", "不懂...", "为什么呢？", "咦？", "啊？", "什么意思？", "迷惑...", "🤔", "嗯...？"],
  "害羞": ["讨厌啦~", "人家会害羞的~", "呜...", "不要这样~", "脸红了...", "别盯着我看啦~", "呜呜好害羞", "///", "🙈", "不要啦~"],
  "平静": ["嗯~", "好的~", "在呢~", "嗯嗯~", "好呀~", "哦~", "嗯哼", "好哒~", "收到~", "😊"],
};
// 拖拽触发阈值（像素）
const DRAG_THRESHOLD = 5;
// 缩放倍率上下限
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.0;
// 动作优先级：FORCE = 3，强制重新播放（0=NONE, 1=IDLE, 2=NORMAL, 3=FORCE）
const MOTION_FORCE = 3;

export default function Live2DCanvas({
  modelUrl,
  mood,
  emotion,
  position,
  onPositionChange,
  bubbleText,
  characterId,
  petState,
  onPetStateChange,
  onAIContext,
  onBubble,
  closeSignal,
  visible = true, // 默认显示
}: Live2DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const moodGlowRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null); // 保存 canvas 引用，用于动态控制显示
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
  const [showInteract, setShowInteract] = useState(false); // 互动浮层
  const [activeMainTab, setActiveMainTab] = useState<"interact" | "settings">("interact"); // 主Tab：互动/设置
  const [panelSize, setPanelSize] = useState<{ w: number; h: number }>({ w: 560, h: 640 }); // 面板尺寸（默认最大）
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const [scaleValue, setScaleValue] = useState(1); // 缩放滑块值（与 scaleMulRef 同步）
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null); // 浮层位置（null 表示默认居中）
  const [eyeTracking, setEyeTracking] = useState(true); // 视线跟随鼠标开关
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null); // 对话气泡
  const bubbleRef = useRef<HTMLDivElement>(null);

  // 浮层拖动状态
  const panelDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  // 视线跟随 ref（供 ticker 读取最新值）
  const eyeTrackingRef = useRef(true);
  eyeTrackingRef.current = eyeTracking;

  // 普通表情 / 装饰表情 分类
  const normalExpressions = expressions.filter(
    (e) => !DECORATION_EXPRESSIONS.has(e)
  );
  const decorationExpressions = expressions.filter((e) =>
    DECORATION_EXPRESSIONS.has(e)
  );

  // 复位到默认居中、贴底位置
  const resetPosition = useCallback(() => {
    const model = modelRef.current;
    const app = appRef.current;
    if (!model || !app) return;
    model.scale.set(baseScaleRef.current);
    scaleMulRef.current = 1;
    setScaleValue(1);
    model.x = app.renderer.width / 2 - model.width / 2;
    model.y = app.renderer.height - model.height;
    onPositionChangeRef.current({
      x: model.x,
      y: model.y,
      scale: 1,
    });
  }, []);

  // 应用缩放（保持底部中心点不动）
  const applyScale = useCallback((newMul: number) => {
    const model = modelRef.current;
    if (!model) return;
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newMul));
    if (clamped === scaleMulRef.current) return;
    const cx = model.x + model.width / 2;
    const by = model.y + model.height;
    model.scale.set(baseScaleRef.current * clamped);
    scaleMulRef.current = clamped;
    setScaleValue(clamped);
    model.x = cx - model.width / 2;
    model.y = by - model.height;
    onPositionChangeRef.current({
      x: model.x,
      y: model.y,
      scale: clamped,
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

      // canvas 全屏覆盖，让 Live2D 可以拖到任何位置（包括聊天栏上方）
      const width = window.innerWidth;
      const height = window.innerHeight;

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
      // canvas 添加到 document.body，用 fixed 定位全屏覆盖，pointer-events: none 不拦截事件
      const canvas = app.view as HTMLCanvasElement;
      canvas.style.position = "fixed";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = visible ? "3" : "-999"; // 根据 visible 控制层级
      canvas.style.opacity = visible ? "1" : "0"; // 根据 visible 控制透明度
      canvas.style.transition = "opacity 0.2s ease"; // 添加过渡动画
      document.body.appendChild(canvas);
      canvasRef.current = canvas; // 保存引用，用于后续动态控制

      try {
        const model = await Live2DModel.from(modelUrl);
        if (destroyed || !app) return;

        // 计算基准缩放（基于窗口尺寸，模型默认放在左侧 Live2D 区域）
        const stageWidth = container.clientWidth || window.innerWidth / 2;
        const stageHeight = container.clientHeight || window.innerHeight;
        const baseScale =
          Math.min(
            stageWidth / model.width,
            stageHeight / model.height
          ) * 0.85;
        baseScaleRef.current = baseScale;

        const isDefault =
          position.x === 0 && position.y === 0 && position.scale === 1;

        if (isDefault) {
          model.scale.set(baseScale);
          scaleMulRef.current = 1;
          // 默认放在 Live2D 区域内居中贴底
          model.x = stageWidth / 2 - model.width / 2;
          model.y = stageHeight - model.height;
        } else {
          scaleMulRef.current = position.scale;
          model.scale.set(baseScale * position.scale);
          model.x = position.x;
          model.y = position.y;
        }
        setScaleValue(scaleMulRef.current);

        // 鼠标移动：按住即可拖动（DOM 事件，不依赖 PIXI 事件系统）
        const onMove = (e: MouseEvent) => {
          const d = dragRef.current;
          if (!d) return;
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

        // 鼠标松开：区分拖拽/单击
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
          // 单击 → 80% 显示反馈文字，20% 触发撒娇气泡
          if (Math.random() < 0.2) {
            const bubbleText = CLICK_BUBBLES[Math.floor(Math.random() * CLICK_BUBBLES.length)];
            setBubble({ id: Date.now(), text: bubbleText });
          } else {
            const text = CLICK_FEEDBACKS[Math.floor(Math.random() * CLICK_FEEDBACKS.length)];
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

        // 每帧更新 overlay div 位置（跟随模型）+ 气泡位置 + 视线跟随控制
        app.ticker.add(() => {
          const m = modelRef.current;
          if (!m) return;
          // 更新 overlay div 位置和大小
          if (overlayRef.current) {
            overlayRef.current.style.left = `${m.x}px`;
            overlayRef.current.style.top = `${m.y}px`;
            overlayRef.current.style.width = `${m.width}px`;
            overlayRef.current.style.height = `${m.height}px`;
          }
          // 心情光晕跟随模型（比模型大，在背后）
          if (moodGlowRef.current) {
            moodGlowRef.current.style.left = `${m.x - m.width * 0.25}px`;
            moodGlowRef.current.style.top = `${m.y - m.height * 0.2}px`;
            moodGlowRef.current.style.width = `${m.width * 1.5}px`;
            moodGlowRef.current.style.height = `${m.height * 1.4}px`;
          }
          // 更新气泡位置（模型上方居中）
          if (bubbleRef.current) {
            bubbleRef.current.style.left = `${m.x + m.width / 2}px`;
            bubbleRef.current.style.top = `${m.y - 10}px`;
          }
          // 视线跟随关闭时重置焦点到模型中心
          if (!eyeTrackingRef.current) {
            try {
              m.focus(m.x + m.width / 2, m.y + m.height * 0.4);
            } catch { /* 忽略 */ }
          }
        });

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
      if (app) {
        const canvas = app.view as HTMLCanvasElement;
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        app.destroy(true, { children: true });
        app = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl]);

  // 监听 visible 变化，动态控制 canvas 显示/隐藏（不卸载，保持模型加载状态）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (visible) {
      canvas.style.zIndex = "3";
      canvas.style.opacity = "1";
    } else {
      canvas.style.zIndex = "-999";
      canvas.style.opacity = "0";
    }
  }, [visible]);

  // ESC 关闭互动浮层
  useEffect(() => {
    if (!showInteract) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowInteract(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showInteract]);

  // 外部 closeSignal 递增时强制关闭浮层（例如点设置键时）
  const closeSignalRef = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === undefined) return;
    if (closeSignal !== closeSignalRef.current) {
      closeSignalRef.current = closeSignal;
      if (showInteract) setShowInteract(false);
    }
  }, [closeSignal, showInteract]);

  // 窗口 resize 时更新 PIXI canvas 尺寸
  useEffect(() => {
    const onResize = () => {
      const app = appRef.current;
      if (app) {
        app.renderer.resize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
        model.stopMotions();
        model.motion(motion, undefined, MOTION_FORCE, {
          resetExpression: false,
          onFinish: () => {
            try { model.motion("Idle", 0, 1); } catch { /* 忽略 */ }
          },
        });
        setActiveMotion(motion);
      }
    } catch {
      // 忽略
    }
  }, [emotion, expressions, motionGroups]);

  // emotion 变化时自动生成情绪气泡
  useEffect(() => {
    if (!emotion) return;
    const texts = EMOTION_BUBBLES[emotion];
    if (!texts || texts.length === 0) return;
    const text = texts[Math.floor(Math.random() * texts.length)];
    setBubble({ id: Date.now(), text });
  }, [emotion]);

  // 外部触发的气泡（bubbleText prop 变化时）
  useEffect(() => {
    if (!bubbleText) return;
    setBubble(bubbleText);
  }, [bubbleText]);

  // 气泡自动消失
  useEffect(() => {
    if (!bubble) return;
    const timer = setTimeout(() => setBubble(null), 3000);
    return () => clearTimeout(timer);
  }, [bubble]);

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
      // 先停止当前动作，避免残影
      model.stopMotions();
      model.motion(group, undefined, MOTION_FORCE, {
        resetExpression: false,
        onFinish: () => {
          if (group !== "Idle") {
            try { model.motion("Idle", 0, 1); } catch { /* 忽略 */ }
          }
        },
      });
    } catch {
      // 忽略
    }
    setActiveMotion(group);
  };

  // 切换普通表情
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

  // 切换装饰开关（方案A：互斥。点击已激活的装饰 → 回到心情/情绪默认表情）
  const toggleDecoration = (name: string) => {
    const model = modelRef.current;
    if (!model) return;
    try {
      if (activeExpression === name) {
        // 已激活 → 关闭，回到心情/情绪默认表情
        const candidates = emotion
          ? emotionToExpressions(emotion)
          : moodToExpressions(mood);
        const expr = candidates.find((e) => expressions.includes(e));
        if (expr) {
          model.expression(expr);
          setActiveExpression(expr);
        } else {
          setActiveExpression(null);
        }
      } else {
        // 未激活 → 开启
        model.expression(name);
        setActiveExpression(name);
      }
    } catch {
      // 忽略
    }
  };

  // overlay pointerdown：左键记录拖拽起点，右键不触发拖拽
  const handleOverlayPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return; // 右键不触发拖拽
    const model = modelRef.current;
    if (!model) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startModelX: model.x,
      startModelY: model.y,
      isDragging: false,
    };
  };

  // 右键 overlay：打开互动浮层 + 阻止默认菜单
  const handleOverlayContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowInteract(true);
  };

  // 双击 overlay 已禁用（TapBody 挥手动作有残影 bug，不允许触发）

  // 浮层拖动：鼠标按下 header 开始拖动（相对于视口）
  const handlePanelDragStart = (e: React.MouseEvent) => {
    // 点击关闭按钮或Tab按钮不触发拖动
    if ((e.target as HTMLElement).closest(".interact-close")) return;
    if ((e.target as HTMLElement).closest(".interact-main-tab")) return;
    // 用 closest 查找浮层根节点，更可靠
    const panel = (e.currentTarget as HTMLElement).closest(".interact-panel") as HTMLElement | null;
    if (!panel) return;
    const panelRect = panel.getBoundingClientRect();
    panelDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: panelRect.left,
      origY: panelRect.top,
    };
    // 全局锁定：防止文本选择/光标闪烁干扰拖动
    document.body.style.userSelect = "none";
    document.body.style.cursor = "move";
    e.preventDefault();
  };

  // 缩放手柄：鼠标按下开始缩放
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: panelSize.w,
      startH: panelSize.h,
    };
    // 全局锁定：防止文本选择/光标闪烁干扰缩放
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
  };

  // 浮层拖动 + 缩放：mousemove + mouseup
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // 拖动面板
      const d = panelDragRef.current;
      if (d) {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        setPanelPos({ x: d.origX + dx, y: d.origY + dy });
        return;
      }
      // 缩放面板
      const r = resizeRef.current;
      if (r) {
        const dw = e.clientX - r.startX;
        const dh = e.clientY - r.startY;
        setPanelSize({
          w: Math.max(280, Math.min(560, r.startW + dw)),
          h: Math.max(320, Math.min(640, r.startH + dh)),
        });
      }
    };
    const onUp = () => {
      const wasActive = panelDragRef.current || resizeRef.current;
      panelDragRef.current = null;
      resizeRef.current = null;
      // 恢复 body 样式
      if (wasActive) {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // 打开浮层时重置位置为默认居中
  useEffect(() => {
    if (showInteract) {
      setPanelPos(null);
    }
  }, [showInteract]);

  return (
    <>
      {/* container 只用于占位和加载提示，canvas 已移到 document.body */}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", position: "relative" }}
      >
        {loading && <div className="stage-loading">她正在准备…</div>}
      </div>

      {/* 心情光晕（模型背后，颜色随心情变化） */}
      <div
        ref={moodGlowRef}
        className="live2d-mood-glow"
        style={{
          background: `radial-gradient(circle, ${mood >= 70 ? "oklch(0.65 0.20 10 / 0.22)" : mood >= 40 ? "oklch(0.60 0.12 310 / 0.14)" : "oklch(0.50 0.16 240 / 0.18)"}, transparent 70%)`,
        }}
      />

      {/* overlay div：跟随模型位置/大小，接收鼠标事件（pointer-events: auto） */}
      <div
        ref={overlayRef}
        style={{
          position: "fixed",
          left: "0px",
          top: "0px",
          width: "0px",
          height: "0px",
          pointerEvents: "auto",
          zIndex: 4,
          cursor: "grab",
        }}
        onPointerDown={handleOverlayPointerDown}
        onContextMenu={handleOverlayContextMenu}
      />

      {/* 对话气泡（跟随模型上方，情绪/互动触发） */}
      {bubble && (
        <div
          key={bubble.id}
          ref={bubbleRef}
          className="live2d-bubble"
          style={{
            position: "fixed",
            transform: "translate(-50%, -100%)",
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          {bubble.text}
        </div>
      )}

      {/* 点击反馈文字（跟随模型上方） */}
      {feedback && (
        <div
          key={feedback.id}
          className="click-feedback"
          style={{
            position: "fixed",
            left: modelRef.current ? modelRef.current.x + modelRef.current.width / 2 : "50%",
            top: modelRef.current ? modelRef.current.y - 10 : "40%",
            transform: "translate(-50%, -100%)",
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* 互动浮层（右键触发，可拖动，只有❌或ESC关闭） */}
      {/* 用 Portal 渲染到 body，使面板可跨越 Live2D 区域显示在聊天栏上面 */}
      {showInteract && createPortal(
        <div
          className="interact-panel interact-panel-v2"
          style={{
            width: panelSize.w,
            height: panelSize.h,
            ...(panelPos ? { left: panelPos.x, top: panelPos.y, transform: "none" } : {}),
          }}
        >
            {/* 头部：双Tab切换 + 关闭按钮（可拖动） */}
            <div className="interact-header" onMouseDown={handlePanelDragStart}>
              <div className="interact-main-tabs">
                <button
                  className={`interact-main-tab${activeMainTab === "interact" ? " active" : ""}`}
                  onClick={() => setActiveMainTab("interact")}
                >
                  💞 互动
                </button>
                <button
                  className={`interact-main-tab${activeMainTab === "settings" ? " active" : ""}`}
                  onClick={() => setActiveMainTab("settings")}
                >
                  ⚙️ 设置
                </button>
              </div>
              <button
                className="interact-close"
                onClick={() => setShowInteract(false)}
                title="关闭 (ESC)"
              >
                ✕
              </button>
            </div>

            {/* 互动栏：状态/商店/约会/游戏/成就/日记 */}
            {activeMainTab === "interact" && (
              <InteractPanel
                characterId={characterId}
                petState={petState}
                mood={mood}
                onPetStateChange={onPetStateChange}
                onAIContext={onAIContext}
                onBubble={onBubble}
              />
            )}

            {/* 设置栏：表情/装饰/动作/缩放/视线跟随 */}
            {activeMainTab === "settings" && (
              <div className="interact-settings">
                {/* 表情区 */}
                {normalExpressions.length > 0 && (
                  <div className="interact-section">
                    <div className="interact-section-title">表情</div>
                    <div className="interact-btn-grid">
                      {normalExpressions.map((name) => (
                        <button
                          key={name}
                          className={`interact-btn${
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

                {/* 装饰开关区（与表情区分开，蓝色主题） */}
                {decorationExpressions.length > 0 && (
                  <div className="interact-section">
                    <div className="interact-section-title">装饰开关</div>
                    <div className="interact-btn-grid">
                      {decorationExpressions.map((name) => (
                        <button
                          key={name}
                          className={`interact-toggle${
                            activeExpression === name ? " active" : ""
                          }`}
                          onClick={() => toggleDecoration(name)}
                          title={`装饰: ${name}（点击开/关）`}
                        >
                          {activeExpression === name ? "● " : "○ "}
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 动作区 */}
                {motionGroups.length > 0 && (
                  <div className="interact-section">
                    <div className="interact-section-title">动作</div>
                    <div className="interact-btn-grid">
                      {motionGroups.filter((g) => g !== "TapBody").map((group) => (
                        <button
                          key={group}
                          className={`interact-btn${
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

                {/* 缩放区 */}
                <div className="interact-section">
                  <div className="interact-section-title">
                    缩放 {Math.round(scaleValue * 100)}%
                  </div>
                  <div className="interact-scale">
                    <button
                      className="interact-scale-btn"
                      onClick={() => applyScale(scaleMulRef.current - 0.1)}
                      title="缩小"
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min={MIN_SCALE}
                      max={MAX_SCALE}
                      step={0.05}
                      value={scaleValue}
                      onChange={(e) => applyScale(parseFloat(e.target.value))}
                      className="interact-slider"
                    />
                    <button
                      className="interact-scale-btn"
                      onClick={() => applyScale(scaleMulRef.current + 0.1)}
                      title="放大"
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="interact-reset"
                    onClick={resetPosition}
                    title="复位位置与缩放"
                  >
                    ⟲ 复位
                  </button>
                </div>

                {/* 视线跟随开关 */}
                <div className="interact-section">
                  <div className="interact-toggle-row">
                    <span className="interact-section-title">视线跟随鼠标</span>
                    <button
                      className={`interact-switch${eyeTracking ? " on" : ""}`}
                      onClick={() => setEyeTracking((v) => !v)}
                      title={eyeTracking ? "点击关闭视线跟随" : "点击开启视线跟随"}
                    >
                      <span className="interact-switch-knob" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 右下角缩放手柄 */}
            <div className="interact-resize-handle" onMouseDown={handleResizeStart} title="拖动调整大小" />
        </div>,
        document.body
      )}
    </>
  );
}
