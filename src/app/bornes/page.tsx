"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BornesGlass } from "@/screens/BornesGlass";
import { toBorne } from "@/lib/terminal-adapter";
import type { Borne } from "@/lib/data";
import type { TerminalDTO } from "@/lib/terminal-serializer";

export default function BornesPage() {
  const [bornes, setBornes] = useState<Borne[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/terminals", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { terminals: TerminalDTO[] };
      })
      .then((data) => {
        if (cancelled) return;
        setBornes(data.terminals.map(toBorne));
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell>
      {loading ? (
        <div style={{ padding: 32, color: "var(--gray-500)" }}>Chargement…</div>
      ) : error ? (
        <div style={{ padding: 32, color: "var(--danger)" }}>Erreur: {error}</div>
      ) : (
        <BornesGlass bornes={bornes} />
      )}
    </AppShell>
  );
}
