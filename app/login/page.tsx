import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Вернуться в библиотеку
        </Link>
        <section className="rounded-3xl border border-ink/10 bg-white/50 p-8 shadow-[0_24px_80px_rgba(25,31,40,0.08)] backdrop-blur md:p-10">
          <span className="grid size-11 place-items-center rounded-full bg-ink font-serif text-2xl italic text-paper">
            b.
          </span>
          <p className="eyebrow mb-3 mt-8">Вход</p>
          <h1 className="font-serif text-4xl tracking-tight">С возвращением</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Аккаунт нужен, чтобы комментировать, оставлять пометки и
            редактировать описания книг.
          </p>
          <LoginForm />
          <p className="mt-6 text-center text-sm text-muted">
            Нет аккаунта?{" "}
            <Link href="/register" className="font-medium text-ink underline">
              Зарегистрироваться по приглашению
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
