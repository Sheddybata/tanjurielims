import * as XLSX from "xlsx";

export type ParsedPunch = {
  devicePin: string;
  name?: string;
  punchedAt: string;
  punchType: "in" | "out" | "unknown";
  raw: string;
};

const HEADER = /^(no\.?|s\/n|sn|id|user|pin|enroll|name|date|time|status|state|ac-no)/i;
const TIME = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;

function decodeFile(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function isExcel(buffer: ArrayBuffer, fileName?: string) {
  const name = String(fileName ?? "").toLowerCase();
  if (/\.(xlsx|xls|xlsm|xlsb)$/.test(name)) return true;
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return true;
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return true;
  return false;
}

function splitLine(line: string) {
  if (line.includes("\t")) return line.split("\t").map((part) => part.trim()).filter(Boolean);
  if (line.includes(",") && (line.match(/,/g) || []).length >= 2) {
    return line.split(",").map((part) => part.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  return line.split(/[;|]+|\s{2,}/).map((part) => part.trim()).filter(Boolean);
}

function punchType(value?: string): "in" | "out" | "unknown" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (["in", "i", "check-in", "checkin", "clock-in", "clockin", "0", "duty on", "on", "c/in"].includes(raw)) return "in";
  if (["out", "o", "check-out", "checkout", "clock-out", "clockout", "1", "duty off", "off", "c/out"].includes(raw)) return "out";
  if (raw.includes("out")) return "out";
  if (raw.includes("in")) return "in";
  return "unknown";
}

function parseWhen(parts: string[]) {
  const joined = parts.filter(Boolean).join(" ");
  const stamp =
    joined.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})[ T](\d{1,2}:\d{2}(?::\d{2})?)/) ||
    joined.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{4})[ T](\d{1,2}:\d{2}(?::\d{2})?)/) ||
    joined.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!stamp) return "";
  if (stamp.length >= 7 && stamp[0].length === 14) {
    return `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}`;
  }
  const date = stamp[1].replace(/\//g, "-");
  const time = stamp[2].length === 5 ? `${stamp[2]}:00` : stamp[2];
  const [a, b, c] = date.split("-");
  const iso = a.length === 4 ? `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}` : `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  return `${iso}T${time}`;
}

function isIso(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

function cellText(value: unknown) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  return String(value).trim();
}

function collectPunches(rows: string[][]) {
  const out: ParsedPunch[] = [];
  const seen = new Set<string>();
  for (const parts of rows) {
    const clean = parts.map((part) => String(part ?? "").trim()).filter(Boolean);
    if (clean.length < 2) continue;
    if (HEADER.test(clean[0] ?? "") && clean.some((part) => /date|time|name|status/i.test(part))) continue;
    const pin = clean.find((part, index) => index < 3 && /^[A-Za-z0-9/-]{1,24}$/.test(part) && !part.includes(":")) ?? clean[0];
    const name = clean.find((part, index) => index > 0 && /[A-Za-z]{3,}/.test(part) && !/\d{4}/.test(part));
    const when = parseWhen(clean);
    if (!pin || !when || !isIso(when)) continue;
    const typePart = clean.find((part) => punchType(part) !== "unknown" && !part.includes(":") && !/\d{4}/.test(part));
    const punchedAt = new Date(when).toISOString();
    const key = `${pin}|${punchedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      devicePin: pin,
      name: name && !/^\d+$/.test(name) ? name : undefined,
      punchedAt,
      punchType: punchType(typePart),
      raw: clean.join(" ").slice(0, 240)
    });
  }
  return out;
}

function headerIndex(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.some((name) => header === name || header.includes(name)));
}

function labeledValue(row: string[], label: RegExp) {
  for (let i = 0; i < row.length; i += 1) {
    if (!label.test(row[i] ?? "")) continue;
    for (let j = i + 1; j < row.length; j += 1) {
      const value = (row[j] ?? "").trim();
      if (!value || /^(no|name|dept)\s*:/i.test(value)) continue;
      return value;
    }
  }
  return "";
}

function isDayHeader(row: string[]) {
  const days = row.map((cell) => Number(cell)).filter((value) => value >= 1 && value <= 31);
  return days.length >= 7 && days[0] === 1;
}

function isNoRow(row: string[]) {
  return row.some((cell) => /^no\s*:/i.test(cell ?? ""));
}

function periodOf(rows: string[][]) {
  const text = rows
    .slice(0, 8)
    .flat()
    .join(" ");
  const match = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s*[~-]/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function timesInCell(value: string) {
  return String(value ?? "")
    .split(/[\n\r,;]+/)
    .map((part) => part.trim())
    .map((part) => part.match(TIME))
    .filter((part): part is RegExpMatchArray => Boolean(part));
}

function parseF16Calendar(rows: string[][]): ParsedPunch[] | null {
  const period = periodOf(rows);
  if (!period) return null;
  const punches: ParsedPunch[] = [];
  const seen = new Set<string>();
  let blocks = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (!isNoRow(row)) continue;
    blocks += 1;
    const pin = labeledValue(row, /^no\s*:/i);
    const name = labeledValue(row, /^name\s*:/i);
    if (!pin) continue;
    const dayRow = isDayHeader(rows[i - 1] ?? []) ? rows[i - 1] : isDayHeader(rows[i - 2] ?? []) ? rows[i - 2] : [];
    let timeRow = rows[i + 1] ?? [];
    if (isDayHeader(timeRow) || isNoRow(timeRow)) timeRow = rows[i + 2] ?? [];
    if (isNoRow(timeRow)) continue;
    const width = Math.max(dayRow.length, timeRow.length);
    for (let col = 0; col < width; col += 1) {
      const day = Number(dayRow[col] || col + 1);
      if (!day || day < 1 || day > 31) continue;
      const stamps = timesInCell(timeRow[col] ?? "");
      stamps.forEach((stamp, index) => {
        const hour = stamp[1].padStart(2, "0");
        const minute = stamp[2];
        const second = (stamp[3] || "00").padStart(2, "0");
        const when = `${period.year}-${String(period.month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${hour}:${minute}:${second}`;
        if (!isIso(when)) return;
        const punchedAt = new Date(when).toISOString();
        const key = `${pin}|${punchedAt}`;
        if (seen.has(key)) return;
        seen.add(key);
        punches.push({
          devicePin: pin,
          name: name || undefined,
          punchedAt,
          punchType: index === 0 ? "in" : index === stamps.length - 1 && stamps.length > 1 ? "out" : "unknown",
          raw: `${name || pin} ${when}`
        });
      });
    }
  }
  return blocks ? punches : null;
}

function sheetRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    dateNF: "yyyy-mm-dd hh:mm:ss"
  }).map((row) => (row ?? []).map(cellText));
}

function parseMappedRows(rows: string[][]) {
  if (!rows.length) return [];
  const headers = rows[0].map((cell) => cell.toLowerCase());
  const pinCol = headerIndex(headers, ["ac-no", "ac no", "user id", "userid", "enroll", "pin", "id"]);
  const nameCol = headerIndex(headers, ["name", "nama"]);
  const dateCol = headerIndex(headers, ["date", "day"]);
  const timeCol = headerIndex(headers, ["time"]);
  const whenCol = headerIndex(headers, ["datetime", "date time", "clock"]);
  const stateCol = headerIndex(headers, ["status", "state", "new state", "attendance"]);
  if (pinCol < 0 || (whenCol < 0 && dateCol < 0 && timeCol < 0)) return [];
  const mapped: string[][] = [];
  for (const row of rows.slice(1)) {
    const when = whenCol >= 0 ? row[whenCol] : `${row[dateCol] ?? ""} ${row[timeCol] ?? ""}`.trim();
    mapped.push([row[pinCol], nameCol >= 0 ? row[nameCol] : "", when, stateCol >= 0 ? row[stateCol] : ""]);
  }
  return collectPunches(mapped);
}

function parseExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const preferred = workbook.SheetNames.filter((name) => /log/i.test(name));
  const rest = workbook.SheetNames.filter((name) => !preferred.includes(name) && !/summary/i.test(name));
  for (const name of [...preferred, ...rest]) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = sheetRows(sheet);
    const calendar = parseF16Calendar(rows);
    if (calendar && calendar.length) return calendar;
    const mapped = parseMappedRows(rows);
    if (mapped.length) return mapped;
  }
  const fallback: string[][] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (sheet) fallback.push(...sheetRows(sheet));
  }
  return collectPunches(fallback);
}

export function parseAttendanceFile(buffer: ArrayBuffer, fileName?: string): ParsedPunch[] {
  if (isExcel(buffer, fileName)) return parseExcel(buffer);
  const text = decodeFile(buffer).replace(/\r/g, "\n");
  const lines = text.split("\n").map(splitLine);
  return parseF16Calendar(lines) ?? collectPunches(lines);
}

const NICKNAMES: Record<string, string[]> = {
  steve: ["stephen", "steven"],
  steven: ["stephen", "steve"],
  stephen: ["steve", "steven"],
  josph: ["joseph"],
  joseph: ["josph"],
  philp: ["philip", "philipson", "phillip"],
  philip: ["philp", "philipson", "phillip"],
  philipson: ["philip", "philp", "phillip"],
  yohna: ["yohanna"],
  yohanna: ["yohna"],
  hayautu: ["hayatu"],
  hayatu: ["hayautu"],
  yahza: ["yahuza"],
  yahuza: ["yahza"],
  gowm: ["gwom"],
  gwom: ["gowm"],
  sbovel: ["shovel"],
  shovel: ["sbovel"],
  umar: ["umaru"],
  umaru: ["umar"]
};

export type AttendanceStaff = {
  id: string;
  full_name?: string | null;
  preferred_name?: string | null;
  staff_number?: string | null;
  job_title?: string | null;
};

function normalizeToken(value?: string | null) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function tokensOf(value?: string | null) {
  return String(value ?? "")
    .split(/\s+/)
    .map((part) => normalizeToken(part))
    .filter((part) => part.length >= 3);
}

function nicknamesOf(token: string) {
  return NICKNAMES[token] ?? [];
}

export type AttendanceSuggestion = {
  staffId: string;
  name: string;
  staffNumber?: string | null;
  jobTitle?: string | null;
  score: number;
  reason: string;
};

function uniqueIds(people: AttendanceStaff[]) {
  const ids = [...new Set(people.map((person) => person.id).filter(Boolean))];
  return ids.length === 1 ? ids[0] : null;
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = i - 1;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const next = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = next;
    }
  }
  return row[right.length];
}

function personTokens(person: AttendanceStaff) {
  const tokens = [...tokensOf(person.full_name), ...tokensOf(person.preferred_name)];
  const expanded = new Set<string>();
  for (const token of tokens) {
    expanded.add(token);
    for (const nick of nicknamesOf(token)) expanded.add(nick);
  }
  return [...expanded];
}

function gluedNames(tokens: string[]) {
  const glued = new Set<string>();
  if (tokens.length) glued.add(tokens.join(""));
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = 0; j < tokens.length; j += 1) {
      if (i === j) continue;
      glued.add(`${tokens[i]}${tokens[j]}`);
    }
  }
  return [...glued];
}

function scoreStaffName(person: AttendanceStaff, punchName: string): { score: number; reason: string } {
  const tokens = personTokens(person);
  const glued = gluedNames(tokens);
  if (!punchName) return { score: 0, reason: "" };

  if (glued.includes(punchName)) {
    return { score: 96, reason: "first and surname on the F16" };
  }
  for (const blob of glued) {
    if (punchName.length >= 6 && (blob.startsWith(punchName) || punchName.startsWith(blob))) {
      return { score: 90, reason: "first and surname on the F16" };
    }
  }
  for (const token of tokens) {
    if (punchName.startsWith(token) && punchName.length > token.length) {
      const rest = punchName.slice(token.length);
      if (tokens.some((other) => other !== token && (other === rest || other.startsWith(rest) || rest.startsWith(other)))) {
        return { score: 92, reason: "first and surname on the F16" };
      }
    }
  }
  if (tokens.includes(punchName)) {
    return { score: 88, reason: "name on the F16" };
  }
  let bestDistance = 99;
  let closest = "";
  for (const token of tokens) {
    const distance = editDistance(punchName, token);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = token;
    }
  }
  if (bestDistance === 1 && closest.length >= 4 && punchName.length >= 4) {
    return { score: 80, reason: `close to ${closest}` };
  }
  if (bestDistance === 2 && closest.length >= 6 && punchName.length >= 6) {
    return { score: 68, reason: `close to ${closest}` };
  }
  if (punchName.length >= 4 && tokens.some((token) => token.startsWith(punchName) || punchName.startsWith(token))) {
    return { score: 62, reason: "partial name on the F16" };
  }
  return { score: 0, reason: "" };
}

export function suggestAttendanceStaff(
  staff: AttendanceStaff[],
  personName?: string | null,
  limit = 4
): AttendanceSuggestion[] {
  const punchName = normalizeToken(personName);
  if (!punchName || punchName === "pm") return [];
  return staff
    .map((person) => {
      const ranked = scoreStaffName(person, punchName);
      return {
        staffId: person.id,
        name: person.full_name || "Staff",
        staffNumber: person.staff_number,
        jobTitle: person.job_title,
        score: ranked.score,
        reason: ranked.reason
      };
    })
    .filter((item) => item.score >= 62)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .filter((item, index, list) => index === 0 || item.score >= 68 || item.score === list[0].score)
    .slice(0, limit);
}

function shouldAutoMatch(suggestions: AttendanceSuggestion[]) {
  const top = suggestions[0];
  if (!top || top.score < 82) return null;
  const tied = suggestions.filter((item) => item.score >= top.score - 4);
  return tied.length === 1 ? top.staffId : null;
}

function matchStaffNumber(staff: AttendanceStaff[], pin: string) {
  const needle = String(pin ?? "").trim().toLowerCase();
  if (!needle) return null;
  const exact = staff.filter((person) => String(person.staff_number ?? "").trim().toLowerCase() === needle);
  const exactId = uniqueIds(exact);
  if (exactId) return exactId;
  if (needle.length < 3) return null;
  const padded = needle.padStart(3, "0");
  return uniqueIds(
    staff.filter((person) => {
      const tail = String(person.staff_number ?? "").split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
      return tail === needle || tail === padded;
    })
  );
}

export function pinAliases(staffNumber?: string | null, fullName?: string | null, preferredName?: string | null) {
  const aliases = new Set<string>();
  const number = String(staffNumber ?? "").trim();
  if (number) {
    aliases.add(number.toLowerCase());
    const tail = number.split("/").filter(Boolean).pop() ?? "";
    if (tail.length >= 3) aliases.add(tail.toLowerCase());
  }
  for (const token of [...tokensOf(fullName), ...tokensOf(preferredName)]) {
    aliases.add(token);
    for (const nick of nicknamesOf(token)) aliases.add(nick);
  }
  return aliases;
}

export function matchAttendanceStaff(
  staff: AttendanceStaff[],
  devicePin: string,
  personName?: string | null,
  pinMap?: Map<string, string> | Record<string, string>
) {
  const mapped = pinMap instanceof Map ? pinMap.get(devicePin) : pinMap?.[devicePin];
  if (mapped) return mapped;

  const punchName = normalizeToken(personName);
  if (punchName === "pm") {
    const titleId = uniqueIds(staff.filter((person) => /project\s*manager/i.test(person.job_title ?? "")));
    if (titleId) return titleId;
  }

  const preferredHits = staff.filter((person) => normalizeToken(person.preferred_name) === punchName);
  const preferredId = uniqueIds(preferredHits);
  if (preferredId) return preferredId;

  const autoId = shouldAutoMatch(suggestAttendanceStaff(staff, personName, 6));
  if (autoId) return autoId;

  const tokenHits = staff.filter((person) => personTokens(person).includes(punchName));
  const tokenId = uniqueIds(tokenHits);
  if (tokenId) return tokenId;

  return matchStaffNumber(staff, devicePin);
}
