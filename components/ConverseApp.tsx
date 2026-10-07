"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createLiveClient } from "@/lib/liveClient";
import "@/app/converse/converse.css";

const STATE_LABEL: Record<string, string> = {
  idle: "Tắt",
  connecting: "Đang nối…",
  listening: "Đang nghe",
  speaking: "Đang nói",
  error: "Lỗi",
};

type Bubble = { role: "user" | "model"; text: string };

export default function ConverseApp() {
  const clientRef = useRef<ReturnType<typeof createLiveClient> | null>(null);
  const draftRef = useRef<{ user?: string; model?: string }>({});
  const [liveState, setLiveState] = useState("idle");
  const [notice, setNotice] = useState("");
  const [latency, setLatency] = useState("Chưa có lượt nào. Cần GEMINI_API_KEY trong .env");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    clientRef.current = createLiveClient({
      state: setLiveState,
      ready(info) {
        setNotice(`Sẵn sàng · ${info.model || "Live"}`);
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
          body: JSON.stringify({ ...info, at: new Date().toISOString(), source: "live" }),
        });
      },
      error(message) {
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

  return (
    <div className="page" data-state={liveState}>
      <header>
        <p className="eyebrow">Scope 1 · Conversation</p>
        <h1>Gemini Live</h1>
        <p id="state">{STATE_LABEL[liveState] || liveState}</p>
        <nav>
          <Link href="/animate">Animation →</Link> · <Link href="/">Foyer</Link>
        </nav>
      </header>

      <div id="transcript" aria-live="polite">
        {bubbles.map((b, i) => (
          <div key={`${b.role}-${i}`} className={`bubble ${b.role}`}>
            <span className="role">{b.role === "user" ? "Bạn" : "Thỏ"}</span>
            <span className="body">{b.text}</span>
          </div>
        ))}
      </div>

      <div className="controls">
        <button type="button" disabled={liveState !== "idle" && liveState !== "error"} onClick={onStart}>
          Bắt đầu nói
        </button>
        <button
          type="button"
          className="secondary"
          disabled={liveState === "idle"}
          onClick={() => {
            clientRef.current?.stop();
            setNotice("Đã dừng phiên.");
          }}
        >
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
