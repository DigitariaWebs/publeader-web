"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const DEMO_USERS = [
  {
    role: "admin",
    email: "admin@publeader.local",
    password: "admin123!",
    label: "Admin",
    description: "Full agency dashboard",
    color: "#1A2752",
  },
  {
    role: "advertiser",
    email: "advertiser@publeader.local",
    password: "advert123!",
    label: "Annonceur",
    description: "Acme Corp · Enterprise portal",
    color: "#7c3aed",
  },
  {
    role: "driver",
    email: "driver@publeader.local",
    password: "driver123!",
    label: "Chauffeur",
    description: "Marie Dupont · Mobile app",
    color: "#0ea5e9",
  },
  {
    role: "partner",
    email: "partner@publeader.local",
    password: "partner123!",
    label: "Partenaire",
    description: "Club Neon · Borne owner",
    color: "#f59e0b",
  },
] as const;

export default function DevLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loginAs(email: string, password: string, role: string) {
    setError(null);
    setLoading(role);
    const res = await authClient.signIn.email({ email, password });
    setLoading(null);
    if (res.error) {
      setError(res.error.message ?? "Connexion échouée");
      return;
    }
    if (role === "advertiser") {
      router.push("/enterprise");
    } else if (role === "partner") {
      router.push("/partenaire");
    } else {
      router.push("/");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        background: "linear-gradient(135deg, #05060c 0%, #0f1530 100%)",
      }}
    >
      <div style={{ maxWidth: 720, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: 999,
              background: "rgba(244,184,81,0.15)",
              color: "#F4B851",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              marginBottom: 16,
            }}
          >
            DEV MODE
          </div>
          <h1
            style={{
              color: "#fff",
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
            }}
          >
            Fast Login
          </h1>
          <p style={{ color: "rgba(255,255,255,0.6)", margin: 0 }}>
            One-click sign-in with seeded demo accounts.
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(220,53,69,0.15)",
              color: "#ff8a95",
              padding: "12px 16px",
              borderRadius: 12,
              marginBottom: 20,
              border: "1px solid rgba(220,53,69,0.3)",
              fontSize: 13,
            }}
          >
            {error}. Did you run <code>npm run seed:users</code>?
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {DEMO_USERS.map((u) => (
            <button
              key={u.role}
              onClick={() => loginAs(u.email, u.password, u.role)}
              disabled={loading !== null}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: 20,
                borderRadius: 18,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading && loading !== u.role ? 0.4 : 1,
                transition: "all 0.2s",
                textAlign: "left",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                if (!loading)
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: u.color,
                  marginBottom: 12,
                }}
              />
              <div style={{ fontSize: 18, fontWeight: 700 }}>{u.label}</div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.55)",
                  marginTop: 4,
                  marginBottom: 12,
                }}
              >
                {u.description}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                {u.email}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                {u.password}
              </div>
              {loading === u.role && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: "#F4B851",
                    fontWeight: 600,
                  }}
                >
                  Connexion…
                </div>
              )}
            </button>
          ))}
        </div>

        <div
          style={{
            marginTop: 32,
            textAlign: "center",
            color: "rgba(255,255,255,0.4)",
            fontSize: 12,
          }}
        >
          <a
            href="/login"
            style={{ color: "rgba(255,255,255,0.7)", marginRight: 16 }}
          >
            ← Standard login
          </a>
          <span>Run <code>npm run seed:users</code> first if you haven&apos;t.</span>
        </div>
      </div>
    </div>
  );
}
