const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

export function parseRfc3339Millis(value, field = 'timestamp') {
  if (typeof value !== 'string') throw new Error(`${field} must be an RFC3339 string`);
  const m = RFC3339.exec(value);
  if (!m) throw new Error(`${field} must be timezone-aware RFC3339`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  if (month < 1 || month > 12) throw new Error(`${field} has invalid month`);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) throw new Error(`${field} has invalid day`);
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`${field} has invalid time`);
  if (m[8] !== 'Z') {
    const [offsetHour, offsetMinute] = m[8].slice(1).split(':').map(Number);
    if (offsetHour > 23 || offsetMinute > 59) throw new Error(`${field} has invalid offset`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`${field} is not parseable`);
  return ms;
}
