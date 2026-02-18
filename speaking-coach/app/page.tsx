"use client";

import { useMemo, useRef, useState } from "react";

type RecorderStatus = "idle" | "requesting_permission" | "recording" | "stopped" | "error";

const DEFAULT_PROMPTS = [
  "Tell me about yourself.",
  "Why do you want this role?",
  "Describe a challenge you overcame.",
  "Tell me about a time you showed leadership.",
  "Explain a project you’re proud of.",
];

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}



//audio conversion section before the home function so the gemini can translate
function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;

  const samples = buffer.length;
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;

  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);        // PCM chunk size
  view.setUint16(20, 1, true);         // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels + convert float [-1..1] to 16-bit PCM
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let s = buffer.getChannelData(ch)[i];
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return out;
}

async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const wav = audioBufferToWav(audioBuffer);
  await ctx.close();
  return new Blob([wav], { type: "audio/wav" });
}





//home function 
export default function Home() {

  const viewSampleResults = () => {
  const sample = {
    prompt,
    transcript: "This is a sample transcript. Replace this with real transcription later.",
    stats: {
      wordCount: 120,
      durationSec: 55,
      wpm: 131,
      fillerCounts: { um: 2, like: 4, "you know": 1 },
      repeatedPhrases: ["basically", "kind of"],
    },
    score: {
      overall: 7.6,
      structure: 7.0,
      clarity: 8.0,
      specificity: 6.0,
      confidence: 7.0,
    },
    improvedAnswer:
      "Here’s a tighter, clearer version of your answer that stays within 45–60 seconds. (Sample output)",
    starBullets: {
      situation: "Brief context of the situation…",
      task: "What you needed to achieve…",
      action: "What you did (specific steps)…",
      result: "What changed + any metrics…",
    },
    tips: [
      "Cut filler words by pausing instead of filling silence.",
      "Add 1 measurable outcome to boost specificity.",
    ],
  };

  sessionStorage.setItem("speakingCoach:lastResult", JSON.stringify(sample));
  window.location.href = "/results";
};





  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPTS[0]);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);


  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const audioUrl = useMemo(() => {
    if (!audioBlob) return null;
    return URL.createObjectURL(audioBlob);
  }, [audioBlob]);

  const isRecording = status === "recording";

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    setErrorMsg(null);
    setAudioBlob(null);
    setDurationSec(0);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorMsg("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      setStatus("requesting_permission");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Pick a supported audio mime type
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];
      const mimeType =
        preferredTypes.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) || "";

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstart = () => {
        startTimeRef.current = Date.now();
        setStatus("recording");

        clearTimer();
        timerRef.current = window.setInterval(() => {
          const elapsed = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
          setDurationSec(elapsed);
        }, 250);
      };

      recorder.onstop = () => {
        clearTimer();

        // Stop mic tracks to release microphone
        stream.getTracks().forEach((t) => t.stop());

        const endTime = Date.now();
        const elapsed = Math.max(1, Math.floor((endTime - startTimeRef.current) / 1000));
        setDurationSec(elapsed);

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);

        setStatus("stopped");
        setTimeout(() => {
        analyzeRecording(blob, elapsed);
        }, 0);
      };

      recorder.onerror = () => {
        clearTimer();
        setStatus("error");
        setErrorMsg("Recording error occurred. Please try again.");
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch (err: any) {
      setStatus("error");
      // Common: user denied mic permission
      if (err?.name === "NotAllowedError") {
        setErrorMsg("Microphone permission denied. Please allow mic access and try again.");
      } else {
        setErrorMsg("Could not access microphone. Please try again.");
      }
    }
  };



  const stopRecording = () => {
  const recorder = mediaRecorderRef.current;
  if (!recorder) return;
  if (recorder.state === "recording") recorder.stop();
};


  const analyzeRecording = async (blob: Blob, duration: number) => {
    try {
      setIsUploading(true);
      setErrorMsg(null);

      let uploadBlob: Blob = blob;
      let fileName = "recording.wav";

      try {
        uploadBlob = await blobToWav(blob);
      } catch {
  // If conversion fails, we still try to upload original,
  // but Gemini may reject unsupported formats.
      uploadBlob = blob;
      fileName = "recording.webm";
      }

      const form = new FormData();
      form.append("prompt", prompt);
      form.append("durationSec", String(duration));
      form.append("audio", uploadBlob, fileName);


      const res = await fetch("/api/analyze", { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json(); // <-- this is the “JSON handling”
    sessionStorage.setItem("speakingCoach:lastResult", JSON.stringify(data));
    window.location.href = "/results";
  } catch (err: any) {
    setStatus("error");
    setErrorMsg(`Upload/analyze failed: ${err?.message ?? "Unknown error"}`);
  } finally {
    setIsUploading(false);
  }
};








//UI ELEMENTS GOES INSIDE HOME FUNCTION NOT THE ANALYZERECORDING
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui, Arial" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Speaking Coach</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Pick a prompt, record 30–60 seconds, then we’ll analyze it (next step).
      </p>

      <div style={{ marginTop: 20, display: "grid", gap: 12 }}>




        <button
          onClick={viewSampleResults}
          style={{
            marginTop: 8,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #fcf9f9",
            background: "#62be3e",
            cursor: "pointer",
            width: "fit-content",
          }}
        >
          View sample results
        </button>





        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Prompt</span>
          <select
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isRecording}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          >
            {DEFAULT_PROMPTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={startRecording}
            disabled={isRecording || status === "requesting_permission" || isUploading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: isRecording ? "#eee" : "#111",
              color: isRecording ? "#111" : "#fff",
              cursor: isRecording ? "not-allowed" : "pointer",
            }}
          >
            {status === "requesting_permission" ? "Requesting mic…" : "Start recording"}
          </button>

          <button
            onClick={stopRecording}
            disabled={!isRecording || isUploading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: !isRecording ? "not-allowed" : "pointer",
            }}
          >
            Stop
          </button>

          <span style={{ color: "#555" }}>
            Status: <b>{status}</b>
            {status === "recording" ? ` • ${formatSeconds(durationSec)}` : ""}
          </span>
        </div>

        {errorMsg && (
          <div style={{ padding: 12, borderRadius: 10, background: "#fff3f3", border: "1px solid #ffd0d0" }}>
            <b>Error:</b> {errorMsg}
          </div>
        )}

        {audioUrl && (
          <div style={{ padding: 12, borderRadius: 12, border: "1px solid #eee", background: "#fafafa" }}>
            <div style={{ marginBottom: 8 }}>
              <b>Recorded:</b> {formatSeconds(durationSec)}
            </div>
            <audio controls src={audioUrl} />
          </div>
        )}
      </div>
    </main>
  );
}

