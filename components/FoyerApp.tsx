"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createEngine } from "@/lib/engine";
import { createLiveClient } from "@/lib/liveClient";
import "@/app/foyer.css";

const STATE_LABEL: Record<string, string> = {
  idle: "Tắt",
  connecting: "Đang nối…",
  listening: "Đang nghe",
  speaking: "Đang nói",
  error: "Lỗi",
};

type Bubble = { role: "user" | "model"; text: string };

export default function FoyerApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Awaited<ReturnType<typeof createEngine>> | null>(null);
  const manifestRef = useRef<any>(null);
  const clientRef = useRef<ReturnType<typeof createLiveClient> | null>(null);
  const draftRef = useRef<{ user?: string; model?: string }>({});

  const [liveState, setLiveState] = useState("idle");
  const [motion, setMotion] = useState("—");
  const [frame, setFrame] = useState("—");
  const [missing, setMissing] = useState("");
  const [notice, setNotice] = useState("");
  const [latency, setLatency] = useState("Chưa có lượt. Cần GEMINI_API_KEY.");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;

    async function boot() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const manifest = await fetch("/mascot/manifest.json").then((r) => r.json());
      if (cancelled) return;
      manifestRef.current = manifest;
      const engine = await createEngine(canvas, manifest);
      if (cancelled) return;
      engineRef.current = engine;
      const snap0 = engine.snapshot();
      setMissing(snap0.missing.length ? `Thiếu sprite: ${snap0.missing.length}` : "Đủ sprite");

      const setClipForLiveState = (state: string) => {
        const m = manifestRef.current;
        const eng = engineRef.current;
        if (!m || !eng) return;
        if (state === "speaking") eng.setClip(m.clips.happy ? "happy" : m.defaultClip || "thinking");
        else if (state === "listening" || state === "connecting")
          eng.setClip(m.clips.thinking ? "thinking" : m.defaultClip || "idle");
        else eng.setClip(m.clips.idle ? "idle" : m.defaultClip || "thinking");
      };

      clientRef.current = createLiveClient({
        state(next) {
          setLiveState(next);
          setClipForLiveState(next);
        },
        ready(info) {
          setNotice(`Live sẵn sàng · ${info.model || ""}`);
        },
        transcript({ role, text }) {
          if (!text?.trim()) return;
          draftRef.current[role] = text;
          setBubbles((prev) => {
            const next = [...prev];
            const idx = [...next].reverse().findIndex((b) => b.role === role);
            if (idx === -1) next.push({ role, text });
            else next[next.length - 1 - idx] = { role, text };
            return next;
          });
        },
        audioEnd() {
          draftRef.current = {};
        },
        interrupted() {
          setNotice("Đã ngắt (barge-in)");
        },
        latency(info) {
          setLatency(`audio_start ${info.audio_start_ms ?? "—"} ms · total ${info.total_ms} ms`);
          void fetch("/api/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...info, at: new Date().toISOString(), source: "foyer" }),
          });
        },
        error(message) {
          setNotice(message);
        },
      });

      const tick = () => {
        const snap = engine.snapshot();
        setMotion(snap.clip);
        setFrame(snap.frameCount ? `${snap.frameIndex + 1}/${snap.frameCount}` : "—");
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    void boot();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clientRef.current?.stop();
    };
  }, []);

  async function onStart() {
    setNotice("");
    try {
      const health = await fetch("/api/health").then((r) => r.json());
      if (!health.geminiKey) {
        setNotice("Thiếu GEMINI_API_KEY trong .env — restart sau khi thêm.");
        return;
      }
      await clientRef.current?.start();
    } catch (err: any) {
      setNotice(err.message || String(err));
    }
  }

  function onStop() {
    clientRef.current?.stop();
    setNotice("Đã dừng.");
  }

  return (
    <div className="page" data-state={liveState}>
      <header>
        <p className="eyebrow">Foyer · Next.js</p>
        <h1>Thỏ bảy màu</h1>
        <p id="state">{STATE_LABEL[liveState] || liveState}</p>
        <nav>
          <Link href="/converse">Converse</Link>
          <Link href="/animate">Animate</Link>
        </nav>
      </header>

      <section className="stage" aria-label="Sân khấu mascot">
        <canvas id="stage" ref={canvasRef} />
        <div id="missing">{missing}</div>
        <dl id="meters">
          <div>
            <dt>Motion</dt>
            <dd>{motion}</dd>
          </div>
          <div>
            <dt>Frame</dt>
            <dd>{frame}</dd>
          </div>
        </dl>
      </section>

      <div id="transcript" aria-live="polite">
        {bubbles.map((b, i) => (
          <div key={`${b.role}-${i}`} className={`bubble ${b.role}`}>
            <span className="role">{b.role === "user" ? "Bạn" : "Thỏ"}</span>
            <span className="body">{b.text}</span>
          </div>
        ))}
      </div>

      <div className="controls">
        <button id="start" type="button" disabled={liveState !== "idle" && liveState !== "error"} onClick={onStart}>
          Bắt đầu nói
        </button>
        <button id="stop" type="button" className="secondary" disabled={liveState === "idle"} onClick={onStop}>
          Dừng
        </button>
      </div>
      <p id="notice">{notice}</p>

      <aside id="latency">
        <h2>Độ trễ</h2>
        <div id="log">{latency}</div>
      </aside>
    </div>
  );
}
