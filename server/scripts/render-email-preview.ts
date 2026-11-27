import { writeFile } from "node:fs/promises"
import path from "node:path"

const supportEmail = "support@bowlineglobal.com"
process.env.SUPPORT_EMAIL ??= supportEmail
const templates = await import("../src/services/email/templates.js")

const sampleDate = new Date("2026-11-27T13:45:00Z")
const common = { fullName: "Daniel Carter" }
const appUrl = "https://app.bowlineglobal.com"

const groups: Array<[string, Array<[string, ReturnType<typeof templates.welcomeEmail>]>]> = [
  ["Account & access", [
    ["Welcome", templates.welcomeEmail({ ...common, username: "daniel.carter", uid: "BW-204891", appUrl })],
    ["Email confirmation", templates.emailVerificationEmail({ ...common, verifyUrl: `${appUrl}/verify-email?token=sample-token`, ttlMinutes: 30 })],
    ["Password reset", templates.passwordResetEmail({ ...common, resetUrl: `${appUrl}/reset-password?token=sample-token`, ttlMinutes: 30 })],
    ["Password changed", templates.passwordChangedEmail({ ...common, supportEmail })],
    ["New sign-in", templates.loginAlertEmail({ ...common, when: sampleDate, ipAddress: "203.0.113.42", device: "Chrome on macOS", supportEmail })],
    ["Account suspended", templates.accountSuspendedEmail({ ...common, reason: "A routine account review is in progress.", supportEmail })],
    ["Account restored", templates.accountReactivatedEmail({ ...common, appUrl })],
  ]],
  ["Deposits", [
    ["Deposit request", templates.depositSubmittedEmail({ ...common, amount: "1250", method: "Bank transfer", reference: "DEP-847201" })],
    ["Deposit confirmed", templates.depositApprovedEmail({ ...common, amount: "1250", newBalance: "3850.50" })],
    ["Deposit not verified", templates.depositRejectedEmail({ ...common, amount: "1250", reason: "The payment reference could not be matched." })],
  ]],
  ["Withdrawals", [
    ["Withdrawal request", templates.withdrawalSubmittedEmail({ ...common, amount: "500", fee: "5", method: "Bank transfer" })],
    ["Withdrawal approved", templates.withdrawalApprovedEmail({ ...common, amount: "500", method: "Bank transfer", newBalance: "3350.50" })],
    ["Withdrawal declined", templates.withdrawalRejectedEmail({ ...common, amount: "500", reason: "Please confirm that your payout details are current." })],
    ["Withdrawal cancelled", templates.withdrawalCancelledEmail({ ...common, amount: "500", newBalance: "3850.50" })],
    ["Withdrawal PIN", templates.withdrawalPinEmail({ ...common, pin: "482917", expiresInMinutes: 10 })],
    ["Withdrawal PIN cancelled", templates.withdrawalPinRevokedEmail(common)],
  ]],
  ["Investment plans", [
    ["Plan active", templates.subscriptionConfirmedEmail({ ...common, planName: "Gold", principal: "2000", dailyReturnPercent: "1.2", durationDays: 30, endsAt: new Date("2026-12-27T00:00:00Z"), newBalance: "1850.50" })],
    ["Plan matured", templates.subscriptionCompletedEmail({ ...common, planName: "Gold", principal: "2000", totalEarned: "720", newBalance: "4570.50" })],
    ["Plan cancelled", templates.subscriptionCancelledEmail({ ...common, planName: "Gold", principal: "2000", newBalance: "3850.50" })],
  ]],
  ["Balance & portfolio", [
    ["Account credited", templates.accountCreditedEmail({ ...common, amount: "150", description: "Balance adjustment", newBalance: "3850.50" })],
    ["Funds removed", templates.accountDebitedEmail({ ...common, amount: "150", description: "Balance correction", newBalance: "3700.50", supportEmail })],
    ["Profit credited", templates.profitCreditedEmail({ ...common, amount: "842.30", description: "Gold plan daily return", newBalance: "3850.50" })],
    ["Position added", templates.holdingAddedEmail({ ...common, name: "Bitcoin", symbol: "BTC", units: "0.025", valueUsd: "2500", newBalance: "3850.50" })],
  ]],
]

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

const sections = groups.map(([name, emails]) => `
  <section>
    <h2>${escapeText(name)} <span class="count">${emails.length}</span></h2>
    <div class="grid">
      ${emails.map(([label, email]) => `
        <article>
          <div class="card-head"><strong>${escapeText(label)}</strong><div class="subject"><span>Subject</span>${escapeText(email.subject)}</div></div>
          <iframe title="${escapeAttribute(label)} email preview" srcdoc="${escapeAttribute(email.html)}" onload="fit(this)"></iframe>
          <details><summary>Plain text version</summary><pre>${escapeText(email.text)}</pre></details>
        </article>`).join("")}
    </div>
  </section>`).join("")

const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bowline Global Trading — email previews</title>
<style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b1120;color:#e2e8f0;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
  .top{position:sticky;top:0;z-index:10;background:rgba(11,17,32,.94);backdrop-filter:blur(8px);border-bottom:1px solid #1e293b;padding:18px 24px}.top h1{margin:0;font-size:18px}.top p{margin:4px 0 0;color:#94a3b8;font-size:13px}
  main{max-width:1500px;margin:0 auto;padding:22px 24px 60px}section{margin:24px 0 38px}h2{margin:0 0 16px;font-size:16px}.count{margin-left:6px;padding:2px 8px;border:1px solid #334155;border-radius:999px;color:#94a3b8;font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr));gap:18px}
  article{overflow:hidden;border:1px solid #263447;border-radius:14px;background:#111b2c}.card-head{padding:14px 16px 12px}.card-head strong{display:block;margin-bottom:7px;font-size:14px}.subject{font-size:13px;color:#cbd5e1}.subject span{margin-right:8px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em}iframe{width:100%;height:800px;border:0;display:block;background:#eef2f7}details{border-top:1px solid #263447;padding:12px 16px;color:#cbd5e1}summary{cursor:pointer;font-size:13px}pre{white-space:pre-wrap;color:#94a3b8;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace} 
  @media(max-width:600px){main{padding:16px 12px 40px}.top{padding:14px 16px}iframe{height:760px}}
</style>
<script>function fit(frame){try{const doc=frame.contentDocument;const height=Math.max(doc.documentElement.scrollHeight,doc.body.scrollHeight);frame.style.height=(height+8)+'px'}catch{}}</script>
</head><body><header class="top"><h1>Bowline Global Trading · Email previews</h1><p>Rendered from the current server templates. Use the plain text control to review each fallback version.</p></header><main>${sections}</main></body></html>`

const output = process.argv[2]
if (!output) throw new Error("Pass an output HTML path, for example /private/tmp/bowline-email-preview.html")
const outputPath = path.resolve(output)
await writeFile(outputPath, document, "utf8")
console.log(`Rendered ${groups.reduce((sum, [, emails]) => sum + emails.length, 0)} email previews to ${outputPath}`)
