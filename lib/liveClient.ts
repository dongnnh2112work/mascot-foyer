const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

function floatTo16BitPCM(float32: Float32Array) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function downsample(float32: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return float32;
  const ratio = fromRate / toRate;
  const newLen = Math.floor(float32.length / ratio);
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const idx = Math.floor(i * ratio);
    result[i] = float32[idx];
  }
  return result;
}

function pcm16ToBase64(int16: Int16Array) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToInt16(b64: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function rms(float32: Float32Array) {
  let sum = 0;
  for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
  return Math.sqrt(sum / Math.max(1, float32.length));
}

export function createLiveClient(handlers: Record<string, any> = {}) {
  let ws: WebSocket | null = null;
  let mediaStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let playContext: AudioContext | null = null;
  let nextPlayTime = 0;
  let active = false;
  let ready = false;
  let pttHeld = false;
  let state = "idle";
  let turnStartedAt = 0;
  let firstAudioAt = 0;
  let levelEmitAt = 0;
  let resolveReady: (() => void) | null = null;

  const emit = (name: string, payload?: any) => {
    handlers[name]?.(payload);
  };

  function setState(next: string) {
    if (state === next) return;
    state = next;
    emit("state", next);
    emitStatus();
  }

  function emitStatus(extraHint?: string) {
    const hints: Record<string, string> = {
      idle: "Chưa bắt đầu phiên.",
      connecting: "Đang kết nối Gemini Live…",
      listening: "Giữ nút “Giữ để nói”, nói xong thì thả tay.",
      hearing: "Đang ghi âm — thả nút khi nói xong.",
      thinking: "Đã thả nút — đang chờ Thỏ trả lời…",
      speaking: "Thỏ đang nói — có thể giữ nút để nói đè.",
      error: "Có lỗi — thử bắt đầu lại.",
    };
    emit("status", {
      state,
      pttHeld,
      hint: extraHint || hints[state] || state,
    });
  }

  function sendJson(obj: unknown) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  }

  function stopPlaybackQueue() {
    if (playContext) {
      playContext.close().catch(() => {});
      playContext = null;
    }
    nextPlayTime = 0;
  }

  function ensurePlayContext() {
    if (!playContext) {
      playContext = new AudioContext({ sampleRate: OUTPUT_RATE });
      nextPlayTime = playContext.currentTime;
    }
    return playContext;
  }

  function playPcmChunk(int16: Int16Array) {
    const ctx = ensurePlayContext();
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
    const buffer = ctx.createBuffer(1, float32.length, OUTPUT_RATE);
    buffer.copyToChannel(float32, 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    // Keep playout lead tiny so first audio starts ASAP.
    const startAt = Math.max(ctx.currentTime + 0.005, nextPlayTime);
    node.start(startAt);
    nextPlayTime = startAt + buffer.duration;
    if (!firstAudioAt) {
      firstAudioAt = performance.now();
      emit("audioStart", { latencyMs: Math.round(firstAudioAt - turnStartedAt) });
      setState("speaking");
    }
  }

  function handleServerMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "ready" || msg.setupComplete) {
      ready = true;
      if (msg.type === "ready") emit("ready", msg);
      else emit("ready", { model: "Live" });
      resolveReady?.();
      resolveReady = null;
      setState("listening");
      return;
    }
    if (msg.type === "error") {
      emit("error", msg.message || "error");
      setState("error");
      return;
    }

    const content = msg.serverContent;
    if (!content) return;

    if (content.interrupted) {
      stopPlaybackQueue();
      firstAudioAt = 0;
      emit("interrupted");
      if (!pttHeld) setState("listening");
    }

    const interim =
      content.interimInputTranscription?.text || content.interimInputTranscription?.transcript || "";
    const inputText =
      content.inputTranscription?.text || content.inputTranscription?.transcript || interim;
    if (inputText) {
      emit("transcript", { role: "user", text: inputText, partial: true });
      if (pttHeld) setState("hearing");
    }

    const outputText = content.outputTranscription?.text || content.outputTranscription?.transcript;
    if (outputText) {
      emit("transcript", { role: "model", text: outputText, partial: true });
    }

    if (content.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          playPcmChunk(base64ToInt16(part.inlineData.data));
        }
      }
    }

    if (content.turnComplete) {
      const total = Math.round(performance.now() - turnStartedAt);
      emit("latency", {
        audio_start_ms: firstAudioAt ? Math.round(firstAudioAt - turnStartedAt) : null,
        total_ms: total,
      });
      emit("audioEnd");
      firstAudioAt = 0;
      turnStartedAt = performance.now();
      setState(pttHeld ? "hearing" : "listening");
    }
  }

  async function startMic() {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    });
    audioContext = new AudioContext({ sampleRate: INPUT_RATE });
    if (audioContext.state === "suspended") await audioContext.resume();
    source = audioContext.createMediaStreamSource(mediaStream);
    // ~20–40ms frames at common rates (docs recommend small chunks for lower latency).
    const bufferSize = audioContext.sampleRate >= 44100 ? 1024 : 512;
    processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    processor.onaudioprocess = (event) => {
      if (!active || !ready || !ws || ws.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const level = rms(input);
      const now = performance.now();
      if (now - levelEmitAt > 80) {
        levelEmitAt = now;
        emit("level", pttHeld ? level : 0);
      }
      if (!pttHeld) return;

      const down = downsample(input, audioContext!.sampleRate, INPUT_RATE);
      // Cap outbound chunk ~40ms @16k to keep the Live socket responsive.
      const maxSamples = 640;
      for (let offset = 0; offset < down.length; offset += maxSamples) {
        const slice = down.subarray(offset, Math.min(down.length, offset + maxSamples));
        const pcm = floatTo16BitPCM(slice);
        sendJson({
          realtimeInput: {
            audio: {
              data: pcm16ToBase64(pcm),
              mimeType: "audio/pcm;rate=16000",
            },
          },
        });
      }
    };
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioContext.destination);
  }

  async function start() {
    if (active) return;
    setState("connecting");
    turnStartedAt = performance.now();
    firstAudioAt = 0;
    ready = false;
    pttHeld = false;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/live`);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WS timeout")), 12000);
      ws!.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws!.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Không kết nối được /ws/live"));
      };
    });

    ws.onmessage = (event) => {
      if (typeof event.data === "string") handleServerMessage(event.data);
    };
    ws.onclose = () => {
      if (active) {
        emit("error", "Phiên Live đã đóng");
        stop();
      }
    };

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Gemini setup timeout")), 15000);
      if (ready) {
        clearTimeout(timer);
        resolve();
        return;
      }
      resolveReady = () => {
        clearTimeout(timer);
        resolve();
      };
    });

    try {
      await startMic();
    } catch (err: any) {
      ws.close();
      setState("error");
      emit("error", err.message || "Không mở được micro");
      throw err;
    }

    active = true;
    setState("listening");
  }

  /** Hold to talk — start streaming mic audio. */
  function beginTalk() {
    if (!active || !ready || pttHeld) return;
    pttHeld = true;
    turnStartedAt = performance.now();
    firstAudioAt = 0;
    // Barge-in: stop current reply when user starts speaking again.
    stopPlaybackQueue();
    setState("hearing");
    emitStatus();
  }

  /** Release — stop mic stream and finalize turn immediately (hybrid VAD). */
  function endTalk() {
    if (!pttHeld) return;
    pttHeld = false;
    emit("level", 0);
    // Bypass server silence wait — docs: audioStreamEnd finalizes the turn ASAP.
    sendJson({ realtimeInput: { audioStreamEnd: true } });
    setState("thinking");
    emitStatus("Đã thả nút — đang chờ audio đầu tiên từ Gemini…");
  }

  function sendText(text: string) {
    if (!active || !ready || !ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Chưa sẵn sàng — đợi trạng thái sẵn sàng rồi thử lại.");
    }
    const cleaned = text.trim();
    if (!cleaned) return;
    if (pttHeld) endTalk();
    turnStartedAt = performance.now();
    firstAudioAt = 0;
    emit("transcript", { role: "user", text: cleaned, partial: false });
    setState("thinking");
    sendJson({
      clientContent: {
        turns: [{ role: "user", parts: [{ text: cleaned }] }],
        turnComplete: true,
      },
    });
  }

  function interrupt() {
    stopPlaybackQueue();
    firstAudioAt = 0;
    emit("interrupted");
    if (active && !pttHeld) setState("listening");
  }

  function stop() {
    if (pttHeld) {
      pttHeld = false;
      sendJson({ realtimeInput: { audioStreamEnd: true } });
    }
    active = false;
    ready = false;
    setState("idle");
    try {
      processor?.disconnect();
      source?.disconnect();
    } catch {
      /* ignore */
    }
    processor = null;
    source = null;
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    stopPlaybackQueue();
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    ws = null;
  }

  return {
    start,
    stop,
    interrupt,
    sendText,
    beginTalk,
    endTalk,
    isPttHeld: () => pttHeld,
    getState: () => state,
    isActive: () => active,
  };
}
