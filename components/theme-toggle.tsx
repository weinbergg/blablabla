"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "theme";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  window.localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className={`icon-button opacity-0 ${className}`} aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={() => {
        const next = !dark;
        setDark(next);
        applyTheme(next);
      }}
      className={`icon-button ${className}`}
      aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={dark ? "Светлая тема" : "Тёмная тема"}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
