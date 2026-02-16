import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AnalysisResult = {
  prompt?: string;
  transcript: string;
  stats: {
    wordCount: number;
    durationSec: number;
    wpm: number;
    fillerCounts: Record<string, number>;
    repeatedPhrases: string[];
  };
  score: {
    overall: number;
    structure: number;
    clarity: number;
    specificity: number;
    confidence: number;
  };
  improvedAnswer: string;
  starBullets: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  tips: string[];
  debug?: {
    receivedFileName?: string;
    receivedFileType?: string;
    receivedFileSizeBytes?: number;
  };
};

export async function GET() {
  return NextResponse.json({ ok: true, message: "Use POST with multipart/form-data to analyze audio." });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const prompt = (formData.get("prompt") as string | null) ?? undefined;
    const durationSecRaw = formData.get("durationSec");
    const durationSec =
      typeof durationSecRaw === "string" && !Number.isNaN(Number(durationSecRaw))
        ? Math.max(1, Math.floor(Number(durationSecRaw)))
        : 60;

    const audio = formData.get("audio");

    // We won't process audio yet (fake response), but we validate the upload exists
    if (!(audio instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Missing audio file. Send multipart/form-data with field name 'audio'." },
        { status: 400 }
      );
    }

    const sample: AnalysisResult = {
      prompt,
      transcript: "FAKE TRANSCRIPT (next step: real transcription).",
      stats: {
        wordCount: 120,
        durationSec,
        wpm: Math.round((120 / durationSec) * 60),
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
        "FAKE IMPROVED ANSWER (next step: generated from your transcript).",
      starBullets: {
        situation: "FAKE: Brief context…",
        task: "FAKE: What you needed to achieve…",
        action: "FAKE: The steps you took…",
        result: "FAKE: The outcome + metric…",
      },
      tips: [
        "Pause instead of filling silence with ‘um’.",
        "Add 1 measurable outcome to boost specificity.",
      ],
      debug: {
        receivedFileName: audio.name,
        receivedFileType: audio.type,
        receivedFileSizeBytes: audio.size,
      },
    };

    return NextResponse.json(sample);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Server error parsing upload.", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
