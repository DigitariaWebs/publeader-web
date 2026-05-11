"use client";

/**
 * Login — curtain-design login screen with animated aurora and glass buttons.
 * Layout 1:1 with the prototype's <Login>; visual polish adds motion + glass.
 */

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { authClient } from "@/lib/auth-client";

export function Login() {
  const router = useRouter();
  const [showPwd, setShowPwd] = useState(false);
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogin = async () => {
    setError(null);
    setLoading(true);
    const res = await authClient.signIn.email({ email, password: pwd });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Connexion échouée");
      return;
    }
    router.push("/");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <div
        className="login-curtain"
        style={{
          flex: "0 0 55%",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="login-bands" />
        <div className="login-aurora" />

        <div className="login-glow login-glow-1" />
        <div className="login-glow login-glow-2" />
        <div className="login-glow login-glow-3" />

        <div className="login-grain" />

        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 500,
            alignSelf: "flex-start",
            marginTop: 60,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
            <Image
              src="/assets/logo-white.png"
              alt="Publeader"
              width={120}
              height={28}
              style={{ height: 28, width: "auto" }}
            />
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 56,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              margin: "0 0 24px",
            }}
          >
            La publicité qui roule.
            <br />
            Et qui rapporte.
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "rgba(255,255,255,0.65)",
              lineHeight: 1.55,
              margin: 0,
              maxWidth: 440,
            }}
          >
            Pilotez vos campagnes Flocage et Leader Borne, suivez vos chauffeurs en temps réel et
            éditez vos factures — depuis un seul espace.
          </p>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 32,
            left: 80,
            right: 80,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "rgba(255,255,255,0.35)",
            fontSize: 11,
            letterSpacing: "0.14em",
            zIndex: 2,
          }}
        >
          <span>AGENCE · PARIS / LYON / BORDEAUX</span>
          <span>V 2.4 · AVRIL 2026</span>
        </div>
      </div>

      <div
        className="login-formside"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
        }}
      >
        <div className="login-formcard">
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "var(--gray-500)",
              marginBottom: 10,
            }}
          >
            ESPACE ADMIN
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 32,
              fontWeight: 700,
              margin: "0 0 8px",
              letterSpacing: "-0.02em",
            }}
          >
            Connexion
          </h1>
          <p style={{ color: "var(--gray-500)", margin: "0 0 28px" }}>
            Accédez à votre tableau de bord.
          </p>

          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              className="input-glass"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
          </div>
          <div className="input-group">
            <label className="input-label">Mot de passe</label>
            <div style={{ position: "relative" }}>
              <input
                className="input-glass"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                type={showPwd ? "text" : "password"}
                style={{ paddingRight: 48 }}
              />
              <button
                type="button"
                className="icon-btn"
                style={{ position: "absolute", right: 6, top: 6, width: 36, height: 36 }}
                onClick={() => setShowPwd(!showPwd)}
              >
                <Icon name={showPwd ? "eye-off" : "eye"} size={16} />
              </button>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              margin: "14px 0 22px",
              fontSize: 13,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <span className="checkbox checked">
                <Icon name="check" size={12} />
              </span>
              <span>Se souvenir de moi</span>
            </label>
            <a href="#" style={{ color: "var(--navy)", fontWeight: 500 }}>
              Mot de passe oublié ?
            </a>
          </div>

          {error && (
            <div style={{ color: "#c0392b", fontSize: 13, marginBottom: 10 }}>
              {error}
            </div>
          )}
          <button
            type="button"
            className="btn-glass-primary"
            style={{ width: "100%" }}
            onClick={onLogin}
            disabled={loading}
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>

          {process.env.NODE_ENV !== "production" && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
              <a
                href="/dev-login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(244,184,81,0.15)",
                  color: "#F4B851",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textDecoration: "none",
                }}
              >
                <Icon name="zap" size={12} />
                FAST LOGIN (DEV)
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
