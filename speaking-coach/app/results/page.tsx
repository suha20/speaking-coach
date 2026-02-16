"use client";

import { useEffect, useMemo, useState } from "react";

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
};

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ResultsPage() {
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("speakingCoach:lastResult");
      if (!raw) {
        setError("No results found. Go back and record first.");
        return;
      }
      const parsed = JSON.parse(raw) as AnalysisResult;
      setData(parsed);
    } catch {
      setError("Could not read results (data was corrupted). Please try again.");
    }
  }, []);

  const sortedFillers = useMemo(() => {
    if (!data) return [];
    const entries = Object.entries(data.stats.fillerCounts || {});
    entries.sort((a, b) => b[1] - a[1]);
    return entries;
  }, [data]);

  if (error) {
    return (
      <main style={{ maxWidth: 860, margin: "40px auto", padding: 16, fontFamily: "system-ui, Arial" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Results</h1>
        <div style={{ padding: 12, borderRadius: 10, background: "#fff3f3", border: "1px solid #ffd0d0" }}>
          <b>Error:</b> {error}
        </div>

        <button
          onClick={() => (window.location.href = "/")}
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Back
        </button>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ maxWidth: 860, margin: "40px auto", padding: 16, fontFamily: "system-ui, Arial" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Results</h1>
        <p style={{ color: "#555" }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 860, margin: "40px auto", padding: 16, fontFamily: "system-ui, Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Results</h1>
          {data.prompt ? <p style={{ marginTop: 0, color: "#555" }}><b>Prompt:</b> {data.prompt}</p> : null}
        </div>

        <button
          onClick={() => (window.location.href = "/")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            height: 42,
          }}
        >
          Back
        </button>
      </div>

      {/* Top summary */}
      <section style={{ marginTop: 18, padding: 14, borderRadius: 12, border: "1px solid #eee", background: "#fafafa" }}>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#555" }}>Overall score</div>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{data.score.overall.toFixed(1)} / 10</div>
          </div>

          <div>
            <div style={{ color: "#555" }}>Duration</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{formatSeconds(data.stats.durationSec)}</div>
          </div>

          <div>
            <div style={{ color: "#555" }}>Words</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{data.stats.wordCount}</div>
          </div>

          <div>
            <div style={{ color: "#555" }}>Pace</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{data.stats.wpm} wpm</div>
          </div>
        </div>
      </section>

      {/* Transcript */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Transcript</h2>
        <div style={{ whiteSpace: "pre-wrap", padding: 14, borderRadius: 12, border: "1px solid #eee" }}>
          {data.transcript}
        </div>
      </section>

      {/* Stats */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Stats</h2>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 12, border: "1px solid #eee" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Filler words</div>
            {sortedFillers.length === 0 ? (
              <div style={{ color: "#666" }}>None detected.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {sortedFillers.map(([k, v]) => (
                  <li key={k}>
                    <b>{k}</b>: {v}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ padding: 14, borderRadius: 12, border: "1px solid #eee" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Repeated phrases</div>
            {data.stats.repeatedPhrases?.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.stats.repeatedPhrases.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <div style={{ color: "#666" }}>None detected.</div>
            )}
          </div>
        </div>
      </section>

      {/* Coaching */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Coaching</h2>

        <div style={{ padding: 14, borderRadius: 12, border: "1px solid #eee" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Improved answer (45–60s)</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{data.improvedAnswer}</div>
        </div>

        <div style={{ marginTop: 12, padding: 14, borderRadius: 12, border: "1px solid #eee" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>STAR bullets</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><b>Situation:</b> {data.starBullets.situation}</li>
            <li><b>Task:</b> {data.starBullets.task}</li>
            <li><b>Action:</b> {data.starBullets.action}</li>
            <li><b>Result:</b> {data.starBullets.result}</li>
          </ul>
        </div>

        <div style={{ marginTop: 12, padding: 14, borderRadius: 12, border: "1px solid #eee" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Tips</div>
          {data.tips?.length ? (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {data.tips.map((t, idx) => (
                <li key={idx}>{t}</li>
              ))}
            </ol>
          ) : (
            <div style={{ color: "#666" }}>No tips yet.</div>
          )}
        </div>
      </section>

      {/* Subscores */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Subscores</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Object.entries(data.score)
            .filter(([k]) => k !== "overall")
            .map(([k, v]) => (
              <div key={k} style={{ padding: 12, borderRadius: 12, border: "1px solid #eee", minWidth: 150 }}>
                <div style={{ color: "#555", textTransform: "capitalize" }}>{k}</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{Number(v).toFixed(1)} / 10</div>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}
