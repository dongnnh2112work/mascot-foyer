import { WebSocketServer, WebSocket } from "ws";

const GEMINI_WS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

const DEFAULT_MODEL = process.env.GEMINI_LIVE_MODEL || "models/gemini-2.5-flash-native-audio-latest";

const SYSTEM_INSTRUCTION = `Bạn là Thỏ bảy màu, mascot thân thiện tại sảnh sự kiện.
Trả lời bằng tiếng Việt, ngắn gọn (1–3 câu), ấm áp, dễ nghe trên loa.
Không dùng markdown. Nếu không chắc, nói thật và hỏi lại ngắn.`;

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

    upstream.on("open", () => {
      const setup = {
        setup: {
          model: DEFAULT_MODEL,
          generationConfig: {
            responseModalities: ["AUDIO"],
          },
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };
      upstream.send(JSON.stringify(setup));
    });

    upstream.on("message", (data, isBinary) => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (isBinary) {
        client.send(data);
        return;
      }
      const text = data.toString();
      try {
        const msg = JSON.parse(text);
        if (msg.setupComplete && !setupDone) {
          setupDone = true;
          client.send(JSON.stringify({ type: "ready", model: DEFAULT_MODEL }));
        }
      } catch {
        /* forward raw */
      }
      client.send(text);
    });

    upstream.on("error", (err) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "error", message: err.message || "upstream error" }));
      }
      closeBoth(1011, "upstream error");
    });

    upstream.on("close", () => closeBoth(1000, "upstream closed"));

    client.on("message", (data, isBinary) => {
      if (upstream.readyState !== WebSocket.OPEN) return;
      if (isBinary) {
        upstream.send(data);
        return;
      }
      // Client may send control {type:'ping'} — ignore non-Gemini envelopes
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
      upstream.send(text);
    });

    client.on("close", () => closeBoth());
    client.on("error", () => closeBoth(1011, "client error"));
  });

  return wss;
}
