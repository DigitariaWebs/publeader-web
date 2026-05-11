"use client";

/**
 * ScreenSwitcher — renders either the glass or pro variant of a screen
 * depending on the current `uiStyle` from ThemeContext.
 */

import type { ReactNode } from "react";
import { useTheme } from "@/contexts/ThemeContext";

interface ScreenSwitcherProps {
  glass: ReactNode;
  pro: ReactNode;
}

export function ScreenSwitcher({ glass }: ScreenSwitcherProps) {
  return <>{glass}</>;
}
