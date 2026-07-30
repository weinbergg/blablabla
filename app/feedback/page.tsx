import { Header } from "@/components/header";
import { FeedbackForm } from "@/components/feedback-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const user = await getCurrentUser();

  return (
    <>
      <Header />
      <main className="shell py-12 md:py-16">
        <div className="mx-auto max-w-xl">
          <p className="eyebrow mb-3">Обратная связь</p>
          <h1 className="font-serif text-4xl tracking-tight md:text-5xl">Вопросы и предложения</h1>
          <p className="mt-4 mb-8 text-sm leading-6 text-muted">
            Замечания по каталогу, находкам, идеи новых разделов или просто отзыв о том, как всё
            устроено, — пишите сюда напрямую.
          </p>
          <FeedbackForm isLoggedIn={Boolean(user)} />
        </div>
      </main>
    </>
  );
}
