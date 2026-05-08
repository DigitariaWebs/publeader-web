"use client";

import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";

export function PartenaireStub({
  title,
  subtitle,
  icon = "wrench",
}: {
  title: string;
  subtitle: string;
  icon?: IconName;
}) {
  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div
        className="glass-card"
        style={{
          padding: 48,
          textAlign: "center",
          color: "var(--gray-500)",
        }}
      >
        <Icon name={icon} size={32} />
        <p style={{ margin: "12px 0 0", fontSize: 14 }}>Bientôt disponible.</p>
      </div>
    </div>
  );
}
