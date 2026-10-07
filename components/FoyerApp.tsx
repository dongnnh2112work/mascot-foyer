"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createEngine } from "@/lib/engine";
import { createLiveClient } from "@/lib/liveClient";
import "@/app/foyer.css";

const STATE_LABEL: Record<string, string> = {
  idle: "Tắt",
  connecting: "Đang nối…",
  listening: "Sẵn sàng",
  hearing: "Đang ghi âm",
  thinking: "Đang chờ trả lời",
  speaking: "Thỏ đang nói",
  error: "Lỗi",
};

type Bubble = { role: "user" | "model"; text: string };

export default function FoyerApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Awaited<ReturnType<typeof createEngine>> | null>(null);
  const manifestRef = useRef<any>(null);
  const clientRef = useRef<ReturnType<typeof createLiveClient> | null>(null);
  const draftRef = useRef<{ user?: string; model?: string }>({});
  const holdingRef = useRef(false);

  const [liveState, setLiveState] = useState("idle");
  const [hint, setHint] = useState("Bấm Mở phiên, rồi giữ nút để nói.");
  const [holding, setHolding] = useState(false);
  const [level, setLevel] = useState(0);
  const [motion, setMotion] = useState("—");
  const [frame, setFrame] = useState("—");
  const [missing, setMissing] = useState("");
  const [notice, setNotice] = useState("");
  const [latency, setLatency] = useState("Chưa có lượt nào.");
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
        else if (state === "hearing" || state === "thinking" || state === "listening" || state === "connecting")
          eng.setClip(m.clips.thinking ? "thinking" : m.defaultClip || "idle");
        else eng.setClip(m.clips.idle ? "idle" : m.defaultClip || "thinking");
      };

      clientRef.current = createLiveClient({
        state(next: string) {
          setLiveState(next);
          setClipForLiveState(next);
        },
        status({ hint: nextHint, pttHeld }: { hint: string; pttHeld: boolean }) {
          setHint(nextHint);
          setHolding(pttHeld);
        },
        level: setLevel,
        ready(info: { model?: string }) {
          setNotice(`Live sẵn sàng · ${info.model || ""} — giữ nút để nói`);
        },
        transcript({ role, text }: { role: "user" | "model"; text: string }) {
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
          setNotice("Đã ngắt trả lời — phiên vẫn mở.");
        },
        latency(info: { audio_start_ms?: number | null; total_ms: number }) {
          setLatency(`audio_start ${info.audio_start_ms ?? "—"} ms · total ${info.total_ms} ms`);
          void fetch("/api/log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...info, at: new Date().toISOString(), source: "foyer" }),
          });
        },
        error(message: string) {
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

  function onPttDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (!sessionOpen || holdingRef.current) return;
    holdingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    clientRef.current?.beginTalk();
    setHolding(true);
  }

  function onPttUp(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (!holdingRef.current) return;
    holdingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    clientRef.current?.endTalk();
    setHolding(false);
  }

  const sessionOpen = liveState !== "idle" && liveState !== "error";
  const meterPct = Math.min(100, Math.round(level * 400));

  return (
    <div className="page" data-state={liveState} data-holding={holding ? "1" : "0"}>
      <header>
        <p className="eyebrow">Foyer · Next.js</p>
        <h1>Thỏ bảy màu</h1>
        <p id="state">{STATE_LABEL[liveState] || liveState}</p>
        <nav>
          <Link href="/converse">Converse</Link>
          <Link href="/animate">Animate</Link>
        </nav>
      </header>

      <p className="hint">{hint}</p>
      <div className="meter" aria-hidden="true">
        <div className="meter-fill" style={{ width: `${meterPct}%` }} />
      </div>

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
        {bubbles.length === 0 && sessionOpen ? (
          <p className="empty">Giữ nút bên dưới để hỏi — thả tay khi nói xong.</p>
        ) : null}
        {bubbles.map((b, i) => (
          <div key={`${b.role}-${i}`} className={`bubble ${b.role}`}>
            <span className="role">{b.role === "user" ? "Bạn" : "Thỏ"}</span>
            <span className="body">{b.text}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={`ptt ${holding ? "is-holding" : ""}`}
        disabled={!sessionOpen}
        onPointerDown={onPttDown}
        onPointerUp={onPttUp}
        onPointerCancel={onPttUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {holding ? "Đang ghi… thả để gửi" : "Giữ để nói"}
      </button>

      <div className="controls">
        <button id="start" type="button" disabled={sessionOpen} onClick={onStart}>
          Mở phiên
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!sessionOpen}
          onClick={() => clientRef.current?.interrupt()}
        >
          Ngắt trả lời
        </button>
        <button
          id="stop"
          type="button"
          className="secondary"
          disabled={liveState === "idle"}
          onClick={() => {
            holdingRef.current = false;
            clientRef.current?.stop();
            setNotice("Đã kết thúc phiên.");
            setHolding(false);
            setLevel(0);
          }}
        >
          Kết thúc phiên
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
