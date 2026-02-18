import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Buffer } from "node:buffer";

export const runtime = "nodejs";

const TRANSCRIBE_MODEL = "gemini-2.5-flash";
const COACH_MODEL = "gemini-2.5-flash";

const CoachSchema = z.object({
  improvedAnswer: z.string().min(1),
  starBullets: z.object({
    situation: z.string().min(1),
    task: z.string().min(1),
    action: z.string().min(1),
    result: z.string().min(1),
  }),
  tips: z.array(z.string().min(1)).min(2).max(5),
  score: z.object({
    overall: z.number().min(0).max(10),
    structure: z.number().min(0).max(10),
    clarity: z.number().min(0).max(10),
    specificity: z.number().min(0).max(10),
    confidence: z.number().min(0).max(10),
  }),
});

const FILLERS: Array<{ key: string; re: RegExp }> = [
  { key: "um", re: /\bum+\b/gi },
  { key: "uh", re: /\buh+\b/gi },
  { key: "like", re: /\blike\b/gi },
  { key: "you know", re: /\byou\s+know\b/gi },
  { key: "basically", re: /\bbasically\b/gi },
  { key: "kind of", re: /\bkind\s+of\b/gi },
  { key: "sort of", re: /\bsort\s+of\b/gi },
];

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function topRepeatedPhrases(words: string[], n = 3, minCount = 2, limit = 5): string[] {
  if (words.length < n) return [];
  const counts = new Map<string, number>();
  for (let i = 0; i <= words.length - n; i++) {
    const phrase = words.slice(i, i + n).join(" ");
    if (phrase.includes("you know") || phrase.includes("kind of") || phrase.includes("sort of")) continue;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([p]) => p);
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "POST audio (multipart/form-data) to analyze." });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing GEMINI_API_KEY. Add it to .env.local and restart dev server." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const formData = await req.formData();
    const prompt = (formData.get("prompt") as string | null) ?? "";
    const durationSecRaw = formData.get("durationSec");
    const durationSec =
      typeof durationSecRaw === "string" && !Number.isNaN(Number(durationSecRaw))
        ? Math.max(1, Math.floor(Number(durationSecRaw)))
        : 60;

    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Missing audio file. Send multipart/form-data with field name 'audio'." },
        { status: 400 }
      );
    }

    // Inline audio max request size guidance is 20MB (good for 30–60s clips)
    if (audio.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Audio too large for inline upload. Keep it under ~20MB." },
        { status: 400 }
      );
    }

    const mimeType = audio.type || "audio/webm";
    console.log("Uploaded:", { name: audio.name, type: mimeType, size: audio.size });

    const supported = new Set([
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/aac",
      "audio/ogg",
      "audio/flac",
      "audio/aiff",
    ]);

    if (!supported.has(mimeType)) {
      return NextResponse.json(
        { ok: false, error: `Unsupported audio type: ${mimeType}. Please upload WAV/MP3/AAC/OGG/FLAC.` },
        { status: 400 }
      );
    }

    const base64Audio = Buffer.from(await audio.arrayBuffer()).toString("base64");

    // 1) Transcribe
    const transcriptRes = await ai.models.generateContent({
      model: TRANSCRIBE_MODEL,
      contents: [
        {
          text:
            "Transcribe the speech in this audio accurately with punctuation. " +
            "Keep filler words like um, uh, like, you know. " +
            "Return ONLY the transcript text (no headings, no bullets).",
        },
        {
          inlineData: {
            mimeType,
            data: base64Audio,
          },
        },
      ],
    });

    const transcript = (transcriptRes.text ?? "").trim();
    if (!transcript) {
      return NextResponse.json(
        { ok: false, error: "Transcription returned empty text. Try recording again." },
        { status: 422 }
      );
    }

    // 2) Stats
    const words = tokenize(transcript);
    const wordCount = words.length;
    const wpm = Math.max(0, Math.round((wordCount / Math.max(1, durationSec)) * 60));

    const fillerCounts: Record<string, number> = {};
    for (const f of FILLERS) fillerCounts[f.key] = countMatches(transcript, f.re);

    const repeatedPhrases = topRepeatedPhrases(words, 3, 2, 5);

    // 3) Coaching (structured JSON)
    const coachPrompt = [
      "You are a speaking coach for interview answers.",
      "Rewrite the answer to be clearer and more structured, ~45–60 seconds spoken.",
      "Do NOT invent achievements/metrics not present in the transcript.",
      "Return valid JSON that matches the provided schema.",
      "",
      `PROMPT: ${prompt || "(none)"}`,
      `DURATION_SECONDS: ${durationSec}`,
      `TRANSCRIPT:\n${transcript}`,
      `STATS: wordCount=${wordCount}, wpm=${wpm}`,
      `FILLERS: ${JSON.stringify(fillerCounts)}`,
      `REPEATED_PHRASES: ${JSON.stringify(repeatedPhrases)}`,
    ].join("\n");

    const coachRes = await ai.models.generateContent({
      model: COACH_MODEL,
      contents: coachPrompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(CoachSchema),
      },
    });

    const coachObj = CoachSchema.parse(JSON.parse(coachRes.text ?? "{}"));

    return NextResponse.json({
      prompt,
      transcript,
      stats: {
        wordCount,
        durationSec,
        wpm,
        fillerCounts,
        repeatedPhrases,
      },
      ...coachObj,
      debug: {
        receivedFileName: audio.name,
        receivedFileType: mimeType,
        receivedFileSizeBytes: audio.size,
        models: { transcribe: TRANSCRIBE_MODEL, coach: COACH_MODEL },
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Server error analyzing audio.", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
