import { useEffect, useRef } from "react";

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  length: number;
}

// 流星画布：深色模式下偶尔有流星划过星空，轻量 Canvas 实现
export default function MeteorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 无障碍：减少动效偏好下不启动
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);

    const meteors: Meteor[] = [];
    let rafId = 0;
    let nextMeteorAt = Date.now() + 3000 + Math.random() * 4000;
    let active = false;

    const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";

    const spawn = () => {
      // 从右上方出发，朝左下方划
      const startX = width * (0.35 + Math.random() * 0.65);
      const startY = -30;
      const angle = Math.PI * (0.68 + Math.random() * 0.14); // ~122°-148°，cos负 sin正
      const speed = 9 + Math.random() * 5;
      meteors.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed, // 负值，向左
        vy: Math.sin(angle) * speed, // 正值，向下
        life: 0,
        maxLife: 55 + Math.random() * 25,
        length: 100 + Math.random() * 70,
      });
    };

    const loop = () => {
      if (!active) return;
      ctx.clearRect(0, 0, width, height);

      const now = Date.now();
      if (now >= nextMeteorAt && meteors.length < 2) {
        spawn();
        nextMeteorAt = now + 5000 + Math.random() * 8000; // 5-13秒一颗
      }

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx;
        m.y += m.vy;
        m.life++;

        const p = m.life / m.maxLife;
        if (p >= 1 || m.y > height + 80 || m.x < -80) {
          meteors.splice(i, 1);
          continue;
        }

        const sp = Math.hypot(m.vx, m.vy);
        const tx = m.x - (m.vx / sp) * m.length;
        const ty = m.y - (m.vy / sp) * m.length;
        // 入场 fade-in + 出场 fade-out
        const a = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;

        const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
        grad.addColorStop(0, `rgba(255,255,255,${0.85 * a})`);
        grad.addColorStop(0.3, `rgba(210,225,255,${0.45 * a})`);
        grad.addColorStop(1, "rgba(210,225,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // 头部亮点
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(loop);
    };

    const start = () => {
      if (!active) {
        active = true;
        rafId = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      active = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      ctx.clearRect(0, 0, width, height);
      meteors.length = 0;
    };

    if (isDark()) start();

    // 监听主题切换：深色启动，浅色停止
    const obs = new MutationObserver(() => {
      if (isDark()) start();
      else stop();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      obs.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="meteor-canvas" aria-hidden />;
}
