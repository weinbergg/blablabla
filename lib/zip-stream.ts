import "server-only";

import { createReadStream } from "fs";
import { Readable } from "stream";

/**
 * Потоковый сборщик ZIP без сжатия.
 *
 * Зачем свой, а не библиотека: архив раздела — это сотни PDF и EPUB, которые
 * уже сжаты. Повторное сжатие дало бы проценты объёма за минуты процессорного
 * времени, поэтому используется метод «store» (0): байты файла переписываются
 * в поток как есть. Благодаря этому архив на два гигабайта собирается со
 * скоростью диска и занимает в памяти один буфер чтения, а не весь архив.
 *
 * Формат (APPNOTE.TXT, раздел 4.3): для каждого файла идёт локальный
 * заголовок, затем данные, затем «data descriptor» с CRC и размерами. Описатель
 * нужен потому, что CRC считается на лету — пока файл не прочитан целиком, его
 * значение неизвестно, а возвращаться назад по потоку нельзя. В конце пишется
 * центральный каталог: по нему читалка и Проводник показывают список файлов,
 * не распаковывая архив.
 *
 * Zip64 намеренно не поддержан: размер архива ограничен настройкой
 * zipMaxMegabytes (по умолчанию 2 ГБ), а отдельных файлов больше 4 ГБ в фонде
 * нет. Если лимит когда-нибудь поднимут выше 4 ГБ, понадобятся zip64-поля.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(chunk: Uint8Array, previous: number) {
  let crc = previous ^ 0xffffffff;
  for (let i = 0; i < chunk.length; i += 1) {
    crc = CRC_TABLE[(crc ^ chunk[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Дата в формате MS-DOS: год от 1980, секунды с шагом 2. */
function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2));
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export type ZipEntry =
  /** Файл с диска — читается потоком. */
  | { name: string; diskPath: string }
  /** Небольшой текст: опись архива, README и прочее. */
  | { name: string; text: string };

type Central = {
  nameBytes: Buffer;
  crc: number;
  size: number;
  offset: number;
  time: number;
  day: number;
};

const LOCAL_SIGNATURE = 0x04034b50;
const DESCRIPTOR_SIGNATURE = 0x08074b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
// Бит 3 — размеры в описателе после данных, бит 11 — имя в UTF-8.
const FLAGS = 0x0008 | 0x0800;

function localHeader(nameBytes: Buffer, time: number, day: number) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_SIGNATURE, 0);
  header.writeUInt16LE(20, 4); // версия, нужная для распаковки
  header.writeUInt16LE(FLAGS, 6);
  header.writeUInt16LE(0, 8); // метод: без сжатия
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(day, 12);
  // CRC и размеры нулевые — настоящие значения уйдут в описатель.
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBytes]);
}

function dataDescriptor(crc: number, size: number) {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(DESCRIPTOR_SIGNATURE, 0);
  descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(size, 8); // сжатый размер
  descriptor.writeUInt32LE(size, 12); // исходный размер
  return descriptor;
}

function centralDirectory(entries: Central[]) {
  const records = entries.map((entry) => {
    const record = Buffer.alloc(46);
    record.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    record.writeUInt16LE(20, 4); // чем создан
    record.writeUInt16LE(20, 6); // чем распаковывать
    record.writeUInt16LE(FLAGS, 8);
    record.writeUInt16LE(0, 10);
    record.writeUInt16LE(entry.time, 12);
    record.writeUInt16LE(entry.day, 14);
    record.writeUInt32LE(entry.crc, 16);
    record.writeUInt32LE(entry.size, 20);
    record.writeUInt32LE(entry.size, 24);
    record.writeUInt16LE(entry.nameBytes.length, 28);
    record.writeUInt32LE(entry.offset, 42);
    return Buffer.concat([record, entry.nameBytes]);
  });

  const body = Buffer.concat(records);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(body.length, 12);
  return { body, end };
}

/**
 * Имя внутри архива. Запрещённые в Windows символы заменяются, слеши убираются
 * (иначе «автор/название» создал бы лишнюю папку), длина режется — у некоторых
 * файловых систем предел 255 байт.
 */
export function safeZipName(name: string, fallback: string) {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const limited = cleaned.length > 150 ? cleaned.slice(0, 150).trim() : cleaned;
  return limited || fallback;
}

/**
 * Собирает архив в веб-поток. Источник pull-based: следующий кусок читается
 * только когда клиент забрал предыдущий, поэтому медленный интернет не
 * заставляет сервер держать архив в памяти.
 */
export function createZipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const central: Central[] = [];
  let offset = 0;

  async function* generate() {
    for (const entry of entries) {
      const nameBytes = Buffer.from(entry.name, "utf8");
      const { time, day } = dosDateTime(new Date());
      const start = offset;

      const header = localHeader(nameBytes, time, day);
      offset += header.length;
      yield header;

      let crc = 0;
      let size = 0;

      if ("text" in entry) {
        const payload = Buffer.from(entry.text, "utf8");
        crc = crc32(payload, 0);
        size = payload.length;
        offset += payload.length;
        yield payload;
      } else {
        try {
          for await (const chunk of createReadStream(entry.diskPath)) {
            const buffer = chunk as Buffer;
            crc = crc32(buffer, crc);
            size += buffer.length;
            offset += buffer.length;
            yield buffer;
          }
        } catch {
          // Файл пропал с диска уже после того, как мы начали архив. Бросать
          // нельзя — клиент получит оборванный ZIP без каталога; просто
          // оставляем запись пустой, список в описи покажет, чего не хватает.
        }
      }

      const descriptor = dataDescriptor(crc, size);
      offset += descriptor.length;
      yield descriptor;

      central.push({ nameBytes, crc, size, offset: start, time, day });
    }

    const { body, end } = centralDirectory(central);
    end.writeUInt32LE(offset, 16); // смещение центрального каталога
    yield body;
    yield end;
  }

  return Readable.toWeb(Readable.from(generate())) as ReadableStream<Uint8Array>;
}
