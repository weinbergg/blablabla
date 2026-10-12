import type { ReactNode } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";

export type LegalTocItem = { id: string; number: string; title: string };

export type LegalFact = { label: string; value: ReactNode };

export function LegalShell({
  kicker,
  title,
  subtitle,
  revisedAt,
  facts,
  toc,
  related,
  children,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  revisedAt: string;
  facts?: LegalFact[];
  toc: LegalTocItem[];
  related: { href: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <p className="eyebrow mb-3">{kicker}</p>
        <h1 className="max-w-3xl font-serif text-4xl tracking-tight md:text-5xl">{title}</h1>
        {subtitle ? <p className="mt-4 max-w-2xl text-base leading-7 text-muted">{subtitle}</p> : null}
        <p className="mt-3 text-sm text-muted">Редакция от {revisedAt}</p>

        {facts && facts.length > 0 ? (
          <dl className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label} className="bg-paper px-5 py-4">
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted">{fact.label}</dt>
                <dd className="mt-1 text-sm leading-6">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-12 grid gap-12 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav className="lg:sticky lg:top-8 lg:self-start" aria-label="Содержание">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted">Содержание</p>
            <ol className="space-y-1.5 text-sm">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-muted transition-colors hover:text-ink">
                    <span className="font-mono text-[11px] text-rust">{item.number}</span> {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="legal-prose max-w-2xl">{children}</article>
        </div>

        {related.length > 0 ? (
          <aside className="mt-16 max-w-2xl border-t border-ink/10 pt-8 lg:ml-[14rem] lg:pl-12">
            <p className="eyebrow mb-3">Рядом</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {related.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="underline underline-offset-2 hover:text-rust">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}

export function LegalSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-ink/10 py-10 first:border-t-0 first:pt-0">
      <h2 className="font-serif text-2xl tracking-tight">
        <span className="mr-2 font-mono text-sm text-rust">{number}</span>
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-[1.02rem] leading-7">{children}</div>
    </section>
  );
}

export function LegalClause({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p>
      <span className="mr-2 font-mono text-xs text-muted">{n}</span>
      {children}
    </p>
  );
}

export function LegalList({ items }: { items: { n: string; text: ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.n} className="flex gap-3">
          <span className="mt-0.5 w-12 shrink-0 font-mono text-xs text-muted">{item.n}</span>
          <span>{item.text}</span>
        </li>
      ))}
    </ol>
  );
}

export function LegalTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="space-y-3 md:space-y-0">
      <div className="hidden overflow-x-auto rounded-xl border border-ink/10 md:block">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 bg-ink/[0.03] text-[11px] font-semibold uppercase tracking-widest text-muted">
              {columns.map((column) => (
                <th key={column} className="px-3 py-2.5 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-ink/10 last:border-b-0 align-top">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-3 leading-6">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((row, index) => (
          <li key={index} className="rounded-xl border border-ink/10 p-4">
            <dl className="space-y-3">
              {columns.map((column, cellIndex) => (
                <div key={column}>
                  <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted">{column}</dt>
                  <dd className="mt-1 text-sm leading-6">{row[cellIndex]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Mail({ children }: { children: string }) {
  return (
    <a href={`mailto:${children}`} className="underline underline-offset-2 hover:text-rust">
      {children}
    </a>
  );
}
