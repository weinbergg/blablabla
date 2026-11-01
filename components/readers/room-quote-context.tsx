"use client";
import { createContext } from "react";
import type { TextAnchor } from "@/lib/publication-content";
/** Reader tools use the active room without creating a second reader implementation. */
export const RoomQuoteContext = createContext<{ quote: (anchor: TextAnchor) => void; guide?: (anchor: TextAnchor) => Promise<void> } | null>(null);
