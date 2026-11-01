"use client";

import { useEffect, useState } from "react";

type Track = { id: string; title: string; composer: string | null };

let stopHandle: (() => void) | null = null;
let audio: HTMLAudioElement | null = null;
let tracks: Track[] = [];
let index = 0;
let starting = false;
let mounts = 0;
let label = "";
const listeners = new Set<(on: boolean) => void>();

function publish(on: boolean) {
  for (const listener of listeners) listener(on);
}

function stopAll() {
  if (audio) {
    audio.pause();
    audio.src = "";
    audio = null;
  }
  if (stopHandle) {
    stopHandle();
    stopHandle = null;
  }
  label = "";
  publish(false);
}

function playCurrent() {
  const track = tracks[index];
  if (!track) return;
  if (!audio) {
    audio = new Audio();
    audio.volume = 0.12;
    audio.addEventListener("ended", () => {
      if (tracks.length < 2) return;
      index = (index + 1) % tracks.length;
      playCurrent();
    });
  }
  audio.loop = tracks.length < 2;
  audio.src = `/api/music/${track.id}`;
  label = track.composer ? `${track.title} — ${track.composer}` : track.title;
  void audio.play();
}

/**
 * Тихая музыка при чтении. Сама не стартует: браузер пускает звук только
 * после жеста. Если админ одобрил записи, играет их. Иначе — очень тихий фон.
 */
export function ReadingMusic() {
  const [on, setOn] = useState(Boolean(audio || stopHandle));
  const [hint, setHint] = useState(label);

  useEffect(() => {
    mounts += 1;
    const sync = (playing: boolean) => {
      setOn(playing);
      setHint(label);
    };
    listeners.add(sync);
    return () => {
      mounts -= 1;
      listeners.delete(sync);
      if (mounts === 0) stopAll();
    };
  }, []);

  async function toggle() {
    if (audio || stopHandle) {
      stopAll();
      return;
    }
    if (starting) return;
    starting = true;
    try {
      const response = await fetch("/api/music/playlist");
      const data = (await response.json().catch(() => ({}))) as { tracks?: Track[] };
      tracks = data.tracks ?? [];
      if (tracks.length > 0) {
        index = 0;
        playCurrent();
        publish(true);
        return;
      }
      const { startReadingBed } = await import("@/lib/ambient-engine/boot.js");
      const bed = await startReadingBed();
      stopHandle = bed.stop;
      label = "Тихий фон, записей пока нет";
      publish(true);
    } finally {
      starting = false;
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
        on ? "border-rust bg-rust/10 text-rust" : "border-ink/15 text-muted hover:text-ink"
      }`}
      aria-pressed={on}
      title={
        hint ||
        "Спокойные записи, которые одобрил админ. Если их ещё нет, включается очень тихий фон."
      }
    >
      {on ? "Музыка играет" : "Музыка"}
    </button>
  );
}
