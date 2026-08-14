import { Header } from "@/components/header";
import { FeedbackForm } from "@/components/feedback-form";
import { getCurrentUser } from "@/lib/auth";
import { getFeedbackForUser } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  const ownItems = user ? await getFeedbackForUser(user.id) : [];

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
            {user
              ? " Ответ придёт в личные сообщения и появится ниже."
              : " Если оставите контакт, мы сможем ответить."}
          </p>
          <FeedbackForm isLoggedIn={Boolean(user)} />

          {ownItems.length > 0 && (
            <section className="mt-10 space-y-3">
              <p className="eyebrow">Ваши сообщения</p>
              {ownItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-ink/10 p-4 text-sm">
                  <p className="mb-1.5 text-xs text-muted">
                    {new Date(item.createdAt).toLocaleString("ru-RU")}
                    {item.status === "resolved" ? " · решено" : item.adminReply ? " · есть ответ" : ""}
                  </p>
                  <p className="whitespace-pre-wrap leading-6">{item.body}</p>
                  {item.adminReply && (
                    <div className="mt-3 rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2.5">
                      <p className="mb-1 text-[11px] text-muted">
                        Ответ
                        {item.repliedAt ? ` · ${new Date(item.repliedAt).toLocaleString("ru-RU")}` : ""}
                      </p>
                      <p className="whitespace-pre-wrap leading-6">{item.adminReply}</p>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      </main>
    </>
  );
}
