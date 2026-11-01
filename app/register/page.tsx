import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/register-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  if (await getCurrentUser()) {
    redirect("/");
  }
  const { code } = await searchParams;

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
        <section className="border border-ink/10 p-8 md:p-10">
          <p className="font-serif text-2xl italic tracking-tight">blablablarden</p>
          <p className="eyebrow mb-3 mt-8">Регистрация</p>
          <h1 className="display">Присоединиться</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Создайте аккаунт, чтобы читать с полки, писать в обсуждениях и
            добавлять друзей. Роль бустера выдаёт только администратор.
          </p>
          <RegisterForm inviteCode={code} />
          <p className="mt-6 text-center text-sm text-muted">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="font-medium text-ink underline">
              Войти
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
