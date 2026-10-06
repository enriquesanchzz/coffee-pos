// Zona horaria de la sucursal. Sin esto, todo se calculaba con la zona del
// servidor: en un hosting en UTC las ventas de la noche contaban para el
// día siguiente, la "hora pico" salía 6h corrida y las promociones por
// horario/día de la semana se activaban a deshoras.
//
// Se elige en Configuración → Negocio (Branch.timeZone). El valor inicial
// es NEXT_PUBLIC_APP_TIME_ZONE o Ciudad de México; setAppTimeZone lo
// actualiza en el servidor (lib/settings.ts syncAppTimeZone, al renderizar
// y antes de cada Server Action) y en el navegador (TimeZoneSync en
// app/layout.tsx), así las funciones de abajo siguen siendo síncronas.
let appTimeZone = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "America/Mexico_City";

export function setAppTimeZone(tz: string) {
  appTimeZone = tz;
}

export function getAppTimeZone() {
  return appTimeZone;
}

type DateInput = Date | string | number;

export function formatDateTime(date: DateInput) {
  return new Date(date).toLocaleString("es-MX", { timeZone: appTimeZone });
}

export function formatDate(date: DateInput) {
  return new Date(date).toLocaleDateString("es-MX", { timeZone: appTimeZone });
}

export function formatTime(date: DateInput, options?: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleTimeString("es-MX", { timeZone: appTimeZone, ...options });
}

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: appTimeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}

// "YYYY-MM-DD" de esa fecha en la zona de la sucursal.
export function zonedDateKey(date: DateInput) {
  const { year, month, day } = zonedParts(new Date(date));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Hora (0-23), minutos y día de la semana (0 = domingo) en la sucursal.
export function zonedClock(date: DateInput) {
  const { hour, minute, weekday } = zonedParts(new Date(date));
  return { hour, minute, weekday };
}

// Diferencia (ms) entre la hora de pared de la sucursal y UTC en ese
// instante — negativa en México (UTC-6).
function offsetMs(date: Date) {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

// Instante en que empieza el día "YYYY-MM-DD" en la sucursal.
export function zonedStartOfDay(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  // Dos pasadas para caer bien en días con cambio de horario.
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}

// Último milisegundo del día "YYYY-MM-DD" en la sucursal.
export function zonedEndOfDay(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextKey = next.toISOString().slice(0, 10);
  return new Date(zonedStartOfDay(nextKey).getTime() - 1);
}

// Suma días a una clave "YYYY-MM-DD" (aritmética de calendario, sin zona).
export function addDaysToKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
