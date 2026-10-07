import { WebSocketServer, WebSocket } from "ws";

const GEMINI_WS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

const DEFAULT_MODEL = process.env.GEMINI_LIVE_MODEL || "models/gemini-2.5-flash-native-audio-latest";

const SYSTEM_INSTRUCTION = `Bạn là Thỏ bảy màu. Trả lời tiếng Việt, tối đa 1–2 câu ngắn, nói ngay không dài dòng. Không markdown.`;

const ENABLE_TRANSCRIPTION = process.env.GEMINI_LIVE_TRANSCRIPTION !== "0";

/**
 * Attach Gemini Live WebSocket proxy at /ws/live on an existing http.Server.
 * Browser <-> this proxy <-> Gemini (API key stays on server).
 */
export function attachLiveProxy(server) {
  const wss = new WebSocketServer({ server, path: "/ws/live" });

  wss.on("connection", (client) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      client.send(JSON.stringify({ type: "error", message: "Thiếu GEMINI_API_KEY trên server. Thêm vào .env rồi restart." }));
      client.close(1011, "missing api key");
      return;
    }

    const upstream = new WebSocket(`${GEMINI_WS}?key=${encodeURIComponent(apiKey)}`);
    let setupDone = false;
    let closed = false;
    /** @type {string[]} */
    const pending = [];

    const closeBoth = (code = 1000, reason = "done") => {
      if (closed) return;
      closed = true;
      try {
        if (client.readyState === WebSocket.OPEN) client.close(code, reason);
      } catch {
        /* ignore */
      }
      try {
        if (upstream.readyState === WebSocket.OPEN) upstream.close();
      } catch {
        /* ignore */
      }
    };

    const flushPending = () => {
      while (pending.length && upstream.readyState === WebSocket.OPEN) {
        upstream.send(pending.shift());
      }
    };

    upstream.on("open", () => {
      const setup = {
        setup: {
          model: DEFAULT_MODEL,
          generationConfig: {
            responseModalities: ["AUDIO"],
            // Prefer snappy spoken replies.
            temperature: 0.7,
            maxOutputTokens: 256,
          },
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          // Hybrid VAD: server detects start; client PTT release sends audioStreamEnd
          // to skip waiting for server silenceDurationMs.
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false,
              startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
              endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
              silenceDurationMs: 500,
              prefixPaddingMs: 20,
            },
          },
          ...(ENABLE_TRANSCRIPTION
            ? {
                inputAudioTranscription: {},
                outputAudioTranscription: {},
              }
            : {}),
        },
      };
      upstream.send(JSON.stringify(setup));
      process.stdout.write(
        `[live] setup sent model=${DEFAULT_MODEL} transcription=${ENABLE_TRANSCRIPTION ? "on" : "off"}\n`,
      );
    });

    upstream.on("message", (data, isBinary) => {
      if (client.readyState !== WebSocket.OPEN) return;

      // `ws` often delivers JSON frames as Buffer with isBinary=true — still parse as text.
      const asString = typeof data === "string" ? data : data.toString();
      let parsed = null;
      try {
        parsed = JSON.parse(asString);
      } catch {
        /* binary media or non-JSON */
      }

      if (parsed) {
        if (parsed.setupComplete && !setupDone) {
          setupDone = true;
          client.send(JSON.stringify({ type: "ready", model: DEFAULT_MODEL }));
          process.stdout.write("[live] setupComplete → ready\n");
          flushPending();
        } else if (parsed.serverContent) {
          const c = parsed.serverContent;
          const flags = [
            c.inputTranscription?.text && "inTx",
            c.interimInputTranscription?.text && "interim",
            c.outputTranscription?.text && "outTx",
            c.modelTurn?.parts?.some((p) => p.inlineData) && "audio",
            c.turnComplete && "turnDone",
            c.waitingForInput && "waitInput",
            c.interrupted && "interrupted",
          ]
            .filter(Boolean)
            .join(",");
          if (flags) process.stdout.write(`[live] ← ${flags}\n`);
        }
        client.send(asString);
        return;
      }

      // Non-JSON (true binary) — forward as-is.
      client.send(data, { binary: !!isBinary });
    });

    upstream.on("error", (err) => {
      process.stdout.write(`[live] upstream error: ${err.message}\n`);
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "error", message: err.message || "upstream error" }));
      }
      closeBoth(1011, "upstream error");
    });

    upstream.on("close", (code, reason) => {
      process.stdout.write(`[live] upstream close ${code} ${reason}\n`);
      closeBoth(1000, "upstream closed");
    });

    client.on("message", (data, isBinary) => {
      if (isBinary) {
        if (upstream.readyState === WebSocket.OPEN && setupDone) upstream.send(data);
        return;
      }
      const text = data.toString();
      try {
        const parsed = JSON.parse(text);
        if (parsed.type === "ping") {
          client.send(JSON.stringify({ type: "pong" }));
          return;
        }
      } catch {
        /* forward */
      }
      if (!setupDone || upstream.readyState !== WebSocket.OPEN) {
        pending.push(text);
        return;
      }
      upstream.send(text);
    });

    client.on("close", () => closeBoth());
    client.on("error", () => closeBoth(1011, "client error"));
  });

  return wss;
}
