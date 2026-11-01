export const ROOM_FORMATS = [
  { id: "reading", label: "Совместное чтение" }, { id: "club", label: "Читательский клуб" },
  { id: "seminar", label: "Семинар" }, { id: "rehearsal", label: "Индивидуальное занятие" },
  { id: "group", label: "Групповое занятие" }, { id: "discussion", label: "Открытая дискуссия" },
] as const;
export const ROOM_ACCESS = [{ id: "open", label: "Открытая", description: "Любой читатель может присоединиться" }, { id: "invite", label: "По приглашению", description: "Участники, которых вы пригласили" }, { id: "closed", label: "Закрытая", description: "Только участники, добавленные ведущим" }, { id: "paid", label: "Платная программа", description: "Доступ выдаёт ведущий; приём оплаты пока не включён" }] as const;
export type RoomFormat = typeof ROOM_FORMATS[number]["id"];
