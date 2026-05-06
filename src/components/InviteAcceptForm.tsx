"use client";

import { useState } from "react";

type Props = { invitationId: string };

export function InviteAcceptForm({ invitationId }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${invitationId}/accept`, {
        method: "POST",
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(body.message ?? body.error ?? "Erreur inconnue");
        setPending(false);
        return;
      }
      window.location.href = "/enterprise";
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
      <button
        type="button"
        onClick={handleAccept}
        disabled={pending}
        style={{
          padding: "12px 20px",
          background: pending ? "#475569" : "#0f172a",
          color: "#fff",
          border: 0,
          borderRadius: 10,
          fontWeight: 600,
          fontSize: 14,
          cursor: pending ? "not-allowed" : "pointer",
        }}
      >
        {pending ? "Acceptation…" : "Accepter et rejoindre"}
      </button>
      {error && (
        <div
          style={{
            padding: 12,
            background: "rgba(239,68,68,0.08)",
            color: "#b91c1c",
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
