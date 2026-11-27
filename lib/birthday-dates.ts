// Fechas de cumpleaños como claves "YYYY-MM-DD" (sin zona): la fecha de
// nacimiento se guarda como día de calendario (UTC medianoche), así que se
// lee con toISOString, nunca con la hora local. Sin imports de servidor.

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// "MM-DD" de una fecha de nacimiento guardada.
export function birthMonthDay(birthDate: Date | string) {
  const iso = typeof birthDate === "string" ? birthDate : birthDate.toISOString();
  return iso.slice(5, 10);
}

// Día en que se festeja en ese año: un 29 de febrero cae el 28 en años no
// bisiestos.
export function birthdayInYear(monthDay: string, year: number) {
  const md = monthDay === "02-29" && !isLeapYear(year) ? "02-28" : monthDay;
  return `${year}-${md}`;
}

export function isBirthdayOn(birthDate: Date | string | null, dateKey: string) {
  if (!birthDate) return false;
  return birthdayInYear(birthMonthDay(birthDate), Number(dateKey.slice(0, 4))) === dateKey;
}
