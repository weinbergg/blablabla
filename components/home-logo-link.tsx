"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function HomeLogoLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href="/"
      className={className}
      onClick={() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }}
    >
      {children}
    </Link>
  );
}
