# Деплой blablablarden

## Почему периодически пропадает дизайн / ломаются разделы

Next.js кладёт CSS/JS в файлы с хешем в имени (`page-a1b2.js`).  
Если на сервере сделать `rm -rf .next && npm run build`, старые хеши
удаляются, а у людей в браузере ещё открыта старая страница → **404 на
чанки** → «Application error», «нет дизайна», «не открывается друзья/книга».

Это не баг React и не «поломка вёрстки» — это несовпадение HTML и файлов
на диске после неаккуратного деплоя.

## Оплата (ЮKassa) после выгрузки

Историческая справка о существующей интеграции. Для текущего обновления настройки магазина, webhook, cron и тарифы **сохраняются**; перечисленное ниже не является инструкцией активировать новые платежи.

В `/var/www/blabla/.env.local` (не в git):

```
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=live_...
PUBLIC_URL=https://blablablarden.ru
CRON_SECRET=случайная-длинная-строка
```

Кабинет ЮKassa → HTTP-уведомления:

`https://blablablarden.ru/api/billing/webhook`

события `payment.succeeded`, `payment.canceled`.

В админке «Монетизация → Настройки»: магазин **Боевой**, «показывать кнопки оплаты» включено. Чеки через ЮKassa — только когда в кабинете включена фискализация (у самозанятого чек идёт из «Мой налог», см. оферту 5.3).

Напоминания и автоплатежи раз в день:

```
0 8 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://blablablarden.ru/api/cron/billing
```

## Подготовка текущего выпуска

Актуальные команды: [docs/release-preparation.md](../docs/release-preparation.md#текущий-путь-готовая-сборка--обновление-основного-сайта). Ветка `redesign-preview` уже опубликована. Сборка на VPS остановилась на проверке доступной памяти, до компиляции и изменения production. Для текущего выпуска использовать `release.sh --prepare` из существующего `git-source`: он проверяет и распаковывает уже загруженный Linux-архив, без повторной сборки или тестового сайта. Исходники функциональности и дизайна архива сверены с текущей версией. `deploy/release-plan.json` фиксирует прежние проверенные миграции; их репетиция уже успешна. После `UPDATE_PREPARED` переключение — `--apply-approved-production`; статус и откат доступны тем же скриптом. Без аргументов deploy ничего не меняет.

`deploy/release.sh --check /offline/source.db /reports /copied/app-root --bootstrap` сохраняет прежний offline-режим. Production-режимы работают только из проверенного private-каталога на VPS под root. `git pull main`, db:push с подавлением ошибок, массовый pkill и npm ci в работающем приложении не используются. Агент не выполняет push или подключение к VPS; команды выполняет владелец.

## Запрещено на проде

```bash
rm -rf .next && npm run build
pm2 restart … без проверенного snapshot, миграций и согласованного переключения
править nginx location /_next/static на `.next/static` вместо static-assets
```

## Nginx

```nginx
location /_next/static/ {
    alias /var/www/blabla/static-assets/;
    # без try_files — ломает пути с [id]
}
```

## Мониторинг после рекламы (без деплоя приложения)

На VPS прямо сейчас:

```bash
# разово
bash /var/www/blabla/deploy/monitor.sh

# каждые 30 секунд
bash /var/www/blabla/deploy/monitor.sh --watch
```

Если скрипта ещё нет на сервере (правки не выгружали) — достаточно:

```bash
uptime; free -h; df -h /
pm2 status
# посетители из nginx (уникальные IP за сегодня)
sudo awk '{print $1}' /var/log/nginx/access.log | sort -u | wc -l
# хиты за последний час (грубо)
sudo tail -n 50000 /var/log/nginx/access.log | awk -v h="$(date -u +%d/%b/%Y:%H)" '$4 ~ h {c++} END{print c+0}'
```

Скрипт показывает: load / RAM / диск, статус pm2, число пользователей в SQLite,
уникальные IP и хиты за 1ч/24ч, топ страниц, HTTP-проверку.
