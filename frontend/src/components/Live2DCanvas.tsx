import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "@sekai-world/pixi-live2d-display-mulmotion/cubism4";

interface Live2DCanvasProps {
  modelUrl: string;
  mood: number; // 0-100 心情值
}

// 心情值 → 表情名映射（Haru 模型有 F01-F08 表情）
function moodToExpression(mood: number): string {
  if (mood >= 90) return "F01"; // 非常开心
  if (mood >= 70) return "F02"; // 开心
  if (mood >= 50) return "F03"; // 平静
  if (mood >= 30) return "F04"; // 有点不开心
  return "F05"; // 很难过
}

// 点击反馈文字（随机一个）
const CLICK_FEEDBACKS = ["♥", "呀！", "嗯？", "嘻嘻", "干嘛啦~", "嘿嘿"];

export default function Live2DCanvas({ modelUrl, mood }: Live2DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ id: number; text: string } | null>(
    null
  );

  // 加载 Live2D 模型
  useEffect(() => {
    let app: PIXI.Application | null = null;
    let destroyed = false;

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
      if (destroyed) {
        app.destroy(true, { children: true });
        return;
      }
      container.appendChild(app.view as HTMLCanvasElement);

      try {
        const model = await Live2DModel.from(modelUrl);
        if (destroyed || !app) return;

        // 按画布大小缩放并居中、贴底显示
        const scale =
          Math.min(
            app.renderer.width / model.width,
            app.renderer.height / model.height
          ) * 0.85;
        model.scale.set(scale);
        model.x = app.renderer.width / 2 - model.width / 2;
        model.y = app.renderer.height - model.height;

        // 启用交互：点击模型触发动作
        model.interactive = true;
        model.buttonMode = true;
        model.on("hit", () => {
          try {
            model.motion("TapBody");
          } catch {
            // 某些模型可能没有 TapBody 组，忽略错误
          }
          // 显示点击反馈文字
          const text =
            CLICK_FEEDBACKS[Math.floor(Math.random() * CLICK_FEEDBACKS.length)];
          setFeedback({ id: Date.now(), text });
        });

        app.stage.addChild(model);
        modelRef.current = model;
        setLoading(false);

        // 初始表情
        try {
          model.expression(moodToExpression(mood));
        } catch {}
      } catch (e) {
        console.error("[Live2D] 模型加载失败:", e);
        setLoading(false);
      }
    };

    init();

    return () => {
      destroyed = true;
      modelRef.current = null;
      app?.destroy(true, { children: true });
      app = null;
    };
  }, [modelUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // 心情变化时切换表情
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    try {
      model.expression(moodToExpression(mood));
    } catch {
      // 表情切换失败时静默忽略
    }
  }, [mood]);

  // 点击反馈文字自动消失
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 1500);
    return () => clearTimeout(timer);
  }, [feedback]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {loading && <div className="stage-loading">立绘加载中…</div>}
      {feedback && (
        <div
          key={feedback.id}
          className="click-feedback"
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
