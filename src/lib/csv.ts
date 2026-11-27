/**
 * CSV exports, built and saved in the browser.
 *
 * Cells are escaped for spreadsheets as well as for CSV: text that starts with
 * = + - or @ runs as a formula when the file is opened in Excel or Sheets, and
 * names, emails and notes in these files are typed by clients. Such cells get a
 * leading apostrophe. Plain numbers, negative balances included, are left as
 * they are.
 */

function cell(raw: string): string {
  const formula = /^[=+\-@\t\r]/.test(raw) && !/^-?\d+(\.\d+)?$/.test(raw)
  const value = formula ? `'${raw}` : raw
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [header, ...rows].map((row) => row.map((value) => cell(String(value ?? ""))).join(",")).join("\n")
}

export function saveCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** `2026-11-27`, for file names. */
export const today = () => new Date().toISOString().slice(0, 10)
