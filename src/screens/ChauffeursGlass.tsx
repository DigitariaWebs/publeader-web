"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

type DriverRow = {
  id: string;
  firstName: string;
  lastName: string;
  city: string;
  status: string;
  rating: number;
  campaignsDone: number;
  totalKm: number;
  documentsApproved: boolean;
  email: string;
};

export function ChauffeursGlass() {
  const router = useRouter();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "validated" | "pending">("all");

  useEffect(() => {
    setLoading(true);
    const url = new URL("/api/admin/drivers", window.location.origin);
    if (statusFilter !== "all") url.searchParams.set("status", statusFilter);
    fetch(url.toString(), { credentials: "include" })
      .then((r) => r.json())
      .then((b: { drivers?: DriverRow[] }) => setDrivers(b.drivers ?? []))
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const filtered = drivers.filter((d) => {
    if (!q) return true;
    const name = `${d.firstName} ${d.lastName} ${d.city} ${d.email}`.toLowerCase();
    return name.includes(q.toLowerCase());
  });

  const STATUS_LABEL: Record<string, string> = {
    validated: "Validé",
    pending: "En attente",
    rejected: "Refusé",
  };

  const STATUS_TONE: Record<string, string> = {
    validated: "success",
    pending: "warning",
    rejected: "outline",
  };

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
            Chauffeurs
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            {loading ? "Chargement…" : `${filtered.length} chauffeur${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      <div className="glass-filterrow">
        {(
          [
            ["all", "Tous"],
            ["validated", "Validés"],
            ["pending", "En attente"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={"glass-fpill" + (statusFilter === k ? " active" : "")}
            onClick={() => setStatusFilter(k)}
          >
            {l}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <div className="glass-searchfield">
          <Icon name="search" size={14} />
          <input
            placeholder="Rechercher…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: "var(--gray-500)" }}>
          <Icon name="users" size={24} />
          <p style={{ marginTop: 12 }}>Aucun chauffeur trouvé.</p>
        </div>
      ) : (
        <div className="glass-cardgrid">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="glass-tile"
              style={{ cursor: "pointer" }}
              onClick={() => router.push(`/chauffeurs/${r.id}`)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="avatar-initials" style={{ width: 44, height: 44, fontSize: 15 }}>
                  {r.firstName[0]}{r.lastName[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{r.firstName} {r.lastName}</div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{r.city}</div>
                </div>
                <span className={"g-chip " + (STATUS_TONE[r.status] ?? "outline")}>
                  <span className="dot" />
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: "1px solid rgba(0,0,0,0.08)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8,
                  textAlign: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{r.campaignsDone}</div>
                  <div style={{ fontSize: 11, color: "var(--gray-500)" }}>Camp.</div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {(r.totalKm / 1000).toFixed(1)}k
                  </div>
                  <div style={{ fontSize: 11, color: "var(--gray-500)" }}>Km</div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{r.rating.toFixed(1)}</div>
                  <div style={{ fontSize: 11, color: "var(--gray-500)" }}>Note</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
