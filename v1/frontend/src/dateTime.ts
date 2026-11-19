const PHILIPPINE_TIME_ZONE = "Asia/Manila";

export function formatPhilippineDateTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-PH", {
    timeZone: PHILIPPINE_TIME_ZONE,
  });
}

export function formatPhilippineDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-PH", {
    timeZone: PHILIPPINE_TIME_ZONE,
  });
}

export function philippineDateToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function philippineYear(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PHILIPPINE_TIME_ZONE,
      year: "numeric",
    }).format(date),
  );
}