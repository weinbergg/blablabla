# Временная тестовая среда Blabla

**29 октября: проверка полных HTML на VPS прошла: NEXT 200 / 36500 байт / 109 мс, GATE 200 / 36500 байт / 96 мс, LOGIN 200 / 13129 байт / 85 мс. Повторять её и настройку Quick Tunnel не нужно. Внешняя браузерная приёмка не пройдена; причина зависания вне этих проверенных локальных запросов ещё не установлена. Владелец также сообщил о проблеме DNS основного домена после потери хостинга. Продолжаем обычную подготовку обновления: inventory и Backup API реальной SQLite по [release-preparation.md](release-preparation.md).** Все команды VPS выполняет владелец; агент не подключается. Production deploy, изменения nginx, боевые миграции и git push не выполнялись.

## Зависание после внешней авторизации — 29 октября

Ранее NEXT_HTTP=200 проверял только `/api/features`, а gate 401 — отказ без авторизации. Дополнительная проверка главной напрямую, через gate с авторизацией и `/login` **выполнена владельцем и прошла**, результаты указаны выше. Пароль читает сама команда и передаёт только по loopback, в вывод попадают статус, объём и время; приложение не перезапускается, production не затрагивается. Каждый запрос ограничен 10 секундами, включая чтение тела ответа.

Выполненная команда (не повторять):

```bash
/usr/bin/node <<'NODE'
const fs = require('node:fs');
const c = JSON.parse(fs.readFileSync('/srv/blabla-test/app/data/test-credentials.json', 'utf8')).find(u => u.role === 'admin');
const headers = { Authorization: 'Basic ' + Buffer.from(c.gateUser + ':' + c.gatePassword).toString('base64') };
(async () => {
  for (const [name, url, auth] of [
    ['NEXT', 'http://127.0.0.1:3001/', {}],
    ['GATE', 'http://127.0.0.1:3301/', headers],
    ['LOGIN', 'http://127.0.0.1:3301/login', headers],
  ]) {
    const start = Date.now();
    try {
      const r = await fetch(url, { headers: auth, redirect: 'manual', signal: AbortSignal.timeout(10000) });
      const bytes = (await r.arrayBuffer()).byteLength;
      console.log(`${name}: HTTP ${r.status}, ${bytes} bytes, ${Date.now() - start} ms`);
    } catch (e) { console.log(`${name}: ${e.name}, ${Date.now() - start} ms`); }
  }
})().catch(() => { console.error('CHECK_FAILED'); process.exitCode = 1; });
NODE
```

NEXT/GATE/LOGIN вернули полные HTML с 200; зависание не воспроизвелось в этих локальных запросах. Это ещё не проверяет внешнюю доставку и браузерные JS/CSS. Изменять код приложения или gate по предположению не требуется.

Возможный сетевой фактор: Cloudflare [описывает ограничения российских провайдеров примерно до 16 КБ на соединение](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/service-disruption/). Короткое окно авторизации с последующим зависанием совместимо с таким ограничением, но фактическая сеть владельца и причина здесь не подтверждены. Не перебирать настройки туннеля вслепую и не делать доступность Quick Tunnel обязательным условием production-релиза. Репетиция миграций на копии реальной SQLite и проверка основных функций остаются обязательными.

## Что уже известно

По проверке владельца: REG.RU, SSH root, production `/var/www/blabla`, root PM2 `blabla` (fork, online), Next `start`, Node 20.20.2 / npm 10.8.2. RAM 1,9 GiB / available около 1,4 GiB, swap 2 GiB; диск 38 ГБ / свободно 22 ГБ. Next занимает около 244 МБ. База около 11 МБ + WAL 4 МБ; uploads 8,1 ГБ. На VPS версия от 14 октября. Эти сведения получены от владельца, не посредством нашего подключения.

**Полученный preflight, 24 октября:** x86_64, Ubuntu 26.04 LTS, systemd 259.5, cgroup v2 с memory/cpu/pids. RAM 1961 MiB, available **1312 MiB**, swap 2047 MiB свободен полностью; диск 22 ГБ свободно. `/usr/bin/node`, `/usr/bin/npm`, `/usr/bin/pm2-runtime` доступны по PATH. Cloudflared отсутствует. Порты 3001/3301/3302 свободны; `/srv/blabla-test` и пользователь `blabla-test` отсутствуют. Это подходит для Linux amd64 builder; путь PM2 будет дополнительно разрешён через realpath и проверен под отдельным пользователем при старте. Запас до порога 1300 MiB сейчас всего 12 MiB: повторная проверка перед стартом обязательна, отказ не обходить снижением порога.

Новый экземпляр:

| Объект | Изолированное значение |
| --- | --- |
| Каталог / OS-пользователь | `/srv/blabla-test/app` / `blabla-test` без shell |
| Next | `127.0.0.1:3001`, PM2 `blabla-test` |
| Защитный HTTP-прокси | `127.0.0.1:3301`, PM2 `blabla-test-gate` |
| HTTPS | Quick Tunnel **только к 3301**, metrics `127.0.0.1:3302` |
| PM2 | собственный `PM2_HOME=/srv/blabla-test/pm2`, `pm2-runtime` внутри отдельного systemd unit |
| SQLite | `/srv/blabla-test/app/data/app.db`, новая, синтетическая |
| Файлы | собственные `public/uploads`, `data/community-uploads`, `data/music-uploads` |
| Env | allowlist в `deploy/test/runtime.cjs`; никаких production `.env`, SMTP, cron или платёжных ключей |

Второй лёгкий Next для двух тестировщиков **предварительно помещается** в указанные ресурсы. Сборка на этом VPS не предусмотрена. После правки этапа 4 для приложения + PM2 + gate: MemoryHigh 550 MiB, MemoryMax 750 MiB, swap ≤256 MiB, Node heap 384 MiB, CPU ≤75% одного ядра, пониженный приоритет. Для tunnel: RAM ≤128 MiB / swap ≤64 MiB. Перед запуском требуется available ≥1200 MiB, свободный swap ≥512 MiB и диск ≥2 GiB. Расчёт сохраняет прежний резерв: 1200 − 750 − 128 = **322 MiB**, как в исходном профиле 1300 − 850 − 128. Это ограничение теста, а не гарантия отсутствия общей нехватки ресурсов: при росте production-нагрузки тест нужно остановить.

Готовый архив прошёл локальную Linux-проверку в свежем контейнере без сети и host mounts, UID 10001, MemoryMax 850 MiB, CPU 0,75. Вход трёх ролей, книги/Range, private notes и записи данных работают; `oom=0`, `oom_kill=0`. Пик cgroup около 850 MiB, срабатывало освобождение памяти у лимита (включает распаковку/файловый кеш и QEMU). Это не замер нативного VPS, PM2 или tunnel; исходный архив содержит профиль 850/1300. Правка ниже уменьшает и лимит, и порог на 100 MiB, сохраняя резерв; работа приложения при новом лимите ещё проверяется владельцем на VPS. Результаты прежней проверки: `limited-container-state.json`, `limited-runtime-smoke.json`, `limited-container.log` рядом с архивом.

PM2 проверяет память периодически и перезапускает процесс; это не жёсткий предел. За него отвечает отдельный cgroup systemd. Источники: [PM2](https://pm2.keymetrics.io/docs/usage/memory-limit/), [systemd MemoryMax](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html). Скрипт не отключает проверки, если cgroup v2 недоступен.

## Минимальные данные

Ровно три книги, **7 487 863 байта (7,14 МиБ) суммарно**:

- PDF: Эпиктет, *Gnomologium Epicteteum (e Stobaei libris 1–2)*.
- EPUB: Вазари, *Lives of the Most Eminent Painters, Sculptors and Architects* — тот же файл с ранее проверенными проблемами глав/сносок.
- TXT: Архимед, *Geometrical Solutions Derived from Mechanics*.

У каждой записи есть отдельный реальный файл, автор, формат и проверенная цитата с SHA-256 версии. Все три записи библиотеки доступны; отсутствующих файлов и ссылок на production uploads нет. Файлы копируются байтами, без hardlink/symlink.

Три новых аккаунта: admin, booster, member (`@test.invalid`), случайные пароли для приложения и отдельные случайные пароли внешнего доступа. Два авторских канала плюс служебный news-канал в существующей модели: шесть публикаций и три новости; три темы с ответами; шесть пометок, комментарии к книгам/общим пометкам и публикации. Личные пометки принадлежат booster и не видны member. Пользователи, сообщения, настройки, сессии и платежи production не копируются.

`scripts/test-instance.ts` строит пустую схему из текущей Drizzle-модели в памяти, исполняет настоящие три миграции и использует существующий `savePublication`. Ledger содержит фактические выполненные SQL/checksums. SQLite Backup API сохраняет новую БД и проверяемую восстановимую копию `initial-backup.db`. Integrity должен быть `ok`, FK — 0. Повторная инициализация существующего `data` запрещена.

## Этап 1. Только чтение VPS — выполнен

В Termius, в уже открытом соединении root, первый блок:

```bash
uname -m
cat /etc/os-release
systemctl --version | head -1
stat -fc %T /sys/fs/cgroup
cat /sys/fs/cgroup/cgroup.controllers
free -m
df -h / /srv
```

Второй блок:

```bash
for p in node npm pm2-runtime cloudflared; do
  command -v "$p" || true
done
ss -ltnp '( sport = :3001 or sport = :3301 or sport = :3302 )'
ls -ld /srv/blabla-test 2>/dev/null || true
getent passwd blabla-test || true
```

**Контроль:** прислать вывод обоих блоков. Не присылать env, пароли, ключи или `pm2 jlist`. Проверим архитектуру, libc/OS, systemd/cgroups, пути Node/PM2, наличие cloudflared и свободные порты. Если доступен файл `deploy/test/preflight.sh`, он даёт расширенный безопасный отчёт через `bash …/preflight.sh`, не импортируя приложение и не вызывая PM2 daemon.

**Результат получен и разобран**, см. фактические параметры выше. Повторять весь preflight не нужно; перед запуском повторно проверяются доступная память и свободные порты. Сборка остаётся вне VPS.

## Этап 2. Подготовить Linux-артефакт вне VPS

Локальная подготовка исходников:

```bash
node scripts/prepare-test-package.cjs
```

Вывод содержит `source` (временный build context) и закрытый `archive` в `data/implementation-checks/test-package-*/test-source.tar.gz`. Это текущий dirty snapshot с manifest/hash каждого исходника; предыдущий Git HEAD не считается полным составом новой версии. В архив входят нужные новые файлы, три книги и anchors, но не БД, пароли или `.env`. Не отправлять на VPS прежние browser fixtures или `.next-release-check` с macOS.

На отдельном Linux builder / Docker с минимум 4 ГБ памяти. Для подтверждённого VPS выбрана платформа `linux/amd64`:

```bash
docker buildx build --platform linux/amd64 \
  -f /ПУТЬ_ИЗ_SOURCE/deploy/test/Dockerfile \
  --output type=local,dest=/ПУСТОЙ_КАТАЛОГ_АРТЕФАКТОВ /ПУТЬ_ИЗ_SOURCE
```

Dockerfile использует Node 20.20.2/bookworm, `npm ci`, postinstall PDF worker, тесты, полноценный `next build` и runtime smoke. Builder использует glibc старше среды Ubuntu 26.04; точные Node/архитектура/glibc/SQLite записываются в `build-info.json`. Native better-sqlite3 проверяется внутри Linux x64. Для удалённого builder сначала распаковать **source archive** в пустой каталог, не передавать весь рабочий checkout.

Для нашей локальной ARM VM используется Docker context `colima-blabla-test-build`, обновлённый QEMU 10.2.3 и дополнительный аргумент сборки `--build-arg QEMU_GUEST_BASE=0x800000000000`. Без него загрузка неизменённого SWC в контрольном эксперименте завершилась SIGSEGV 3/3 раза; с ним загрузка и компиляция TypeScript прошли 3/3 раза. Похожий конфликт адресного пространства описан в [отчёте Nix/QEMU](https://github.com/NixOS/nix/issues/16184). Аргумент относится только к локальному эмулятору, на нативном amd64 builder и VPS он не нужен. Сборочные проверки не отключаются.

**Сборка 25 октября, проверка 28 октября:** 62/62 tests, tsc, ESLint (0 errors/8 прежних warnings), Next build и Linux runtime smoke прошли. Архив `data/implementation-checks/test-linux-artifact-5GyVmI/blabla-test-linux.tar.gz`: 240 512 208 байта (229 МиБ), распакованный объём около 785 МиБ. SHA256: `6c51386d60a4d7cdc989c699189a46b4dbca4966948c05b39c4bcfa27edc532d`. Рядом `.sha256`, `build-info.json`, `archive-verification.json`, `linux-runtime-smoke.json`. Все 513 исходников, три книги и native SQLite проверены; DB/env/credentials/production uploads в архиве отсутствуют. Свежая распаковка и runtime smoke с ограничением 850 MiB прошли 28 октября без OOM. Браузер того же архива: три роли, PDF/EPUB/TXT, gate, 1440/1024/768/390/320, без переполнения и ошибок JavaScript; снимки 1440/320 просмотрены. Проверены исправление заглушки обложки и загрузка обоих шрифтов. Результат — `browser/result.json` рядом с архивом; все 513 исходников совпадают с рабочим деревом. macOS browser smoke не заменяет проверку Linux-артефакта. [Next.js: self-hosting](https://nextjs.org/docs/15/app/guides/self-hosting).

Фактический локальный рецепт сохранён рядом с архивом в `build.Dockerfile` и `build-recipe.json`. Из-за сетевых сбоев builder использовал прежние Linux-зависимости с совпавшими SHA package.json/lock и локально скачанные настоящие CSS/WOFF2 Google Fonts. Все 13 файлов шрифтов совпали с предыдущей успешной сборкой; `font-cache-verification.json` содержит источники и SHA. Сборка выполнена без сети, все проверки сохранены; исходники приложения/зависимостей не патчились ради сборщика. Кеш шрифтов расположен вне app и не нужен на VPS.

## Этап 3. Отдельный каталог и свежая БД

Только после этапов 1–2. **Место запуска — открытая SSH-сессия VPS**, в Termius либо после выполненного владельцем `ssh root@80.78.248.233` из терминала Mac. Приглашение сервера — `root@cv7759117:~#`. Приглашение `georgij@MacBook-Air-3 … %` означает локальный Mac. Переход в `Desktop/blabla` не подключает к VPS; запускать этот блок через sudo на Mac не нужно.

Сначала проверить открытое соединение:

```bash
hostname
uname -s
id -un
id -u
```

**Контроль получен от владельца:** `cv7759117.novalocal`, `Linux`, `root`, `0`. SSH-сессия подтверждена; повторять эту проверку в текущей сессии не нужно. Далее создать только тестовые каталоги; существующий экземпляр не перезаписывать:

```bash
bash <<'BLABLA_TEST_SETUP'
set -euo pipefail
if [ "$(uname -s)" != Linux ] || [ "$(id -u)" != 0 ]; then
  echo 'STOP: run this block in the VPS SSH session as root, not on the Mac.'
  exit 1
fi
if getent passwd blabla-test >/dev/null || getent group blabla-test >/dev/null || [ -e /srv/blabla-test ] || [ -L /srv/blabla-test ]; then
  echo 'STOP: test user, group or directory already exists; do not overwrite.'
  exit 1
fi
useradd --system --user-group --home-dir /srv/blabla-test --no-create-home --shell /usr/sbin/nologin blabla-test
install -d -m 700 -o blabla-test -g blabla-test /srv/blabla-test
install -d -m 700 -o blabla-test -g blabla-test /srv/blabla-test/app /srv/blabla-test/incoming /srv/blabla-test/reports /srv/blabla-test/pm2
ls -ld /srv/blabla-test /srv/blabla-test/app
BLABLA_TEST_SETUP
```

**Создание подтверждено владельцем:** `/srv/blabla-test` и `/srv/blabla-test/app` имеют права `drwx------`, владелец и группа `blabla-test`. Setup повторять не нужно.

**Загрузка выполняется на Mac.** Оставить SSH-вкладку открытой и открыть новую локальную вкладку терминала (`⌘T`), с приглашением `georgij@MacBook-Air-3 … %`. Выполнить одну команду:

```bash
scp \
  /Users/georgij/Desktop/blabla/data/implementation-checks/test-linux-artifact-5GyVmI/blabla-test-linux.tar.gz \
  /Users/georgij/Desktop/blabla/data/implementation-checks/test-linux-artifact-5GyVmI/blabla-test-linux.tar.gz.sha256 \
  root@80.78.248.233:/srv/blabla-test/incoming/
```

Передаются только архив около 229 МиБ и файл SHA; локальная контрольная сумма проверена. Альтернатива — загрузить эти же два файла через SFTP в Termius в `/srv/blabla-test/incoming`.

**Загрузка подтверждена владельцем:** архив 229 MiB и файл SHA 91 байт переданы на 100%, вернулось приглашение Mac. Повторять загрузку не нужно. Следующий блок проверки и распаковки также уже выполнен в SSH-сессии `root@cv7759117:~#`; сохранён для воспроизводимости:

```bash
bash <<'BLABLA_TEST_UNPACK'
set -euo pipefail
if [ "$(uname -s)" != Linux ] || [ "$(id -u)" != 0 ]; then
  echo 'STOP: run this block in the VPS SSH session as root, not on the Mac.'
  exit 1
fi
cd /srv/blabla-test/incoming
if [ -n "$(ls -A /srv/blabla-test/app)" ]; then
  echo 'STOP: test app directory is not empty; do not overwrite.'
  exit 1
fi
printf '%s  %s\n' '6c51386d60a4d7cdc989c699189a46b4dbca4966948c05b39c4bcfa27edc532d' 'blabla-test-linux.tar.gz' | sha256sum -c -
sha256sum -c blabla-test-linux.tar.gz.sha256
chown blabla-test:blabla-test blabla-test-linux.tar.gz
runuser -u blabla-test -- tar --no-same-owner -xzf blabla-test-linux.tar.gz -C /srv/blabla-test/app
test -s /srv/blabla-test/app/.next/BUILD_ID
test ! -e /srv/blabla-test/app/data
test ! -e /srv/blabla-test/app/public/uploads
du -sh /srv/blabla-test/app
echo 'UNPACK_OK'
BLABLA_TEST_UNPACK
```

**Распаковка подтверждена владельцем:** две строки `blabla-test-linux.tar.gz: OK`, `904M /srv/blabla-test/app`, `UNPACK_OK`. SHA совпал с локальным артефактом; проверки отсутствия `app/data` и `public/uploads`, наличия `.next/BUILD_ID` прошли. Повторять распаковку не нужно. На VPS не выполнять `npm ci`, `npm run build`, `db:push`, `db:seed` или старый production `ecosystem.config.cjs`.

**Инициализация уже выполнена владельцем.** Блок сохранён для воспроизводимости; повторять его не нужно. Он запускает существующий инициализатор от `blabla-test` с очищенным окружением. Путь Node вычисляется из проверенного preflight; runtime внутри `/root` или production не подходит:

```bash
bash <<'BLABLA_TEST_INIT'
set -euo pipefail
if [ "$(uname -s)" != Linux ] || [ "$(id -u)" != 0 ]; then
  echo 'STOP: требуется SSH-сессия VPS под root.'
  exit 1
fi
cd /srv/blabla-test/app
BLABLA_TEST_NODE="$(readlink -f "$(command -v node)")"
case "$BLABLA_TEST_NODE" in
  /root/*|/var/www/blabla/*)
    echo 'STOP: Node должен быть доступен вне production и /root.'
    exit 1
    ;;
esac
runuser -u blabla-test -- env -i PATH="$(dirname "$BLABLA_TEST_NODE"):/usr/bin:/bin" HOME=/srv/blabla-test \
  "$BLABLA_TEST_NODE" --import tsx scripts/test-instance.ts /srv/blabla-test/app /srv/blabla-test/app/test-books
echo 'INIT_OK'
BLABLA_TEST_INIT
```

**Результат получен:** instanceId `9aa1a3ba-0493-439e-b6ab-140deef6e087`; 3 users / 3 documents / 2 authorChannels / 1 newsChannels / 9 posts / 6 annotations / 6 comments / 3 topics, `bookBytes: 7487863`, затем `INIT_OK`. Инициализатор завершил проверки integrity/FK и резервной копии. Создание не требует production DB и не запускает приложение. Пароли находятся только в `data/test-credentials.json` (600); gate хранит хеши. Не отправлять файл в чат и не включать в архивы релиза. Начальные папки и БД самостоятельные; приложение откажется работать с foreign DATABASE_PATH, `.env`, симлинками или hardlink БД/книг.

**Контроль изоляции перед запуском уже выполнен владельцем.** Блок сохранён для воспроизводимости; повторять его не нужно. Production открывается read-only отдельным диагностическим скриптом, без импорта приложения. Сам тестовый экземпляр к production SQLite не подключается:

```bash
bash <<'BLABLA_TEST_BASELINE'
set -euo pipefail
if [ "$(uname -s)" != Linux ] || [ "$(id -u)" != 0 ]; then
  echo 'STOP: требуется SSH-сессия VPS под root.'
  exit 1
fi
umask 077
cd /srv/blabla-test/app
BLABLA_TEST_NODE="$(readlink -f "$(command -v node)")"
if [ -e /srv/blabla-test/reports/before.json ] || [ -L /srv/blabla-test/reports/before.json ]; then
  echo 'STOP: исходный отчёт уже существует; не перезаписываем.'
  exit 1
fi
env -i PATH="$(dirname "$BLABLA_TEST_NODE"):/usr/bin:/bin" HOME=/srv/blabla-test \
  "$BLABLA_TEST_NODE" deploy/test/isolation-report.cjs /var/www/blabla/data/app.db \
  > /srv/blabla-test/reports/before.json
cat /srv/blabla-test/reports/before.json
free -m
ss -ltnp '( sport = :3001 or sport = :3301 or sport = :3302 )'
echo 'BASELINE_SAVED'
BLABLA_TEST_BASELINE
```

**Результат получен:** `BASELINE_SAVED`; testUsersInProduction и все шесть userContentInProduction = 0, testIntegrity `ok`, testForeignKeys = 0, fileIsolation true. ProductionSettingsSha256: `a81f3cdd82da9d2f7ae0cb63af81b85851a9399d6344f7d74692f3830ee713c5`. Исходный `/srv/blabla-test/reports/before.json` сохранить для сравнения после тестовых записей, не перезаписывать. Порты 3001/3301/3302 свободны. RAM: available **1252 MiB**, used 709 MiB; swap: used 87 MiB / free 1960 MiB. Условия изоляции выполнены; условие запуска по памяти пока не выполнено.

## Этап 4. Запуск только на loopback

**Проверка памяти выполнена владельцем.** Исходный профиль 850/1300 не проходил по available RAM, поэтому были запрошены:

```bash
free -m
ps -eo pid,user,rss,comm --sort=-rss | head -n 16
vmstat 1 5
cat /proc/pressure/memory
```

**Получено:** available RAM 1259 MiB, swap free 1960 MiB; четыре текущих интервала `si=so=0`, CPU idle 99–100%, memory PSI avg10/60/300 = 0. Основные RSS: production Next 284804 KiB, journald 97920 KiB, fail2ban 53576 KiB, production PM2 45020 KiB. Признаков текущего давления на память в этом снимке нет; останавливать перечисленные службы не требуется. Production не перезапускать, системный кеш не очищать.

**Правка лимита и запуск выполнены владельцем; повторять блок не нужно.** Только тестовый `deploy/test/start.sh`: 850 → 750 MiB max, 650 → 550 MiB high, 1300 → 1200 MiB порог. Резерв 450 MiB за пределами основного тестового unit сохранён. Локально проверены 6 сценариев запуска: граница RAM, текущий объём, отказы по RAM/swap/диску/порту, сохранение ограничений systemd; это проверка команд запуска с подменёнными системными вызовами, не фактический запуск systemd на Mac. Новая сборка Next не нужна. Исходный архив остаётся прежним; единственное изменение поставленного runtime-файла явно проверяется по SHA ниже. При неизвестной версии скрипта блок откажет.

```bash
bash <<'BLABLA_TEST_START'
set -euo pipefail
test "$(uname -s)" = Linux
test "$(id -u)" = 0
cd /srv/blabla-test/app
BLABLA_TEST_NODE="$(readlink -f "$(command -v node)")"
BLABLA_TEST_PM2="$(readlink -f "$(command -v pm2-runtime)")"
runuser -u blabla-test -- env -i PATH=/usr/bin:/bin "$BLABLA_TEST_NODE" <<'NODE'
const fs = require('node:fs'), crypto = require('node:crypto');
const file = 'deploy/test/start.sh', source = fs.readFileSync(file, 'utf8');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const expected = '231f53b9705e8d701f90f3d368c31598e42e55ca54c8f773d712ebb8c02007b1';
if (sha(source) !== expected) {
  if (sha(source) !== 'ca0cf1d48d861bb99176c14a54598d00471560f457b91df7a978813623074c45') throw Error('STOP: unexpected start.sh');
  const updated = source.replace('if [ "$available_kib" -lt 1331200 ]; then', '# 750 MiB app/PM2/gate + 128 MiB tunnel + 322 MiB headroom = 1200 MiB.\nif [ "$available_kib" -lt 1228800 ]; then').replace('at least 1300 MiB', 'at least 1200 MiB').replace('MemoryHigh=650M --property=MemoryMax=850M', 'MemoryHigh=550M --property=MemoryMax=750M');
  if (sha(updated) !== expected) throw Error('STOP: patch verification failed');
  fs.writeFileSync(file, updated);
}
console.log('MEMORY_PROFILE_OK');
NODE
bash deploy/test/start.sh --reviewed-preflight "$BLABLA_TEST_NODE" "$BLABLA_TEST_PM2"
sleep 8
systemctl show blabla-test -p ActiveState -p SubState -p Result -p MemoryCurrent -p MemoryMax -p User
ss -ltnp '( sport = :3001 or sport = :3301 )'
curl --max-time 10 -s -o /dev/null -w 'NEXT_HTTP=%{http_code}\n' http://127.0.0.1:3001/api/features
curl --max-time 5 -s -o /dev/null -w 'GATE_HTTP=%{http_code}\n' http://127.0.0.1:3301/
free -m
BLABLA_TEST_START
```

**Результат получен:** `MEMORY_PROFILE_OK`; unit `blabla-test.service` active/running, Result success, User blabla-test. MemoryCurrent **225849344 байта (~215 MiB)**, MemoryMax **786432000 (750 MiB)**. Next PID 44504 слушает только 127.0.0.1:3001, gate PID 44505 — только 127.0.0.1:3301. **NEXT_HTTP=200, GATE_HTTP=401**. После старта available RAM 1080 MiB, swap free 1959 MiB / used 88 MiB. Запуск под новым лимитом подтверждён; браузерная приёмка через HTTPS ещё впереди. При OOM тестовый unit настроен завершаться, без автоматического перезапуска приложения.

Systemd создаёт временный unit; отдельный `pm2-runtime` запускается от `blabla-test` со своим PM2_HOME. Root PM2 `blabla` не вызывается. `InaccessiblePaths=/var/www/blabla` закрывает production-каталог внутри тестового процесса; ProtectSystem/ReadWritePaths разрешают запись только в собственное окружение. [systemd filesystem protection](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html).

Проверить до открытия tunnel:

```bash
ss -ltnp '( sport = :3001 or sport = :3301 )'
curl --max-time 5 -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3301/
curl --max-time 5 -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3301/uploads/book.pdf
curl --max-time 5 -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3301/api/documents/anything
```

**Контроль:** оба адреса ровно `127.0.0.1`, все три HTTP = **401**. Если 3001/3301 доступны на `0.0.0.0`/`::`, остановить тест. 502 после внешнего входа означает, что Next ещё не запущен/завершился; читать только test logs, не перезапускать production.

## Этап 5. HTTPS через Quick Tunnel

Установлен отдельный бинарник **2026.10.3 linux-amd64**, SHA-256: `053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0`. Источник — [официальный выпуск Cloudflare](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.3). Владелец выполнил `bash deploy/test/install-cloudflared.sh`: скрипт повторно проверил checksum и установил только `/srv/blabla-test/bin/cloudflared`. APT, системный сервис и существующие tunnels не затрагиваются. Повторять installer не нужно.

**Установка и запуск tunnel выполнены владельцем; блок не повторять.** Перед установкой прошли проверки 401 для главной, API и файлов:

```bash
bash <<'BLABLA_TEST_HTTPS'
set -euo pipefail
test "$(uname -s)" = Linux
test "$(id -u)" = 0
cd /srv/blabla-test/app
for route in / /api/features /uploads/book.pdf; do
  code="$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3301$route")"
  if [ "$code" != 401 ]; then
    echo "STOP: gate $route returned $code, expected 401"
    exit 1
  fi
done
bash deploy/test/install-cloudflared.sh
bash deploy/test/tunnel.sh --gate-verified /srv/blabla-test/bin/cloudflared
sleep 8
systemctl show blabla-test-tunnel -p ActiveState -p SubState -p Result -p MemoryCurrent -p MemoryMax -p User
journalctl -u blabla-test-tunnel -n 40 --no-pager
free -m
BLABLA_TEST_HTTPS
```

**Получено 28 октября, 17:52 UTC:** установлен cloudflared 2026.10.3 с ожидаемым checksum; `blabla-test-tunnel.service` active/running, Result success, User blabla-test. MemoryCurrent 17317888 байт (~16,5 MiB), MemoryMax 134217728 (128 MiB). `Registered tunnel connection`, QUIC, location dme05. URL: **https://winds-jesus-boards-application.trycloudflare.com**. Metrics 127.0.0.1:3302, upstream 127.0.0.1:3301. Available RAM 1084 MiB, swap free 1959 MiB / used 88 MiB. Сообщение об отсутствии config.yml не остановило запуск: следом зарегистрировано соединение.

Tunnel направлен только на защищённый 3301. Unit связан с `blabla-test.service` и останавливается вместе с ним. Никаких DNS/nginx/certbot изменений. Quick Tunnel выдаёт временный адрес `https://…trycloudflare.com`, который перестаёт работать при остановке процесса. URL не является паролем; защиту обеспечивает наш gate. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

**Контроль с другого устройства ещё ожидается:** открыть выданный URL в приватном окне — сначала должен появиться запрос логина/пароля браузера. Без них главная, `/uploads/book.pdf` и `/api/features` должны возвращать 401. После gate открывается приложение, внутри него требуется обычный вход. Проверить действительный HTTPS, загрузку CSS/JS, книги, повторный вход после обновления страницы. Сообщить только результат или текст ошибки, без учётных данных. Адрес уже получен; работа браузера через HTTPS ещё не подтверждена.

## Этап 6. Второй тестировщик и приёмка

**Текущий шаг для владельца:** в собственной SSH-сессии root вывести только тестовый admin. Вывод содержит пароли — не отправлять его в чат:

```bash
/usr/bin/node -e 'console.log(JSON.stringify(require("/srv/blabla-test/app/data/test-credentials.json").find(u => u.role === "admin"), null, 2))'
```

На Mac или телефоне открыть **https://winds-jesus-boards-application.trycloudflare.com** в приватном окне. Первый запрос браузера: `gateUser` / `gatePassword`. После открытия сайта нажать «Войти»: `email` / `password`. Затем открыть библиотеку и одну тестовую книгу. Сообщить только, удалось ли войти и открыть книгу; пароли не пересылать. Пока tunnel работает, SSH-сессию можно закрывать: сервисы запущены через systemd.

Каждому — собственные учётные данные. Владелец в приватном Termius читает только выбранный аккаунт, например booster:

```bash
cd /srv/blabla-test/app
BLABLA_TEST_NODE="$(readlink -f "$(command -v node)")"
"$BLABLA_TEST_NODE" -e 'console.log(JSON.stringify(require("./data/test-credentials.json").find(u=>u.role==="booster"),null,2))'
```

Передать тестировщику через личный канал: временный HTTPS URL, `gateUser/gatePassword` для первого окна, `email/password` для входа в приложение. Admin оставить владельцу. Не использовать пароль от основного сайта. Не загружать личные документы или платёжные данные. Для смены тестового аккаунта/внешнего логина удобнее отдельное приватное окно: браузер кеширует Basic Auth.

**Приоритет приёмки от 28 октября:** рабочие основные функции. Дополнительный редизайн отложен. Обязательны вход, доступ к библиотеке, PDF/EPUB/TXT, сохранение пометок/комментариев/публикаций и их восстановление после перезагрузки. Небольшие визуальные недочёты фиксируем отдельно. Проблемный дополнительный раздел можно отключить в тестовой админке `/admin/features`: режим `off` закрывает интерфейс и серверные операции, сохраняя данные. На production настройки этим сценарием не меняются.

Короткий сценарий для второго тестировщика:

1. Открыть PDF, EPUB Вазари и TXT. В EPUB проверить главы, сноски и возврат назад; все три файла доступны независимо от production.
2. Под booster создать общую и личную пометку, ответить на комментарий, опубликовать цитату в «На полях», перейти к источнику и перезагрузить страницу.
3. Под member в отдельном окне читать/комментировать, убедиться, что чужая личная пометка недоступна, редактирование канала/админка запрещены.
4. Проверить канал и ленту: публикация, комментарий и повторное открытие. Новости, форум и комнаты проверять по мере включения; незавершённые разделы временно скрыть через Feature Flags. Платёжные `/api/billing`, `/api/admin/billing`, `/api/events/checkout` и cron заблокированы gate; это ожидаемо. Реальные покупки не тестировать.
5. На компьютере и телефоне проверить доступность основных кнопок, клавиатуру, выделение и переходы. Автоматические снимки на 1440/1024/768/390/320 дополняют проверку на реальном Safari/Android. Для ошибки записать URL, шаги и ожидаемое/фактическое поведение; скриншот без паролей.

После записи тестовых данных повторить read-only контроль:

```bash
umask 077
cd /srv/blabla-test/app
BLABLA_TEST_NODE="$(readlink -f "$(command -v node)")"
"$BLABLA_TEST_NODE" deploy/test/isolation-report.cjs /var/www/blabla/data/app.db > /srv/blabla-test/reports/after.json
diff -u /srv/blabla-test/reports/before.json /srv/blabla-test/reports/after.json
free -m
systemctl show blabla-test -p MemoryCurrent -p MemoryPeak -p NRestarts -p Result
```

**Контроль:** diff пуст, все test-user/content counts в production нулевые. Если productionSettingsSha256 изменился, выяснить причину до продолжения (другой администратор мог легитимно изменить настройку); не восстанавливать старые настройки автоматически. Новые тестовые записи должны быть видны после reload только в тестовой БД. При available <250 MiB, росте swap, OOM/restarts или ухудшении основного сайта — остановить тест. Не поднимать лимиты вслепую.

## Этап 7. Безопасное отключение

```bash
cd /srv/blabla-test/app
bash deploy/test/stop.sh
free -m
```

**Контроль:** 3001/3301/3302 больше не слушаются, прежний HTTPS URL недоступен, основной сайт продолжает работать. Скрипт останавливает только два временных systemd unit; не вызывает root PM2, `pm2 kill/save`, `pkill`, `fuser` или production restart. БД/файлы остаются для разбора. После перезагрузки VPS тест сам не стартует; новый Quick Tunnel получит другой URL.

Для сохранения результатов использовать `scripts/backup-sqlite.cjs` с явным **тестовым** `data/app.db` и закрытым каталогом `reports`, затем сохранить test uploads. Не копировать один живой `.db` при WAL. Удаление данных не автоматизировано; при необходимости владелец отдельно решит судьбу `/srv/blabla-test` после проверки сохранённой копии.

## Отдельно: будущий production-релиз

Успех этой среды проверяет интерфейс, сценарии и изоляцию. Он **не доказывает совместимость миграций со старой production-схемой от 14 октября**. Перед настоящим релизом остаются согласованный SQLite Backup API snapshot production, проверка восстановления и репетиция неизменных миграций/данных/файлов через `deploy/release.sh --check … --bootstrap` на копии. Порядок и ограничения — [release-preparation.md](release-preparation.md). Production snapshot не подключается к публичному тестовому приложению.

## Локальная проверка и ограничения

Unit/integration: свежая БД + настоящие migration checksums + backup + целостность файлов/FK; запрет перезаписи/foreign env/symlink/hardlink; защита всех URL, неправильный пароль, Range, cookie, POST, снятие внешнего Authorization перед Next и запрет платежей. Дополнительно browser smoke `tests/test-environment-browser.cjs` запускает только собственные loopback-процессы и проверяет изменение тестовых данных при неизменном контрольном хеше основной **локальной** БД.

Linux amd64-артефакт проверен в двух свежих контейнерах: runtime без сети/host mounts и браузер через loopback. Это проверка Linux-приложения, а не systemd/PM2 или ресурсов настоящего VPS. Запуск на VPS, контроль отсутствия тестовых записей в production и живой HTTPS выполняются владельцем на следующих этапах и пока не подтверждены. Актуальные результаты — в последней записи [implementation-progress.md](implementation-progress.md).
