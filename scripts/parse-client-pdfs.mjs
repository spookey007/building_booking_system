/**
 * Parse client PDF text exports into CSV files for import.
 *
 * Usage:
 *   node scripts/parse-client-pdfs.mjs
 *
 * Input (place PDFs in repo root OR pre-extracted text in data/import/*.raw.txt):
 *   enventory.pdf, customer sold.pdf, slip entries date wise.pdf
 *
 * Output:
 *   data/import/units.csv
 *   data/import/sold-bookings.csv
 *   data/import/receipts.csv
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IMPORT_DIR = path.join(ROOT, "data", "import");

const PDFS = [
  { pdf: "enventory.pdf", raw: "enventory.raw.txt", parser: parseInventory },
  { pdf: "customer sold.pdf", raw: "sold.raw.txt", parser: parseSoldReport },
  { pdf: "slip entries date wise.pdf", raw: "slips.raw.txt", parser: parseSlipEntries },
];

function ensureImportDir() {
  fs.mkdirSync(IMPORT_DIR, { recursive: true });
}

function extractPdf(pdfName, rawName) {
  const pdfPath = path.join(ROOT, pdfName);
  const rawPath = path.join(IMPORT_DIR, rawName);
  if (!fs.existsSync(pdfPath)) {
    if (fs.existsSync(rawPath)) {
      return fs.readFileSync(rawPath, "utf8");
    }
    console.warn(`Skip ${pdfName}: file not found`);
    return null;
  }
  try {
    execSync(`pdftotext -layout "${pdfPath}" "${rawPath}"`, { stdio: "pipe" });
  } catch {
    console.warn(`pdftotext failed for ${pdfName}; using existing ${rawName} if present`);
  }
  return fs.existsSync(rawPath) ? fs.readFileSync(rawPath, "utf8") : null;
}

function parseMoney(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDateDdMmYy(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  year += year >= 70 ? 1900 : 2000;
  return new Date(Date.UTC(year, month - 1, day));
}

function normalizeFacing(raw) {
  const key = String(raw ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const map = {
    "neavy merchant": "NAVY_MERCHANT",
    "navy merchant": "NAVY_MERCHANT",
    "west open": "WEST_OPEN",
    "east open": "EAST_OPEN",
    "park facing": "PARK",
    "highway facing": "HIGHWAY",
    "park facing / west open": "PARK",
    "park facing / west": "PARK",
    open: "WEST_OPEN",
    park: "PARK",
  };
  return map[key] ?? null;
}

function normalizeUnitKind(raw) {
  const key = String(raw ?? "").toLowerCase().trim();
  if (key.includes("pent") || key.includes("pant")) return "PENTHOUSE";
  if (key.includes("comm")) return "COMMERCIAL";
  return "RESIDENTIAL";
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function parseInventory(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);

  const mainRe =
    /^\s*(\d+)?\s+([A-Z]\d+)\s+(\d+)\s+(\d+)\s+(\w+)\s+([A-H])\s+(.+?)\s+(\d+)\s+(Residential|Penthouse|Pant House|Commercial)/i;
  const contRe =
    /^\s+(\d+)\s+(\d+)\s+(\w+)\s+([A-H])\s+(.+?)\s+(\d+)\s+(Residential|Penthouse|Pant House|Commercial)/i;

  for (const line of lines) {
    let m = line.match(mainRe);
    if (m) {
      rows.push({
        project_code: "FM01",
        tower_code: m[6],
        unit_no: m[2],
        floor_no: m[4],
        unit_kind: normalizeUnitKind(m[9]),
        category_code: m[5].toUpperCase(),
        facing_code: normalizeFacing(m[7]) ?? "",
        area_sqft: m[3],
        rooms: m[8],
        listing_status: "AVAILABLE",
        serial_no: m[1] ?? "",
      });
      continue;
    }

    m = line.match(contRe);
    if (m) {
      rows.push({
        project_code: "FM01",
        tower_code: m[4],
        unit_no: `${m[4]}${m[2]}${m[1]}`.replace(/(\D)(\d{3,})$/, "$1$2"),
        floor_no: m[2],
        unit_kind: normalizeUnitKind(m[7]),
        category_code: m[3].toUpperCase(),
        facing_code: normalizeFacing(m[5]) ?? "",
        area_sqft: m[1],
        rooms: m[6],
        listing_status: "AVAILABLE",
        serial_no: "",
      });
    }
  }

  const dedup = new Map();
  for (const row of rows) {
    const key = `${row.tower_code}:${row.unit_no}`;
    if (!dedup.has(key)) dedup.set(key, row);
  }

  return [...dedup.values()];
}

function soldRowScore(row) {
  let score = 0;
  if (row.customer_name && !row.customer_name.startsWith("Owner ")) score += 20;
  if (row.rate) score += 8;
  if (row.received) score += 6;
  if (row.total) score += 4;
  if (row.booking_date) score += 2;
  return score;
}

function mergeSoldRows(existing, incoming) {
  return {
    ...existing,
    customer_name:
      incoming.customer_name && !incoming.customer_name.startsWith("Owner ")
        ? incoming.customer_name
        : existing.customer_name,
    booking_date: incoming.booking_date || existing.booking_date,
    floor_no: incoming.floor_no || existing.floor_no,
    category_code: incoming.category_code || existing.category_code,
    rate: incoming.rate ?? existing.rate,
    utility: incoming.utility ?? existing.utility,
    parking: incoming.parking ?? existing.parking,
    total: incoming.total ?? existing.total,
    received: incoming.received ?? existing.received,
    balance: incoming.balance ?? existing.balance,
  };
}

function parseSoldAmounts(nums) {
  if (nums.length >= 5) {
    const rate = parseMoney(nums[0]);
    const utility = parseMoney(nums[1]);
    const parking = nums[2] ? parseMoney(nums[2]) : null;
    const total = parseMoney(nums[nums.length >= 6 ? 3 : nums.length - 3]);
    const received = parseMoney(nums[nums.length >= 6 ? 4 : nums.length - 2]);
    const balance = parseMoney(nums[nums.length >= 6 ? 5 : nums.length - 1]);
    return { rate, utility, parking, total, received, balance };
  }
  if (nums.length === 2) {
    const received = parseMoney(nums[0]);
    const balance = parseMoney(nums[1]);
    const total = received != null && balance != null ? received + balance : null;
    return { rate: null, utility: null, parking: null, total, received, balance };
  }
  return { rate: null, utility: null, parking: null, total: 0, received: 0, balance: 0 };
}

function parseSoldReport(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  const dateRe = /\b(\d{2}-\d{2}-\d{2})\b/;

  // Full row: serial, unit, size, floor, tower, category, date, customer, amounts
  for (const line of lines) {
    const dateMatch = line.match(dateRe);
    if (!dateMatch) continue;

    const beforeDate = line.slice(0, dateMatch.index).trim();
    const afterDate = line.slice((dateMatch.index ?? 0) + dateMatch[0].length).trim();

    const headMatch = beforeDate.match(
      /^\s*(\d+)?\s*([A-Z]\d+)\s+(\d+)\s+(\d+)\s+([A-H])\s+(\w+)\s*$/,
    );
    if (!headMatch) continue;

    const nums = [...afterDate.matchAll(/([\d,]+(?:\.\d+)?)/g)].map((x) => x[1]);
    if (nums.length < 2) continue;

    const nameEnd = afterDate.search(/\d[\d,]*\s+\d/);
    const customerName =
      nameEnd > 0 ? afterDate.slice(0, nameEnd).trim() : afterDate.split(/\s{2,}/)[0]?.trim() ?? "";
    if (!customerName || customerName.length < 2) continue;

    const amounts = parseSoldAmounts(nums);
    rows.push({
      customer_name: customerName,
      unit_no: headMatch[2],
      tower_code: headMatch[5],
      floor_no: headMatch[4],
      size_sqft: headMatch[3],
      category_code: headMatch[6].toUpperCase(),
      booking_date: dateMatch[1],
      ...amounts,
    });
  }

  // Compact row: serial, unit, size, date, customer (amounts optional or on same line)
  for (const line of lines) {
    const dateMatch = line.match(dateRe);
    if (!dateMatch) continue;

    const beforeDate = line.slice(0, dateMatch.index).trim();
    const afterDate = line.slice((dateMatch.index ?? 0) + dateMatch[0].length).trim();
    const headSimple = beforeDate.match(/^\s*(\d+)\s+([A-H]\d+)\s+(\d+)\s*$/);
    if (!headSimple) continue;

    const unitNo = headSimple[2];
    const towerCode = unitNo[0];
    const nums = [...afterDate.matchAll(/([\d,]+(?:\.\d+)?)/g)].map((x) => x[1]);
    const nameEnd = afterDate.search(/\d[\d,]/);
    const customerName =
      nameEnd > 0 ? afterDate.slice(0, nameEnd).trim() : afterDate.replace(/[\d,\s]+$/g, "").trim();
    if (!customerName || customerName.length < 2) continue;

    rows.push({
      customer_name: customerName,
      unit_no: unitNo,
      tower_code: towerCode,
      floor_no: null,
      size_sqft: headSimple[3],
      category_code: "GOLD",
      booking_date: dateMatch[1],
      ...parseSoldAmounts(nums),
    });
  }

  // Amount-only row: serial, unit, size, floor, tower, category, amounts (no date on line)
  for (const line of lines) {
    if (dateRe.test(line)) continue;

    const headMatch = line.match(/^\s*(\d+)\s+([A-H]\d+)\s+(\d+)\s+(\d+)\s+([A-H])\s+(\w+)/);
    if (!headMatch) continue;

    const nums = [...line.matchAll(/([\d,]+(?:\.\d+)?)/g)].map((x) => x[1]);
    if (nums.length < 4) continue;

    const amounts = parseSoldAmounts(nums);
    rows.push({
      customer_name: `Owner ${headMatch[2]}`,
      unit_no: headMatch[2],
      tower_code: headMatch[5],
      floor_no: headMatch[4],
      size_sqft: headMatch[3],
      category_code: headMatch[6].toUpperCase(),
      booking_date: "01-01-20",
      ...amounts,
    });
  }

  const dedup = new Map();
  for (const row of rows) {
    const key = `${row.tower_code}:${row.unit_no}`;
    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, row);
      continue;
    }
    const merged = mergeSoldRows(existing, row);
    dedup.set(key, soldRowScore(merged) >= soldRowScore(existing) ? merged : mergeSoldRows(row, existing));
  }
  return [...dedup.values()];
}

function parseSlipEntries(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  const rowRe =
    /^(\d{2}-\d{2}-\d{4})\s+([A-Z]\d+)\s+(\d+)\s+([A-H])\s+(.+?)\s+(\d+|0000\d+|\s)\s+(CASH|CHEQUEQ|CHEQUE|ONLINE)/i;

  for (const line of lines) {
    const m = line.match(rowRe);
    if (!m) continue;

    const tail = line.slice(m.index + m[0].length);
    const amountMatch = tail.match(/([\d,]+)\s*$/);
    if (!amountMatch) continue;

    const amount = parseMoney(amountMatch[1]);
    if (!amount || amount <= 0) continue;

    const ledgerRaw = line.includes("UNOFFICIAL") ? "UNOFFICIAL" : line.includes("OFFICIAL") ? "OFFICIAL" : "OFFICIAL";
    const chequeMatch = line.match(/(\d{6,})\s+(\d{2}-[A-Z]{3}-\d{2})/i);
    const bankMatch = line.match(/\b(SBL|HBL|BAFL|SILK BANK|SONERI BANK|ISLAMI BANK)\b/i);

    rows.push({
      received_date: m[1],
      unit_no: m[2],
      tower_code: m[4],
      customer_name: m[5].trim(),
      slip_no: String(m[6]).trim(),
      payment_mode: m[7].toUpperCase().startsWith("CHEQ") ? "CHEQUE" : "CASH",
      cheque_no: chequeMatch?.[1] ?? "",
      cheque_date: chequeMatch?.[2] ?? "",
      bank_name: bankMatch?.[1] ?? "",
      ledger_type: ledgerRaw,
      amount,
      on_account_of: line.includes("Installment") ? "Installment" : line.includes("Monthly") ? "Monthly" : "",
    });
  }

  return rows;
}

function main() {
  ensureImportDir();
  const outputs = [];

  for (const { pdf, raw, parser } of PDFS) {
    const text = extractPdf(pdf, raw);
    if (!text) continue;

    if (parser === parseInventory) {
      const rows = parser(text);
      const headers = [
        "project_code",
        "tower_code",
        "unit_no",
        "floor_no",
        "unit_kind",
        "category_code",
        "facing_code",
        "area_sqft",
        "rooms",
        "listing_status",
        "serial_no",
      ];
      const out = path.join(IMPORT_DIR, "units.csv");
      writeCsv(out, headers, rows);
      outputs.push(`${out} (${rows.length} rows)`);
    }

    if (parser === parseSoldReport) {
      const rows = parser(text);
      const headers = [
        "customer_name",
        "unit_no",
        "tower_code",
        "floor_no",
        "size_sqft",
        "category_code",
        "booking_date",
        "rate",
        "utility",
        "parking",
        "total",
        "received",
        "balance",
      ];
      const out = path.join(IMPORT_DIR, "sold-bookings.csv");
      writeCsv(out, headers, rows);
      outputs.push(`${out} (${rows.length} rows)`);
    }

    if (parser === parseSlipEntries) {
      const rows = parser(text);
      const headers = [
        "received_date",
        "unit_no",
        "tower_code",
        "customer_name",
        "slip_no",
        "payment_mode",
        "cheque_no",
        "cheque_date",
        "bank_name",
        "ledger_type",
        "amount",
        "on_account_of",
      ];
      const out = path.join(IMPORT_DIR, "receipts.csv");
      writeCsv(out, headers, rows);
      outputs.push(`${out} (${rows.length} rows)`);
    }
  }

  if (outputs.length === 0) {
    console.error("No PDFs parsed. Place PDFs in repo root and install pdftotext (poppler).");
    process.exit(1);
  }

  console.log("Parsed:");
  for (const line of outputs) console.log(`  ${line}`);
  console.log("\nNext: npm run import:client-data");
}

main();
