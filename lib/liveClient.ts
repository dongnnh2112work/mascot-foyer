const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

function floatTo16BitPCM(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function downsample(float32, fromRate, toRate) {
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

function pcm16ToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToInt16(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/**
 * Browser client for Gemini Live via local WS proxy.
 * Emits: ready, state, transcript, error, latency, audioStart, audioEnd, interrupted
 */
export function createLiveClient(handlers = {}) {
  let ws = null;
  let mediaStream = null;
  let audioContext = null;
  let processor = null;
  let source = null;
  let playContext = null;
  let nextPlayTime = 0;
  let active = false;
  let state = "idle";
  let turnStartedAt = 0;
  let firstAudioAt = 0;

  const emit = (name, payload) => {
    handlers[name]?.(payload);
  };

  function setState(next) {
    state = next;
    emit("state", next);
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

  function playPcmChunk(int16) {
    const ctx = ensurePlayContext();
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
    const buffer = ctx.createBuffer(1, float32.length, OUTPUT_RATE);
    buffer.copyToChannel(float32, 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime + 0.02, nextPlayTime);
    node.start(startAt);
    nextPlayTime = startAt + buffer.duration;
    if (!firstAudioAt) {
      firstAudioAt = performance.now();
      emit("audioStart", { latencyMs: Math.round(firstAudioAt - turnStartedAt) });
      setState("speaking");
    }
  }

  function handleServerMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "ready") {
      emit("ready", msg);
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
      setState("listening");
    }

    if (content.inputTranscription?.text) {
      emit("transcript", { role: "user", text: content.inputTranscription.text, partial: true });
    }
    if (content.outputTranscription?.text) {
      emit("transcript", { role: "model", text: content.outputTranscription.text, partial: true });
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
      setState("listening");
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
    audioContext = new AudioContext();
    source = audioContext.createMediaStreamSource(mediaStream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      if (!active || !ws || ws.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const down = downsample(input, audioContext.sampleRate, INPUT_RATE);
      const pcm = floatTo16BitPCM(down);
      const payload = {
        realtimeInput: {
          audio: {
            data: pcm16ToBase64(pcm),
            mimeType: "audio/pcm;rate=16000",
          },
        },
      };
      ws.send(JSON.stringify(payload));
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

    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws/live`);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WS timeout")), 12000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
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

    try {
      await startMic();
    } catch (err) {
      ws.close();
      setState("error");
      emit("error", err.message || "Không mở được micro");
      throw err;
    }

    active = true;
    setState("listening");
  }

  function stop() {
    active = false;
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
    getState: () => state,
    isActive: () => active,
  };
}
