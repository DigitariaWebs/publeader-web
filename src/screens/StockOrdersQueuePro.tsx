"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import type {
  ScentDTO,
  StockOrderDTO,
  CartridgeDTO,
} from "@/lib/stock-serializer";
import type { TerminalDTO } from "@/lib/terminal-serializer";

const STATUS_LABEL: Record<StockOrderDTO["status"], string> = {
  pending: "En attente",
  fulfilled: "Livrée",
  cancelled: "Annulée",
};

const STATUS_CHIP: Record<StockOrderDTO["status"], string> = {
  pending: "chip-warning",
  fulfilled: "chip-success",
  cancelled: "chip-soft-navy",
};

export function StockOrdersQueuePro() {
  const [orders, setOrders] = useState<StockOrderDTO[]>([]);
  const [scents, setScents] = useState<ScentDTO[]>([]);
  const [terminals, setTerminals] = useState<TerminalDTO[]>([]);
  const [filter, setFilter] = useState<StockOrderDTO["status"] | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [refillingOrder, setRefillingOrder] = useState<StockOrderDTO | null>(
    null,
  );

  const reload = async () => {
    setLoading(true);
    const [oRes, sRes, tRes] = await Promise.all([
      fetch("/api/admin/stock-orders", { credentials: "include" }).then((r) =>
        r.json(),
      ),
      fetch("/api/admin/scents", { credentials: "include" }).then((r) =>
        r.json(),
      ),
      fetch("/api/admin/terminals", { credentials: "include" }).then((r) =>
        r.json(),
      ),
    ]);
    setOrders(oRes.orders ?? []);
    setScents(sRes.scents ?? []);
    setTerminals(tRes.terminals ?? []);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const terminalMap = useMemo(
    () => new Map(terminals.map((t) => [t.id, t])),
    [terminals],
  );

  const counts = {
    pending: orders.filter((o) => o.status === "pending").length,
    fulfilled: orders.filter((o) => o.status === "fulfilled").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };

  const cancel = async (id: string) => {
    if (!confirm("Annuler cette commande ?")) return;
    await fetch(`/api/admin/stock-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "cancel" }),
    });
    await reload();
  };

  const fulfill = async (id: string) => {
    if (!confirm("Marquer cette commande comme livrée ?")) return;
    await fetch(`/api/admin/stock-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "fulfill" }),
    });
    await reload();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Commandes stock</h1>
          <p className="subtitle">
            Refills demandés par les partenaires. Marquez livré ou refusé.
          </p>
        </div>
      </div>

      <div className="grid grid-12 mb-6" style={{ gap: 16 }}>
        {[
          { l: "En attente", v: counts.pending.toString() },
          { l: "Livrées", v: counts.fulfilled.toString() },
          { l: "Annulées", v: counts.cancelled.toString() },
          { l: "Catalogue", v: scents.length.toString() },
        ].map((t) => (
          <div
            key={t.l}
            className="col-3"
            style={{
              background: "var(--navy-soft)",
              borderRadius: 10,
              padding: "16px 18px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: "var(--navy)",
                textTransform: "uppercase",
              }}
            >
              {t.l}
            </div>
            <div
              className="num"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 700,
                margin: "4px 0 2px",
              }}
            >
              {t.v}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(
          [
            { v: "pending", l: "En attente" },
            { v: "fulfilled", l: "Livrées" },
            { v: "cancelled", l: "Annulées" },
            { v: "all", l: "Toutes" },
          ] as const
        ).map((f) => (
          <button
            key={f.v}
            type="button"
            className={
              "btn compact " +
              (filter === f.v ? "btn-primary" : "btn-ghost")
            }
            onClick={() => setFilter(f.v)}
          >
            {f.l}
          </button>
        ))}
      </div>

      <div className="card card-flush">
        {loading ? (
          <div style={{ padding: 32, color: "var(--gray-500)" }}>
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--gray-500)",
            }}
          >
            <Icon name="package" size={32} />
            <p style={{ margin: "12px 0 0", fontSize: 14 }}>
              Aucune commande dans cette catégorie.
            </p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Borne</th>
                <th>Lignes</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const terminal = terminalMap.get(o.terminalId);
                return (
                  <tr key={o.id}>
                    <td style={{ color: "var(--gray-500)", fontSize: 12 }}>
                      {new Date(o.createdAt).toLocaleString("fr-FR")}
                    </td>
                    <td>
                      {terminal ? (
                        <div>
                          <div style={{ fontWeight: 600 }}>{terminal.name}</div>
                          <div
                            className="mono"
                            style={{ fontSize: 11, color: "var(--gray-500)" }}
                          >
                            {terminal.code}
                          </div>
                        </div>
                      ) : (
                        <span className="mono" style={{ fontSize: 12 }}>
                          {o.terminalId}
                        </span>
                      )}
                    </td>
                    <td>
                      {o.lines
                        .map((l) => `${l.qty}× ${l.scentName ?? l.scentId}`)
                        .join(", ")}
                      {o.notes && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--gray-500)",
                            marginTop: 4,
                            fontStyle: "italic",
                          }}
                        >
                          “{o.notes}”
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={"chip " + STATUS_CHIP[o.status]}>
                        <span className="dot" /> {STATUS_LABEL[o.status]}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {o.status === "pending" && (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="btn btn-ghost compact"
                            onClick={() => cancel(o.id)}
                          >
                            Refuser
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary compact"
                            onClick={() => setRefillingOrder(o)}
                          >
                            <Icon name="refresh" size={14} /> Refill
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary compact"
                            onClick={() => fulfill(o.id)}
                          >
                            Livrée
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {refillingOrder && (
        <RefillModal
          order={refillingOrder}
          terminal={terminalMap.get(refillingOrder.terminalId)}
          scents={scents}
          onClose={() => setRefillingOrder(null)}
          onDone={async () => {
            setRefillingOrder(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function RefillModal({
  order,
  terminal,
  scents,
  onClose,
  onDone,
}: {
  order: StockOrderDTO;
  terminal?: TerminalDTO;
  scents: ScentDTO[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [cartridges, setCartridges] = useState<CartridgeDTO[]>([]);
  const [slot, setSlot] = useState<number>(1);
  const [scentId, setScentId] = useState<string>("");
  const [levelAfter, setLevelAfter] = useState<number>(100);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!terminal) return;
    fetch(`/api/me/terminals/${terminal.id}/stock`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => setCartridges(d.cartridges ?? []))
      .catch(() => {});
  }, [terminal]);

  const submit = async () => {
    if (!terminal) return;
    if (!scentId) {
      setErr("Sélectionnez un parfum");
      return;
    }
    setSubmitting(true);
    setErr(null);
    const res = await fetch(
      `/api/admin/terminals/${terminal.id}/refill`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          slot,
          scentId,
          levelAfter,
          orderId: order.id,
        }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      setErr(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      return;
    }
    await onDone();
  };

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" style={{ width: 480 }}>
        <div className="sheet-head">
          <h2>Logguer un refill</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body">
          <p style={{ fontSize: 13, color: "var(--gray-500)" }}>
            Borne <strong>{terminal?.name ?? order.terminalId}</strong>. Le
            refill est lié à la commande #{order.id.slice(-6)}.
          </p>
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Slot
              </div>
              <select
                value={slot}
                onChange={(e) => setSlot(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--gray-200)",
                }}
              >
                {[1, 2, 3, 4, 5].map((n) => {
                  const c = cartridges.find((x) => x.slot === n);
                  return (
                    <option key={n} value={n}>
                      Slot {n}
                      {c?.scentName ? ` (${c.scentName} · ${c.levelPercent}%)` : " (vide)"}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Parfum installé
              </div>
              <select
                value={scentId}
                onChange={(e) => setScentId(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--gray-200)",
                }}
              >
                <option value="">— sélectionner —</option>
                {scents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.sku})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Niveau après refill ({levelAfter}%)
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={levelAfter}
                onChange={(e) => setLevelAfter(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </label>
          </div>
          {err && (
            <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 13 }}>
              {err}
            </div>
          )}
        </div>
        <div className="sheet-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || !scentId}
            onClick={submit}
          >
            {submitting ? "Envoi…" : "Logguer le refill"}
          </button>
        </div>
      </div>
    </>
  );
}
