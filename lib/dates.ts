export function dateParts(value: string | null | undefined) {
  if (!value) return null;
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: date.toLocaleDateString("ru-RU", { day: "numeric" }),
    month: date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
    time: date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    weekday: date.toLocaleDateString("ru-RU", { weekday: "short" }),
  };
}
