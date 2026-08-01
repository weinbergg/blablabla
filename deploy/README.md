# Деплой blablablarden

## Почему периодически пропадает дизайн / ломаются разделы

Next.js кладёт CSS/JS в файлы с хешем в имени (`page-a1b2.js`).  
Если на сервере сделать `rm -rf .next && npm run build`, старые хеши
удаляются, а у людей в браузере ещё открыта старая страница → **404 на
чанки** → «Application error», «нет дизайна», «не открывается друзья/книга».

Это не баг React и не «поломка вёрстки» — это несовпадение HTML и файлов
на диске после неаккуратного деплоя.

## Как деплоить (единственный правильный способ)

```bash
cd /var/www/blabla
bash scripts/maintenance.sh on "около 10 минут"   # по желанию
bash deploy/release.sh                            # или: npm run deploy
bash scripts/maintenance.sh off
```

`deploy/release.sh`:

1. Собирает в `.next-building` (живой `.next` не трогает)
2. Копирует хеши в `static-assets/` (накопительно; nginx отдаёт оттуда)
3. Атомарно подменяет `.next`
4. Перезапускает pm2
5. Проверяет, что CSS отдаётся с HTTP 200

`deploy/fix-static.sh` — просто вызываёт `release.sh`.

## Запрещено на проде

```bash
rm -rf .next && npm run build
pm2 restart … без release.sh
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
