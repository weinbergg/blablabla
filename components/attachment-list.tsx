"use client";

import { useState } from "react";
import { AttachmentViewer, type ViewerFile } from "@/components/attachment-viewer";

export type ShownAttachment = ViewerFile;

export function AttachmentList({
  items,
  canEdit = false,
}: {
  items: ShownAttachment[];
  canEdit?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (items.length === 0) return null;
  const open = items.find((item) => item.id === openId) ?? null;

  return (
    <div className="mt-4 space-y-3">
      {items.map((item) => {
        const src = `/api/community/files/${item.id}`;
        if (item.kind === "image") {
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenId(item.id)}
              className="block max-w-full text-left"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={item.name}
                className="max-h-80 max-w-full border border-ink/10 object-contain"
              />
              <span className="mt-1 block text-[11px] text-muted">Открыть снимок</span>
            </button>
          );
        }
        if (item.kind === "video") {
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenId(item.id)}
              className="block w-full text-left"
            >
              <video src={src} className="max-h-80 w-full border border-ink/10" />
              <span className="mt-1 block text-[11px] text-muted">Открыть видео</span>
            </button>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenId(item.id)}
            className="block text-sm underline underline-offset-2 hover:text-rust"
          >
            {item.name}
          </button>
        );
      })}
      {open ? <AttachmentViewer item={open} canEdit={canEdit} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
