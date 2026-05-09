"use client";

/**
 * CommandPalette — ⌘K palette. Live admin search backed by /api/admin/search.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { useUiState } from "@/contexts/UiStateContext";
import type { SearchHitDTO, SearchResponseDTO } from "@/lib/search-serializer";

interface Entry {
  type: "action" | "jump" | "entity";
  icon: IconName;
  label: string;
  desc?: string;
  kbd?: string;
  go?: string;
}

const actions: Entry[] = [
  {
    type: "action",
    icon: "plus",
    label: "Nouvelle campagne",
    desc: "Créer une campagne depuis un contrat",
    go: "/campagnes/new",
  },
  {
    type: "action",
    icon: "shield-check",
    label: "Valider un dossier",
    desc: "Ouvrir la file d'attente",
    go: "/validations",
  },
  {
    type: "action",
    icon: "bar-chart-3",
    label: "Générer un rapport",
    desc: "Bilan, comptable, RGPD…",
    go: "/rapports",
  },
];

const jumps: Entry[] = [
  { type: "jump", icon: "layout-dashboard", label: "Vue d'ensemble", kbd: "G D", go: "/" },
  { type: "jump", icon: "shield-check", label: "Validations", kbd: "G V", go: "/validations" },
  { type: "jump", icon: "car", label: "Chauffeurs", kbd: "G C", go: "/chauffeurs" },
  { type: "jump", icon: "building-2", label: "Entreprises", kbd: "G E", go: "/entreprises" },
  { type: "jump", icon: "megaphone", label: "Campagnes", kbd: "G K", go: "/campagnes" },
  { type: "jump", icon: "spray-can", label: "Leader Bornes", kbd: "G B", go: "/bornes" },
  { type: "jump", icon: "banknote", label: "Finances", kbd: "G F", go: "/finances" },
  { type: "jump", icon: "bar-chart-3", label: "Rapports", kbd: "G R", go: "/rapports" },
];

const SEARCH_DEBOUNCE_MS = 250;

function hitToEntry(h: SearchHitDTO): Entry {
  return {
    type: "entity",
    icon: h.icon,
    label: h.label,
    desc: h.sublabel,
    go: h.href,
  };
}

export function CommandPalette() {
  const { cmdkOpen, closeCmdk } = useUiState();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [results, setResults] = useState<SearchHitDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (cmdkOpen) setTimeout(() => inputRef.current?.focus(), 20);
  }, [cmdkOpen]);

  // Debounced fetch. AbortController kills any in-flight request when the
  // user keeps typing or closes the palette so React state never updates
  // from a stale response.
  useEffect(() => {
    if (!cmdkOpen) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/search?q=${encodeURIComponent(trimmed)}`,
          { credentials: "include", signal: controller.signal },
        );
        if (!res.ok) {
          // Non-admin → 403; just clear results, leave actions/jumps visible.
          setResults([]);
          return;
        }
        const data = (await res.json()) as SearchResponseDTO;
        setResults(data.hits);
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q, cmdkOpen]);

  const filterLocal = (l: Entry[]) =>
    q.trim() === ""
      ? l
      : l.filter((i) =>
          (i.label + " " + (i.desc || "")).toLowerCase().includes(q.toLowerCase()),
        );

  const groups = useMemo(() => {
    const out: { title: string; items: Entry[] }[] = [];
    const acts = filterLocal(actions);
    const jms = filterLocal(jumps);
    if (acts.length) out.push({ title: "Actions rapides", items: acts });
    if (jms.length) out.push({ title: "Aller à", items: jms });
    if (results.length) {
      out.push({
        title: "Résultats",
        items: results.map(hitToEntry),
      });
    }
    return out;
  }, [q, results]);

  const flat = groups.flatMap((g) => g.items);

  useEffect(() => {
    if (!cmdkOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCmdk();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const item = flat[activeIdx];
        if (item?.go) {
          router.push(item.go);
          closeCmdk();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmdkOpen, activeIdx, flat, router, closeCmdk]);

  useEffect(() => setActiveIdx(0), [q]);

  // Reset state on close so reopen starts clean.
  useEffect(() => {
    if (!cmdkOpen) {
      setQ("");
      setResults([]);
      setSearching(false);
      setActiveIdx(0);
    }
  }, [cmdkOpen]);

  if (!cmdkOpen) return null;
  let idx = -1;
  const noResults =
    groups.length === 0 ||
    (q.trim().length >= 2 &&
      !searching &&
      results.length === 0 &&
      filterLocal(actions).length === 0 &&
      filterLocal(jumps).length === 0);

  return (
    <div className="cmdk-overlay" onClick={closeCmdk}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-wrap">
          <Icon name="search" size={18} style={{ color: "var(--gray-500)" }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tapez une commande ou recherchez…"
          />
          {searching && (
            <span style={{ fontSize: 11, color: "var(--gray-500)" }}>
              <Icon name="refresh" size={12} /> recherche…
            </span>
          )}
          <kbd
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--gray-500)",
            }}
          >
            ESC
          </kbd>
        </div>
        <div className="cmdk-body">
          {noResults && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--gray-500)" }}>
              Aucun résultat
            </div>
          )}
          {groups.map((g) => (
            <div key={g.title}>
              <div className="cmdk-group-title">{g.title}</div>
              {g.items.map((item) => {
                idx++;
                const isActive = idx === activeIdx;
                const key = `${g.title}-${item.label}-${item.go ?? ""}`;
                return (
                  <div
                    key={key}
                    className={"cmdk-item" + (isActive ? " active" : "")}
                    onClick={() => {
                      if (item.go) {
                        router.push(item.go);
                        closeCmdk();
                      }
                    }}
                  >
                    <Icon
                      name={item.icon}
                      size={16}
                      style={{ color: "var(--gray-600)" }}
                    />
                    <span>{item.label}</span>
                    {item.desc && (
                      <span
                        className="cm-desc"
                        style={{ color: "var(--gray-500)", fontSize: 12, marginLeft: 6 }}
                      >
                        · {item.desc}
                      </span>
                    )}
                    {item.kbd && <kbd>{item.kbd}</kbd>}
                    {isActive && (
                      <Icon
                        name="arrow-right"
                        size={14}
                        style={{ color: "var(--navy)" }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
