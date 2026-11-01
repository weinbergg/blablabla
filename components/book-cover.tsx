"use client";
import { useCallback, useState } from "react";
import { BookOpen } from "lucide-react";

function CoverArtwork({ documentId }: { documentId: string }) {
  const [status, setStatus] = useState<"pending" | "loaded" | "missing">("pending");
  const checkImage = useCallback((image: HTMLImageElement | null) => {
    // A cached response can finish before hydration attaches load/error handlers.
    if (image?.complete) setStatus(image.naturalWidth > 0 ? "loaded" : "missing");
  }, []);

  if (status === "missing") return null;
  return (
    // Covers are optional. Keep the fallback visible until artwork has decoded.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={checkImage}
      src={`/api/documents/${encodeURIComponent(documentId)}/cover`}
      alt=""
      loading="lazy"
      className={`absolute inset-0 size-full object-cover ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
      onLoad={event => checkImage(event.currentTarget)}
      onError={() => setStatus("missing")}
    />
  );
}

export function BookCover({ documentId, small = false }: { documentId: string; small?: boolean }) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden border-l-4 border-rust/50 bg-rust/10 text-rust ${small ? "h-20 w-14" : "h-28 w-20"}`}>
      <BookOpen size={small ? 20 : 26} strokeWidth={1.2} />
      <CoverArtwork key={documentId} documentId={documentId} />
    </span>
  );
}
