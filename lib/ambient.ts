/**
 * Место для фонового звука при чтении. Сейчас ничего не играет:
 * первые генераторы на голых осцилляторах звучали резко, и плеер с книги снят.
 *
 * Подключать сюда готовый движок, не писать синтез заново в компоненте читалки.
 * Ближе всего к бесконечному эмбиенту без чужих записей:
 * https://github.com/cportka/infinite-ambient — MIT, без библиотек и без семплов,
 * бесконечный дрон с медленно плывущей гармонией.
 * Запасной, более «музыкальный» вариант на Tone.js:
 * https://github.com/Banana889/Driftone — тоже MIT.
 */

export type AmbientScene = "still" | "night" | "leaves" | "pulse";

export interface AmbientEngine {
  start(scene: AmbientScene): Promise<void>;
  stop(): void;
}
