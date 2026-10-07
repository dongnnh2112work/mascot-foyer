"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createLiveClient } from "@/lib/liveClient";
import "@/app/converse/converse.css";

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

export default function ConverseApp() {
  const clientRef = useRef<ReturnType<typeof createLiveClient> | null>(null);
  const draftRef = useRef<{ user?: string; model?: string }>({});
  const holdingRef = useRef(false);
  const [liveState, setLiveState] = useState("idle");
  const [hint, setHint] = useState("Bấm “Mở phiên”, rồi giữ nút để nói.");
  const [holding, setHolding] = useState(false);
  const [level, setLevel] = useState(0);
  const [notice, setNotice] = useState("");
  const [latency, setLatency] = useState("Chưa có lượt nào.");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    clientRef.current = createLiveClient({
      state: setLiveState,
      status({ hint: nextHint, pttHeld }: { hint: string; pttHeld: boolean }) {
        setHint(nextHint);
        setHolding(pttHeld);
      },
      level: setLevel,
      ready(info: { model?: string }) {
        setNotice(`Sẵn sàng · ${info.model || "Live"} — giữ nút để nói`);
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
          body: JSON.stringify({ ...info, at: new Date().toISOString(), source: "live" }),
        });
      },
      error(message: string) {
        setNotice(message);
      },
    });
    return () => clientRef.current?.stop();
  }, []);

  async function onStart() {
    setNotice("");
    try {
      const health = await fetch("/api/health").then((r) => r.json());
      if (!health.geminiKey) {
        setNotice("Server chưa có GEMINI_API_KEY. Thêm vào .env rồi restart.");
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
        <p className="eyebrow">Scope 1 · Conversation</p>
        <h1>Gemini Live</h1>
        <p id="state">{STATE_LABEL[liveState] || liveState}</p>
        <nav>
          <Link href="/animate">Animation →</Link> · <Link href="/">Foyer</Link>
        </nav>
      </header>

      <p className="hint" id="hint">
        {hint}
      </p>
      <div className="meter" aria-hidden="true">
        <div className="meter-fill" style={{ width: `${meterPct}%` }} />
      </div>

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

      <form
        className="text-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!sessionOpen || !draft.trim()) return;
          try {
            clientRef.current?.sendText(draft);
            setDraft("");
            setNotice("Đã gửi text → Gemini.");
          } catch (err: any) {
            setNotice(err.message || String(err));
          }
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Hoặc gõ: Xin chào"
          disabled={!sessionOpen}
        />
        <button type="submit" disabled={!sessionOpen || !draft.trim()}>
          Gửi text
        </button>
      </form>

      <div className="controls">
        <button type="button" disabled={sessionOpen} onClick={onStart}>
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
