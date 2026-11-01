# Архитектура Blabla

> Ниже сохранён снимок архитектуры аудита. Дополнения социальных разделов 20–21 октября: версионированные блоки в существующем `channel_posts.body + content_json`, централизованные права редакции, комнаты на `seminars + forum_posts`, дополнительные `text_anchor` без замены координат, `site_settings.feature_flags`. Новые изменения схемы выполняются только явными миграциями `lib/db/migrations.ts`; приложение их автоматически не применяет. Подробности и проверенный порядок продолжения — [implementation-progress.md](./implementation-progress.md).

## Модули и потоки

Приложение — один Next.js App Router процесс. Server Components в `app/**/page.tsx` читают Drizzle-запросы из `lib/db`; клиентские компоненты вызывают REST Route Handlers `app/api/**`. Состояние — React hooks/props, чтение и закладки — localStorage, офлайн-книги — IndexedDB. Отдельного backend/state framework нет.

- **Каталог:** categories, authors, documents, tags, works/editions, вторичные категории; главная и library-search получают метаданные всего каталога. Это потенциальный объём RSC/JS при росте фонда, а не основание внедрять кеш без измерений.
- **Книги:** upload/staged-upload/bulk-import → `public/uploads` + metadata SQLite; `/api/files/[id]` проверяет доступ/квоту, поддерживает Range и production X-Accel-Redirect. Прямой `/uploads` закрывается middleware/nginx. DjVu конвертируется `ddjvu`.
- **Читалка:** `DocumentWorkspace` динамически загружает PDF/EPUB/TXT, управляет страницей, обсуждениями, полноэкранным режимом, второй книгой. pdf.js создаёт canvas/text layer, epub.js — iframe/rendition/spine, TXT — декодирование и разбиение текста. Общие AnnotationLayer, MarksDock, SelectionLookup.
- **Аннотации:** `documentId + page + x/y + anchorText + anchorRects`, visibility public/private, allowDiscussion. Существуют поля ссылки на параллельный текст. Версии текста/контекста/устойчивого смещения в схеме нет. Нельзя мигрировать существующие anchors без сопоставления.
- **Центральная цепочка:** файл → текст reader → Selection/Range → цитата + geometry → annotations API → SQLite → discussion comments с annotationId → share-message/друзья/канал. Сейчас страницы/цитаты в публикациях представлены через текст/ссылки, единой типизированной модели блоков и точных якорей публикации нет.
- **Общение:** comments и replies к книге/пометке; forum_topics/posts, watches/reactions; channels/posts/comments/moderators/follows; direct messages и friendships. Таблица наличествует не всегда означает завершённый интерфейс. История обсуждений и текущие API должны сохраняться.
- **Доступ:** случайный session token, SQLite sessions, HttpOnly SameSite=Lax cookie, scrypt password; user roles + entitlement guards. Оплаты и квоты связаны с тарифом; отдельные новые проверки не должны обходить существующие ограничения.
- **Медиа:** community-uploads вне public, MIME/сигнатуры/лимиты, привязка к сообщениям. Выдача/marks/derive используют общую `community-access` policy по видимости родителя и правам пользователя; неизвестные/отсутствующие родители закрыты. При расширении публикаций/билетных комнат эту матрицу доступа необходимо расширять вместе с родительской моделью.
- **Админка/мониторинг:** users/invites, moderation/reports, billing/events, activity_events, music. Уведомления частичные (непрочитанные личные сообщения, заявки дружбы, watches); общей очереди уведомлений нет.
- **Интерфейс:** Tailwind 4, CSS tokens `--paper/ink/muted/rust/card`, Lucide, KaTeX. Собственные компоненты, нет внешней большой UI-библиотеки. Source Sans/Serif загружаются через next/font/google.
- **Развёртывание:** Next + один PM2 process + nginx; release.sh собирает staging и накапливает hashed static assets. Production не затрагивался.

## Надёжность и долг

SQLite работает в WAL, foreign_keys ON; better-sqlite3 по умолчанию задаёт busy_timeout 5000 ms (проверено). Многие таблицы создаются и колонки добавляются при импорте `lib/db/client.ts`, ошибки подавляются. Порядок ensureColumn/ensureTable на новой БД рискован: это не полноценные версионированные миграции. В этом проходе схема не изменяется.

В репозитории не найден проверенный процесс резервного копирования/восстановления. Для WAL нужна backup API либо согласованный snapshot, не копирование только app.db. Нужен отдельный restore drill на временной базе. Перенос на PostgreSQL оправдан при измеренном росте SQLITE_BUSY/времени ожидания записи, необходимости нескольких пишущих экземпляров или HA; размер каталога сам по себе не основание.

Крупные компоненты DocumentWorkspace/AnnotationLayer и похожие fetch-мутации повышают риск рассогласования состояний. Исправления должны закреплять failure states и доступ к данным, а не дробить всё ради косметики. Нужны замеры p95 API/записи, времени открытия больших книг, количества запросов/объёма payload до новых кешей.

В текущем проходе выделены общие captureSelectionAnchor, commentRequest и useCommentDraft: область выделения ограничена книгой, состояние UI обновляется после подтверждения сервера, черновик привязан к пользователю и ветке. Regression suite проверяет формы отказов и права в изолированной SQLite; браузерные сценарии работают с отдельной копией БД. Это не добавляет серверной идемпотентности при потере уже успешного ответа.

Безопасность: React text rendering и KaTeX ограничивают часть XSS-поверхности; критичны приватность комментариев/медиа и серверные object permissions. Отсутствие raw SQL конкатенации пользовательского текста в просмотренных запросах не заменяет полный аудит. Лимиты спама/идемпотентность и атомарность публикация+attachments остаются отдельными задачами.
