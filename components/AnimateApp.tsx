"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createEngine } from "@/lib/engine";
import "@/app/animate/animate.css";

const MOTIONS = ["idle", "thinking", "wave_hello", "happy", "special"] as const;

export default function AnimateApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Awaited<ReturnType<typeof createEngine>> | null>(null);
  const [missing, setMissing] = useState("");
  const [motion, setMotion] = useState("—");
  const [frame, setFrame] = useState("—");
  const [active, setActive] = useState("thinking");
  const [availability, setAvailability] = useState<Record<string, { ok: boolean; missing?: string[] }>>({});

  useEffect(() => {
    let cancelled = false;
    let raf = 0;

    async function boot() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const manifest = await fetch("/mascot/manifest.json").then((r) => r.json());
      if (cancelled) return;
      const engine = await createEngine(canvas, manifest);
      if (cancelled) return;
      engineRef.current = engine;
      const clips = engine.availableClips();
      setAvailability(clips);
      const snap0 = engine.snapshot();
      setMissing(
        snap0.missing.length
          ? `Thiếu: ${snap0.missing.slice(0, 6).join(", ")}${snap0.missing.length > 6 ? "…" : ""}`
          : "Đủ sprite đã khai báo",
      );
      setActive(manifest.defaultClip || "thinking");

      const tick = () => {
        const snap = engine.snapshot();
        setMotion(snap.clip);
        setFrame(snap.frameCount ? `${snap.frameIndex + 1} / ${snap.frameCount}` : "—");
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    void boot();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="page">
      <header>
        <p className="eyebrow">Scope 2 · Animation</p>
        <h1>Sprite stage</h1>
        <nav>
          <Link href="/converse">← Conversation</Link> · <Link href="/">Foyer</Link>
        </nav>
      </header>

      <section className="stage" aria-label="Sân khấu">
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

      <div id="clips">
        {MOTIONS.map((name) => {
          const info = availability[name];
          const disabled = info ? !info.ok : true;
          return (
            <button
              key={name}
              type="button"
              disabled={disabled}
              title={info?.missing?.join(", ") || undefined}
              aria-pressed={active === name}
              onClick={() => {
                engineRef.current?.setClip(name);
                setActive(name);
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
      <p className="hint">
        Sheet thiếu → nút tắt. Ingest: <code>npm run ingest -- path/to/sheet.png --tag idle</code>
      </p>
    </div>
  );
}
