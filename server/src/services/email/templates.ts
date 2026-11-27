/**
 * Each template returns HTML and plain text.
 *
 * Escape user- and admin-provided values before interpolating them into HTML.
 * Panel helpers escape their arguments. Paragraphs accept markup for links,
 * so callers escape interpolated values.
 *
 * Amounts arrive as decimal strings and are formatted without floating-point math.
 */

const BRAND = "Bowline Global Trading"
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL?.trim()

const PRIMARY = "#006ca5"
const INK = "#0f172a"
const BODY_TEXT = "#334155"
const MUTED = "#64748b"
const FAINT = "#94a3b8"
const BORDER = "#e2e8f0"
const CANVAS = "#eef2f7"
const SUBTLE = "#f8fafc"

/**
 * Absolute URL for the logo. Email clients will not load a relative path, and
 * SVG is stripped by Gmail, Outlook and Yahoo — so this must be a hosted PNG.
 * The Next.js app serves the reversed horizontal Bowline logo at
 * `public/brand/bowline-logo-reversed-640.png`.
 * `EMAIL_ASSET_BASE_URL` overrides the host if the assets
 * ever move to a CDN or a storage bucket.
 *
 * Read from `process.env` rather than `config/env.ts` so this module stays a
 * leaf with no imports — it is rendered by tooling and tests that never boot
 * the server.
 */
const ASSET_BASE = (
  process.env.EMAIL_ASSET_BASE_URL ??
  process.env.APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "")

const LOGO_URL = `${ASSET_BASE}/brand/bowline-logo-reversed-640.png`

/**
 * Accent colour per message type. The header rule and any status
 * chip all read from one tone, so an approval never arrives looking like a
 * rejection because two places were changed independently.
 */
type Tone = "brand" | "success" | "warn" | "danger" | "neutral"

const TONES: Record<Tone, { accent: string; soft: string; softBorder: string; deep: string }> = {
  brand: { accent: PRIMARY, soft: "#edf8ff", softBorder: "#ade0ff", deep: "#08486a" },
  success: { accent: "#059669", soft: "#ecfdf5", softBorder: "#a7f3d0", deep: "#065f46" },
  // Statuses that need attention stay within Bowline's blue palette.
  warn: { accent: PRIMARY, soft: "#edf8ff", softBorder: "#ade0ff", deep: "#08486a" },
  danger: { accent: PRIMARY, soft: "#edf8ff", softBorder: "#ade0ff", deep: "#08486a" },
  neutral: { accent: "#475569", soft: SUBTLE, softBorder: BORDER, deep: "#334155" },
}

export interface Email {
  subject: string
  html: string
  text: string
}

/** HTML-escape a value for use in either element text or a quoted attribute. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** The name we greet someone by. Raw — escape it before putting it in HTML. */
function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

/**
 * Group a decimal string for display: "13842.5" -> "13,842.50".
 *
 * String-only, because `parseFloat` on a money value is how you end up
 * emailing someone "$13,842.549999999999".
 */
function formatAmount(value: string): string {
  const trimmed = value.trim()
  const negative = trimmed.startsWith("-")
  const [whole = "0", fraction = ""] = (negative ? trimmed.slice(1) : trimmed).split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")

  return `${negative ? "-" : ""}${grouped}.${`${fraction}00`.slice(0, 2)}`
}

const money = (value: string) => `$${formatAmount(value)}`

/**
 * Trims the trailing zeros Postgres pads onto a `numeric(24,8)`.
 *
 * `0.00500000 BTC` reads like a rounding artefact; `0.005 BTC` reads like a
 * position. Whole numbers keep their form — "100" has no fraction to trim.
 */
function formatUnits(value: string): string {
  const trimmed = value.trim()
  return trimmed.includes(".") ? trimmed.replace(/\.?0+$/, "") : trimmed
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

const formatDate = (date: Date) => dateFormat.format(date)
const formatDateTime = (date: Date) => `${dateTimeFormat.format(date)} UTC`

/**
 * @param preheader The line inboxes show next to the subject. Without one they
 *   scrape the first visible text, which here would be the brand name on every
 *   single email.
 */
interface LayoutOptions {
  tone?: Tone
}

/**
 * @param heading Raw HTML, same contract as `paragraph()` — several call sites
 *   interpolate `esc(first)` or `esc(planName)` themselves, so escaping here
 *   too would render "O'Brien" as "O&#39;Brien".
 */
function layout(
  heading: string,
  body: string,
  preheader: string,
  options: LayoutOptions = {}
): string {
  const tone = TONES[options.tone ?? "brand"]

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${heading}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    /* Only progressive enhancement lives here — every critical style is inline,
       because Gmail strips <style> on forwarded mail. */
    @media only screen and (max-width:620px) {
      .sp { padding-left:22px !important; padding-right:22px !important; }
      .hero-amount { font-size:30px !important; }
      h1 { font-size:21px !important; }
    }
    a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background:${CANVAS};-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>
  <!-- Zero-width joiners stop clients padding the preview with body text. -->
  <div style="display:none;max-height:0;overflow:hidden;">&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
    <tr><td align="center" style="padding:36px 16px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

        <!-- Brand bar -->
        <tr>
          <td bgcolor="${INK}" style="background:${INK};border-radius:16px 16px 0 0;padding:22px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="left" style="vertical-align:middle;">
                  <img src="${LOGO_URL}" width="182" height="50" alt="${esc(BRAND)}"
                       style="display:block;width:182px;height:auto;max-width:100%;border:0;">
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Tone rule: a 3px accent that tells you the kind of message at a glance -->
        <tr>
          <td bgcolor="${tone.accent}" style="background:${tone.accent};font-size:0;line-height:0;height:3px;">&nbsp;</td>
        </tr>

        <!-- Content -->
        <tr>
          <td bgcolor="#ffffff" class="sp" style="background:#ffffff;padding:34px 32px 30px;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};">
            <h1 style="margin:0 0 18px;font-size:24px;line-height:1.28;font-weight:700;letter-spacing:-0.4px;color:${INK};">${heading}</h1>
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td bgcolor="${SUBTLE}" class="sp" style="background:${SUBTLE};padding:22px 32px 26px;border:1px solid ${BORDER};border-top:0;border-radius:0 0 16px 16px;">
            ${SUPPORT_EMAIL ? `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${MUTED};">Need help with your account? <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:${PRIMARY};font-weight:600;text-decoration:none;">Contact support</a></p>` : ""}
            <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${MUTED};">
              Sent by <strong style="color:${BODY_TEXT};">${BRAND}</strong>. This is an automated message; replies are not monitored.
            </p>
            <p style="margin:0;font-size:11.5px;color:${FAINT};">
              &copy; ${new Date().getFullYear()} ${BRAND}. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Prose. Carries markup, so escape interpolations with `esc()` yourself. */
function paragraph(content: string): string {
  return `<p style="margin:0 0 15px;font-size:15.5px;line-height:1.68;color:${BODY_TEXT};">${content}</p>`
}

/** Opening line of an email that needs a warmer, more spacious voice. */
function lead(content: string): string {
  return `<p style="margin:0 0 20px;font-size:17px;line-height:1.62;color:${BODY_TEXT};">${content}</p>`
}

/**
 * Numbered "what happens next" list. Rounded squares rather than circles: a
 * circle relies on border-radius, which Outlook drops, and a squashed oval
 * looks broken in a way a rounded square does not.
 */
function steps(items: Array<[string, string]>, tone: Tone = "brand"): string {
  const { accent, soft } = TONES[tone]

  const rows = items
    .map(
      ([title, detail], index) =>
        `<tr>
          <td width="34" valign="top" style="padding:0 14px ${index === items.length - 1 ? "0" : "18px"} 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="34">
              <tr><td align="center" bgcolor="${soft}" height="34" style="background:${soft};width:34px;height:34px;border-radius:10px;font-size:15px;font-weight:700;color:${accent};line-height:34px;">${index + 1}</td></tr>
            </table>
          </td>
          <td valign="top" style="padding:0 0 ${index === items.length - 1 ? "0" : "18px"};">
            <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:${INK};line-height:1.4;">${esc(title)}</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">${esc(detail)}</p>
          </td>
        </tr>`
    )
    .join("")

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;">${rows}</table>`
}

/** A row of small pills — used to show what can be traded at a glance. */
function chips(labels: string[]): string {
  const cells = labels
    .map(
      (label) =>
        `<td style="padding:0 7px 7px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td bgcolor="${SUBTLE}" style="background:${SUBTLE};border:1px solid ${BORDER};border-radius:999px;padding:6px 13px;font-size:12.5px;font-weight:600;color:${BODY_TEXT};white-space:nowrap;">${esc(label)}</td></tr>
          </table>
        </td>`
    )
    .join("")

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr>${cells}</tr></table>`
}

/** Section label inside the body, for emails long enough to need signposting. */
function sectionTitle(text: string): string {
  return `<p style="margin:26px 0 14px;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">${esc(text)}</p>`
}

/**
 * Call-to-action. The VML block is what makes it clickable across its whole
 * area in Outlook 2007–2019, which ignores padding on an anchor and would
 * otherwise render a bare line of text.
 */
function button(href: string, label: string, tone: Tone = "brand"): string {
  const { accent } = TONES[tone]
  const safeHref = esc(href)

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
    <tr><td align="center" bgcolor="${accent}" style="border-radius:10px;background:${accent};">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
        href="${safeHref}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="21%" stroke="f" fillcolor="${accent}">
        <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${esc(label)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${safeHref}" target="_blank" rel="noopener"
         style="display:inline-block;padding:15px 32px;font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:-0.1px;">${esc(label)}</a>
      <!--<![endif]-->
    </td></tr>
  </table>`
}

/**
 * The headline number on a money email. A balance buried in a data row gets
 * skimmed past; this is the one thing the reader actually opened for.
 */
function amountHero(amount: string, caption: string, tone: Tone = "brand"): string {
  const { accent, soft, softBorder } = TONES[tone]

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;background:${soft};border:1px solid ${softBorder};border-radius:14px;">
    <tr><td align="center" style="padding:24px 20px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.11em;text-transform:uppercase;color:${accent};">${esc(caption)}</p>
      <p class="hero-amount" style="margin:0;font-size:36px;line-height:1.1;font-weight:700;letter-spacing:-1px;color:${INK};">${esc(amount)}</p>
    </td></tr>
  </table>`
}

/**
 * A one-time code, sized to be read off a phone and typed into another screen.
 *
 * Wide letter-spacing and a monospace face because the reader is transcribing
 * character by character, and 0/O and 1/l are the pairs that get mistyped.
 */
/**
 * "90 minutes" is how a config value reads; "an hour and a half" is how a
 * person reads it. The PIN window is quoted to someone under mild time
 * pressure, so it is spelled the way they would say it out loud.
 */
function describeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`

  const hours = minutes / 60
  if (Number.isInteger(hours)) {
    return `${hours} hour${hours === 1 ? "" : "s"}`
  }

  const whole = Math.floor(hours)
  const rest = minutes - whole * 60
  return `${whole} hour${whole === 1 ? "" : "s"} ${rest} minutes`
}

function codeHero(code: string, caption: string): string {
  const { accent, soft, softBorder } = TONES.warn

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px;background:${soft};border:1px solid ${softBorder};border-radius:14px;">
    <tr><td align="center" style="padding:24px 20px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.11em;text-transform:uppercase;color:${accent};">${esc(caption)}</p>
      <p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;line-height:1.1;font-weight:700;letter-spacing:10px;text-indent:10px;color:${INK};">${esc(code)}</p>
    </td></tr>
  </table>`
}

/**
 * Data rows. Escapes both columns — pass plain text, never markup.
 *
 * @param title Optional header strip, so a panel reads as a labelled block
 *   rather than a floating table of values.
 */
function panel(rows: Array<[string, string]>, title?: string): string {
  const head = title
    ? `<tr><td colspan="2" style="padding:11px 18px;background:${SUBTLE};border-bottom:1px solid ${BORDER};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${MUTED};">${esc(title)}</td></tr>`
    : ""

  const cells = rows
    .map(
      ([label, value], index) =>
        `<tr>
          <td style="padding:12px 18px;font-size:14px;color:${MUTED};${index > 0 ? `border-top:1px solid ${BORDER};` : ""}">${esc(label)}</td>
          <td style="padding:12px 18px;font-size:14px;font-weight:600;color:${INK};text-align:right;${index > 0 ? `border-top:1px solid ${BORDER};` : ""}">${esc(value)}</td>
        </tr>`
    )
    .join("")

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">${head}${cells}</table>`
}

/**
 * A tinted notice. Used for the "if this wasn't you" line on security emails,
 * which has to survive being skim-read.
 */
function callout(content: string, tone: "warn" | "info" = "info"): string {
  const palette = tone === "warn" ? TONES.warn : TONES.brand

  // The 4px left bar survives clients that drop border-radius, so the notice
  // still reads as set apart rather than as an oddly tinted paragraph.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;background:${palette.soft};border:1px solid ${palette.softBorder};border-radius:12px;">
    <tr>
      <td width="4" bgcolor="${palette.accent}" style="background:${palette.accent};font-size:0;line-height:0;border-radius:12px 0 0 12px;">&nbsp;</td>
      <td style="padding:15px 18px;font-size:14.5px;line-height:1.62;color:${palette.deep};">${content}</td>
    </tr>
  </table>`
}

/**
 * A mailto link. `color` defaults to the brand blue, but links sitting inside a
 * callouts use the same blue as the surrounding brand palette.
 */
function mailLink(address: string, color: string = PRIMARY): string {
  return `<a href="mailto:${esc(address)}" style="color:${color};font-weight:600;">${esc(address)}</a>`
}

/** Only rendered when a reason was actually given. */
const reasonPanel = (reason: string | null) =>
  reason?.trim() ? panel([["Reason", reason.trim()]]) : ""

const reasonText = (reason: string | null) =>
  reason?.trim() ? ` Reason: ${reason.trim()}.` : ""

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export function welcomeEmail(params: {
  fullName: string
  username: string
  uid: string
  appUrl: string
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: `Welcome to ${BRAND}, ${first}`,
    html: layout(
      `Welcome aboard, ${esc(first)}`,
      lead(
        `Your account is open and ready to fund. Everything you trade lives in one balance — no juggling separate wallets, and every deposit, payout and position tracked in a single dashboard.`
      ) +
        chips(["Forex", "Crypto", "Stocks", "Commodities"]) +
        panel(
          [
            ["Username", params.username],
            ["Account reference", params.uid],
          ],
          "Your sign-in details"
        ) +
        sectionTitle("Getting started") +
        steps([
          [
            "Fund your account",
            "Deposit by bank transfer, crypto or digital wallet. Our team verifies each payment and credits your balance — you'll get an email either way.",
          ],
          [
            "Choose an investment plan",
            "Four plans, each with a fixed daily return and term. Commit what suits you and the returns accrue automatically.",
          ],
          [
            "Withdraw whenever you're ready",
            "Request a withdrawal to your bank or wallet. Your funds are held the moment you ask, so the balance you see is always the balance you can spend.",
          ],
        ]) +
        button(`${params.appUrl}/login`, "Sign in to your account") +
        paragraph(
          `Keep your account reference <strong style="color:${INK};">${esc(params.uid)}</strong> somewhere handy — our support team will ask for it before discussing your account.`
        ) +
        callout(
          `We'll never email you asking for your password or a withdrawal PIN. If a message asks for either, it isn't from us.`
        ),
      `Your account is open, ${first} — here's how to get started.`,
      { tone: "brand" }
    ),
    text: `Welcome aboard, ${first}.

Your ${BRAND} account is open and ready to fund. Everything you trade — forex, crypto, stocks and commodities — lives in one balance.

YOUR SIGN-IN DETAILS
Username: ${params.username}
Account reference: ${params.uid}

GETTING STARTED
1. Fund your account. Deposit by bank transfer, crypto or digital wallet. Our team verifies each payment and credits your balance.
2. Choose an investment plan. Four plans, each with a fixed daily return and term.
3. Withdraw whenever you're ready. Funds are held the moment you request, so the balance you see is the balance you can spend.

Sign in: ${params.appUrl}/login

Keep your account reference ${params.uid} handy — support will ask for it.

We will never email you asking for your password or a withdrawal PIN.`,
  }
}

export function emailVerificationEmail(params: {
  fullName: string
  verifyUrl: string
  ttlMinutes: number
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: "Confirm your email address",
    html: layout(
      "Confirm your email address",
      paragraph(
        `Hi ${esc(first)}, one quick step remains before your ${BRAND} account is ready. Confirm this email address so we can link it to your profile and send account activity, payment updates and security notices to the right inbox.`
      ) +
        button(params.verifyUrl, "Confirm my email") +
        sectionTitle("What happens next") +
        steps([
          ["Confirm this address", "Use the button above to verify that you can receive email here."],
          ["Return to your account", "Once confirmed, you can continue using your account and receive important updates here."],
        ]) +
        paragraph(
          `For your security, this confirmation link expires in ${params.ttlMinutes} minutes and works once. If it expires, request another verification email from the sign-in page.`
        ) +
        paragraph(
          `If you didn't create a ${BRAND} account, you can safely ignore this message. Someone with this email cannot sign in to your account using this confirmation link alone.`
        ),
      `Confirm your email address to finish setting up your ${BRAND} account.`,
      { tone: "brand" }
    ),
    text: `Hi ${first},

One quick step remains before your ${BRAND} account is ready. Confirm this email address so we can link it to your profile and send account activity, payment updates and security notices to the right inbox.

${params.verifyUrl}

WHAT HAPPENS NEXT
1. Confirm this address using the link above.
2. Return to your account and continue using it once confirmed.

For your security, this link expires in ${params.ttlMinutes} minutes and works once. If it expires, request another verification email from the sign-in page.

If you didn't create a ${BRAND} account, ignore this message. Someone with this email cannot sign in to your account using this confirmation link alone.`,
  }
}

export function passwordResetEmail(params: {
  fullName: string
  resetUrl: string
  ttlMinutes: number
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: "Reset your password",
    html: layout(
      "Reset your password",
      paragraph(
        `Hi ${esc(first)}, we received a request to choose a new password for your ${BRAND} account. Use the secure link below to continue. Your current password remains unchanged until you complete the reset.`
      ) +
        button(params.resetUrl, "Choose a new password") +
        sectionTitle("Before you continue") +
        steps([
          ["Open the secure link", "The link is personal to this request and can only be used once."],
          ["Choose a new password", "Use a password you do not use for other websites."],
          ["Sign in again", "After the reset, use your new password the next time you access your account."],
        ]) +
        paragraph(
          `This link expires in ${params.ttlMinutes} minutes. For your protection, it cannot be used again after the password is reset.`
        ) +
        callout(
          "If you didn't request a password reset, ignore this email. Your password will stay the same unless someone uses this link to complete the reset. If you are concerned, contact support using the details in the footer."
        ),
      `Use the secure link to reset your password. It expires in ${params.ttlMinutes} minutes.`,
      { tone: "brand" }
    ),
    text: `Hi ${first},

We received a request to choose a new password for your ${BRAND} account. Your current password remains unchanged until you complete the reset.

${params.resetUrl}

BEFORE YOU CONTINUE
1. Open the secure link. It is personal to this request and can only be used once.
2. Choose a password you do not use for other websites.
3. Sign in with your new password after the reset.

This link expires in ${params.ttlMinutes} minutes. If you didn't request a reset, ignore this email; your password will stay the same unless the link is used.`,
  }
}

export function passwordChangedEmail(params: {
  fullName: string
  supportEmail: string
}): Email {
  const first = firstNameOf(params.fullName)
  const mailto = mailLink(params.supportEmail)

  return {
    subject: "Your password was changed",
    html: layout(
      "Your password was changed",
      paragraph(
        `Hi ${esc(first)}, the password for your ${BRAND} account was changed successfully. For your protection, all other signed-in sessions have been ended. Use your new password the next time you sign in.`
      ) +
        sectionTitle("If you made this change") +
        paragraph(
          "You are all set. Keep your new password private, and avoid reusing a password from another service. We will never ask you to send your password by email or chat."
        ) +
        sectionTitle("If you did not make this change") +
        callout(
          `Contact our support team at ${mailto} as soon as possible so we can help secure your account. Do not share your password or any verification code with anyone.`,
          "warn"
        ),
      "Your password was updated. Review this message if you did not make the change.",
      { tone: "brand" }
    ),
    text: `Hi ${first},

The password for your ${BRAND} account was changed successfully. All other signed-in sessions have been ended. Use your new password the next time you sign in.

IF YOU MADE THIS CHANGE
Keep your new password private, and avoid reusing a password from another service. We will never ask you to send your password by email or chat.

IF YOU DID NOT MAKE THIS CHANGE
Contact support at ${params.supportEmail} as soon as possible so we can help secure your account. Do not share your password or any verification code with anyone.`,
  }
}

export function loginAlertEmail(params: {
  fullName: string
  when: Date
  ipAddress: string | null
  device: string | null
  supportEmail: string
}): Email {
  const first = firstNameOf(params.fullName)
  const mailto = mailLink(params.supportEmail)

  const rows: Array<[string, string]> = [["When", formatDateTime(params.when)]]
  if (params.device) rows.push(["Device", params.device])
  if (params.ipAddress) rows.push(["IP address", params.ipAddress])

  return {
    subject: "New sign-in to your account",
    html: layout(
      "New sign-in to your account",
      paragraph(
        `Hi ${esc(first)}, a sign-in to your ${BRAND} account was detected from a device we haven't seen before. Review the details below and check whether this activity was yours.`
      ) +
        panel(rows, "Sign-in details") +
        sectionTitle("What to do") +
        callout(
          `If you recognize this sign-in, no action is needed. If you do not recognize it, change your password immediately and contact ${mailto}. Do not share a verification code with anyone who contacts you.`,
          "warn"
        ),
      `Review a new sign-in to your account from ${formatDateTime(params.when)}.`,
      { tone: "brand" }
    ),
    text: `Hi ${first},

We detected a sign-in to your ${BRAND} account from a device we haven't seen before. Review the details and check whether this activity was yours.

When: ${formatDateTime(params.when)}${params.device ? `\nDevice: ${params.device}` : ""}${params.ipAddress ? `\nIP address: ${params.ipAddress}` : ""}

If you recognize this sign-in, no action is needed. If you do not recognize it, change your password immediately and contact ${params.supportEmail}. Do not share a verification code with anyone who contacts you.`,
  }
}

export function accountSuspendedEmail(params: {
  fullName: string
  reason: string | null
  supportEmail: string
}): Email {
  const first = firstNameOf(params.fullName)
  const mailto = mailLink(params.supportEmail)

  return {
    subject: "Your account has been suspended",
    html: layout(
      "Your account has been suspended",
      paragraph(
        `Hi ${esc(first)}, access to your ${BRAND} account has been paused. While the suspension is active, you cannot sign in, place trades, or submit withdrawal requests.`
      ) +
        sectionTitle("Account status") +
        reasonPanel(params.reason) +
        paragraph(
          "This notice concerns account access and does not itself change your recorded balance. Contact support if you need an update on a pending request."
        ) +
        sectionTitle("How to get help") +
        paragraph(
          `Contact our support team at ${mailto} for information about the review and any steps needed to restore access. Include your account email and the reason shown above, if one was provided. Please do not send your password or withdrawal PIN.`
        ),
      "Your account access is paused. Contact support for help with the review.",
      { tone: "brand" }
    ),
    text: `Hi ${first},

Access to your ${BRAND} account has been paused. While the suspension is active, you cannot sign in, place trades, or submit withdrawal requests.${reasonText(params.reason)}

This notice concerns account access and does not itself change your recorded balance. Contact support if you need an update on a pending request.

Contact ${params.supportEmail} for information about the review and any steps needed to restore access. Include your account email and the reason shown above, if provided. Never send your password or withdrawal PIN.`,
  }
}

export function accountReactivatedEmail(params: {
  fullName: string
  appUrl: string
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: "Your account has been restored",
    html: layout(
      "Your account has been restored",
      paragraph(
        `Hi ${esc(first)}, the suspension on your ${BRAND} account has been lifted and account access is restored. You can sign in again and use the account features available to you, including deposits, trading and withdrawals.`
      ) +
        button(`${params.appUrl}/login`, "Sign in to your account", "success") +
        sectionTitle("Before you continue") +
        paragraph(
          "Review your account activity and confirm that your contact details are current. If you had a request in progress while access was paused, check its status after signing in."
        ) +
        callout(
          "If you do not recognize this account change or cannot sign in, contact support using the details in the footer.",
          "info"
        ),
      "Your account access is restored. Sign in to review your account activity.",
      { tone: "success" }
    ),
    text: `Hi ${first},

The suspension on your ${BRAND} account has been lifted and account access is restored. You can sign in again and use the account features available to you, including deposits, trading and withdrawals.

Sign in: ${params.appUrl}/login

After signing in, review your account activity and confirm that your contact details are current. If you had a request in progress while access was paused, check its status. If you do not recognize this change or cannot sign in, contact support.`,
  }
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

export function depositSubmittedEmail(params: {
  fullName: string
  amount: string
  method: string
  reference: string | null
}): Email {
  const first = firstNameOf(params.fullName)

  const rows: Array<[string, string]> = [["Method", params.method]]
  if (params.reference?.trim()) rows.push(["Reference", params.reference.trim()])

  return {
    subject: "We've received your deposit request",
    html: layout(
      "Deposit request received",
      paragraph(
        `Hi ${esc(first)}, your deposit request has reached us. Our team is checking the payment details before adding any funds to your account.`
      ) +
        amountHero(money(params.amount), "Pending verification", "brand") +
        panel(rows, "Payment details") +
        sectionTitle("What happens next") +
        steps([
          ["Payment review", "We compare the submitted payment details with the funds received."],
          ["Account update", "If the payment is verified, the deposit will be credited and we will send you a confirmation."],
          ["If we cannot verify it", "We will email you with the available information and the next step."],
        ]) +
        paragraph(
          "This amount has not been credited yet. Please keep your payment confirmation until the review is complete, and avoid submitting the same deposit again while this request is pending. We will email you when its status changes."
        ),
      `Your ${money(params.amount)} deposit request is under review.`,
      { tone: "brand" }
    ),
    text: `Hi ${first},

Your deposit request has reached us. Our team is checking the payment details before adding any funds to your account.

Amount: ${money(params.amount)}
Method: ${params.method}${params.reference?.trim() ? `\nReference: ${params.reference.trim()}` : ""}

WHAT HAPPENS NEXT
1. We compare the submitted payment details with the funds received.
2. If verified, the deposit will be credited and we will send a confirmation.
3. If we cannot verify it, we will email you with the available information and next step.

This amount has not been credited yet. Keep your payment confirmation until the review is complete, and avoid submitting the same deposit again while this request is pending.`,
  }
}

export function depositApprovedEmail(params: {
  fullName: string
  amount: string
  newBalance: string
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: "Your deposit has been credited",
    html: layout(
      "Deposit confirmed",
      paragraph(
        `Hi ${esc(first)}, we have verified your deposit and added it to your account balance. The funds are now included in the available balance shown below.`
      ) +
        amountHero(money(params.amount), "Credited to your account", "success") +
        panel(
          [
            ["Deposit credited", money(params.amount)],
            ["Updated account balance", money(params.newBalance)],
          ],
          "Account summary"
        ) +
        sectionTitle("Next step") +
        paragraph(
          "You can sign in to review your updated balance and recent account activity. Keep this message with your payment records for reference."
        ),
      `${money(params.amount)} was verified and added to your account balance.`,
      { tone: "success" }
    ),
    text: `Hi ${first},

We have verified your deposit and added it to your account balance.

Deposit credited: ${money(params.amount)}
Updated account balance: ${money(params.newBalance)}

Sign in to review your updated balance and recent account activity. Keep this message with your payment records for reference.`,
  }
}

export function depositRejectedEmail(params: {
  fullName: string
  amount: string
  reason: string | null
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: "We couldn't verify your deposit",
    html: layout(
      "Deposit not verified",
      paragraph(
        `Hi ${esc(first)}, we could not match the payment details to a verified deposit, so ${money(params.amount)} has not been added to your account.`
      ) +
        reasonPanel(params.reason) +
        sectionTitle("What you can do") +
        steps([
          ["Review the payment details", "Check the payment method, amount and reference you submitted against your receipt."],
          ["Allow for processing", "If you have just paid, check with your payment provider that the transfer has completed."],
          ["Contact support if needed", "If the details are correct or you are unsure, contact support and include the payment reference."],
        ]) +
        paragraph(
          "No funds have been credited to your account from this request. Keep your payment receipt so the team can review it if you contact support."
        ),
      `Your ${money(params.amount)} deposit could not be verified. Review the payment details for next steps.`,
      { tone: "brand" }
    ),
    text: `Hi ${first},

We could not match the payment details to a verified deposit, so ${money(params.amount)} has not been added to your account.${reasonText(params.reason)}

WHAT YOU CAN DO
1. Check the payment method, amount and reference against your receipt.
2. If you have just paid, check with your payment provider that the transfer has completed.
3. If the details are correct or you are unsure, contact support and include the payment reference.

No funds were credited from this request. Keep your payment receipt in case the team needs to review it.`,
  }
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------

export function withdrawalSubmittedEmail(params: {
  fullName: string
  amount: string
  fee: string
  method: string
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: "Withdrawal request received",
    html: layout(
      "Withdrawal request received",
      paragraph(
        `Hi ${esc(first)}, your withdrawal request has been received and is waiting for review. The amount is being held while the request is processed, so it is temporarily unavailable for other account activity.`
      ) +
        amountHero(money(params.amount), "Awaiting review", "brand") +
        panel(
          [
            ["Requested amount", money(params.amount)],
            ["Fee", money(params.fee)],
            ["Method", params.method],
          ],
          "Request details"
        ) +
        sectionTitle("While it is being reviewed") +
        steps([
          ["Review", "The request and payout details are checked before it is approved or declined."],
          ["Status update", "We will email you when the review is complete."],
          ["Check your account", "You can sign in to review your request and its current status."],
        ]) +
        paragraph(
          "The requested funds remain on hold during review and are not available to trade. If the request is declined or cancelled, we will send a separate update about the funds."
        ),
      `Your ${money(params.amount)} withdrawal request is awaiting review.`,
      { tone: "brand" }
    ),
    text: `Hi ${first},

Your withdrawal request has been received and is waiting for review. The amount is held during processing.

Requested amount: ${money(params.amount)}
Fee: ${money(params.fee)}
Method: ${params.method}

WHILE IT IS BEING REVIEWED
1. We check the request and payout details.
2. We will email you when the review is complete.
3. You can sign in to review the request status.

The requested funds remain on hold and are not available to trade. If the request is declined or cancelled, we will send a separate update.`,
  }
}

export function withdrawalApprovedEmail(params: {
  fullName: string
  amount: string
  method: string
  newBalance: string
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: "Your withdrawal has been approved",
    html: layout(
      "Withdrawal approved",
      paragraph(
        `Hi ${esc(first)}, your withdrawal has been approved and sent to the payout method shown below. The receiving bank or network controls when it appears in the destination account.`
      ) +
        amountHero(money(params.amount), "On its way to you", "success") +
        panel(
          [
            ["Method", params.method],
            ["Remaining balance", money(params.newBalance)],
          ],
          "Payment details"
        ) +
        paragraph(
          "Processing times vary by bank and payment network. If the payment has not appeared after the usual processing period for your method, contact your provider first and then our support team if you still need help."
        ),
      `${money(params.amount)} approved and on its way.`,
      { tone: "success" }
    ),
    text: `Hi ${first},

Your withdrawal has been approved and sent to the payout method shown below.

Amount: ${money(params.amount)}
Method: ${params.method}
Remaining balance: ${money(params.newBalance)}

Processing times vary by bank and payment network. If the payment has not appeared after the usual processing period for your method, contact your provider first and then support if you still need help.`,
  }
}

export function withdrawalRejectedEmail(params: {
  fullName: string
  amount: string
  reason: string | null
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: "Your withdrawal was declined",
    html: layout(
      "Withdrawal declined",
      paragraph(
        `Hi ${esc(first)}, your withdrawal request for ${money(params.amount)} was not approved. The information below explains the outcome and what you can do next.`
      ) +
        reasonPanel(params.reason) +
        amountHero(money(params.amount), "Returned to available balance", "brand") +
        sectionTitle("Next steps") +
        steps([
          ["Review the reason", "Check the review note above and confirm that your payout details are current."],
          ["Update your details if needed", "Correct any information that may have prevented the request from being processed."],
          ["Submit again when ready", "The funds are available in your account, so you can make a new request after checking the details."],
        ]) +
        paragraph(
          "The hold has been released and the funds are available in your account again. If you believe this decision was made in error, contact support before submitting another request."
        ),
      `Your ${money(params.amount)} withdrawal request was declined and the hold has been released.`,
      { tone: "brand" }
    ),
    text: `Hi ${first},

Your withdrawal request for ${money(params.amount)} was not approved.${reasonText(params.reason)}

The hold has been released and the funds are available in your account again.

NEXT STEPS
1. Review the note above and confirm that your payout details are current.
2. Update any information that may have prevented the request from being processed.
3. Submit a new request when ready. If you believe the decision was made in error, contact support first.`,
  }
}

export function withdrawalCancelledEmail(params: {
  fullName: string
  amount: string
  newBalance: string
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: "Your withdrawal was cancelled",
    html: layout(
      "Withdrawal cancelled",
      paragraph(
        `Hi ${esc(first)}, your withdrawal request for ${money(params.amount)} has been cancelled. The hold has been removed and the funds are available in your account again.`
      ) +
        amountHero(money(params.amount), "Available again", "brand") +
        panel(
          [
            ["Request status", "Cancelled"],
            ["Available balance", money(params.newBalance)],
          ],
          "Account summary"
        ) +
        sectionTitle("Need to withdraw again?") +
        paragraph(
          "Review the payout details and submit a new request from your account when you are ready. The cancelled request will not continue processing."
        ) +
        callout(
          "If you did not cancel this request, contact support as soon as possible and review your recent account activity.",
          "warn"
        ),
      `${money(params.amount)} is available again.`,
      { tone: "warn" }
    ),
    text: `Hi ${first},

Your withdrawal request for ${money(params.amount)} has been cancelled. The hold has been removed and the funds are available in your account again.

Available balance: ${money(params.newBalance)}

The cancelled request will not continue processing. Review the payout details before submitting a new request.

If you did not cancel this request, contact support as soon as possible and review your recent account activity.`,
  }
}

/**
 * Carries the PIN itself.
 *
 * This is a deliberate trade the operator made with their eyes open: the PIN is
 * a second factor, and email already controls password reset, so an inbox that
 * falls into the wrong hands can now both reset the password and clear the PIN
 * check. It ships this way because relaying every PIN by hand was costing more
 * in practice than the separation was buying.
 *
 * What the copy must therefore NOT say is the old line about never sending a
 * PIN by email — we now do. The warning that survives is the one still true and
 * still useful: nobody, staff included, should ever ask them to hand it over.
 */
/**
 * Carries the PIN itself.
 *
 * This is a deliberate trade the operator made with their eyes open: the PIN is
 * a second factor, and email already controls password reset, so an inbox that
 * falls into the wrong hands can now both reset the password and clear the PIN
 * check. It ships this way because relaying every PIN by hand was costing more
 * in practice than the separation was buying.
 *
 * Two things the copy has to get right, and they pull against each other.
 *
 * The client will often ALSO be sent this PIN by their account manager in chat.
 * If the email does not say so, a legitimate message from the desk looks exactly
 * like the scam the email just warned them about — and the honest ones are the
 * people who will hesitate. So the mail states plainly that this happens and
 * that the two will match.
 *
 * But "your manager may send it to you" must not decay into "share it when
 * asked". The line that survives is therefore about DIRECTION, not about who:
 * it may be sent TO them, it is never to be sent BACK — to anyone, staff
 * included. That distinction is the whole security rule, so it is stated as a
 * rule rather than as a caveat.
 */
export function withdrawalPinEmail(params: {
  fullName: string
  pin: string
  expiresInMinutes: number
}): Email {
  const first = firstNameOf(params.fullName)
  const window = describeMinutes(params.expiresInMinutes)

  return {
    subject: "Your withdrawal PIN",
    html: layout(
      "Your withdrawal PIN",
      paragraph(
        `Hi ${esc(first)}, use this one-time PIN to confirm the withdrawal request you are making. Keep the code private while you complete the confirmation.`
      ) +
        codeHero(params.pin, "Your withdrawal PIN") +
        sectionTitle("Use your PIN") +
        steps([
          ["Enter it on the withdrawal page", "Use the code above to confirm the request you are currently making."],
          ["Use it before it expires", `This code is valid for ${esc(window)} and can only be used once.`],
          ["Check the request details", "Make sure the amount and payout method on the withdrawal page are correct before confirming."],
        ]) +
        paragraph(
          "If you did not start a withdrawal, do not use this code. Contact support using the details in the footer and review your account activity."
        ) +
        callout(
          "Your account manager may also send you this same PIN in your chat with them. That is normal — it will be the same number you see above. Checking that the two match is a good habit.",
          "info"
        ) +
        callout(
          `Never send this PIN to anyone. We may send a PIN to you, but nobody from ${BRAND} will ever ask you to send one back, read it out, or forward it — not by email, chat or phone. If someone asks, it is not us.`,
          "warn"
        ),
      `Your withdrawal PIN is ${params.pin} — it expires in ${window}.`,
      { tone: "brand" }
    ),
    text: `Hi ${first},

Your withdrawal PIN is ${params.pin}

It expires in ${window} and can only be used once. Enter it on the withdrawal page to confirm your request.

Your account manager may also send you this same PIN in your chat with them. That is normal — it will be the same number shown above, and checking that the two match is a good habit.

Never send this PIN to anyone. We may send a PIN to you, but nobody from ${BRAND} will ever ask you to send one back, read it out, or forward it — not by email, chat or phone. If someone asks, it is not us.`,
  }
}

export function withdrawalPinRevokedEmail(params: {
  fullName: string
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: "Your withdrawal PIN was cancelled",
    html: layout(
      "Your withdrawal PIN was cancelled",
      paragraph(
        `Hi ${esc(first)}, the withdrawal PIN issued for your ${BRAND} account has been cancelled. It is no longer valid and cannot be used to confirm a withdrawal.`
      ) +
        sectionTitle("If you still need to withdraw") +
        paragraph(
          "Contact your account manager to request a new PIN, then use it only on the withdrawal page for the request you are making. Review the request details before confirming."
        ) +
        callout(
          `The old PIN cannot be used. Never send a PIN to anyone or read it out; ${BRAND} will not ask you to share it by email, chat or phone.`,
          "warn"
        ),
      "Your previous withdrawal PIN has been cancelled and is no longer valid.",
      { tone: "neutral" }
    ),
    text: `Hi ${first},

The withdrawal PIN issued for your ${BRAND} account has been cancelled. It is no longer valid and cannot be used to confirm a withdrawal.

If you still need to withdraw, contact your account manager to request a new PIN. Use it only on the withdrawal page for your current request, after reviewing the details.

The old PIN cannot be used. Never send a PIN to anyone or read it out; ${BRAND} will not ask you to share it by email, chat or phone.`,
  }
}

// ---------------------------------------------------------------------------
// Plans and balance
// ---------------------------------------------------------------------------

export function subscriptionConfirmedEmail(params: {
  fullName: string
  planName: string
  principal: string
  dailyReturnPercent: string
  durationDays: number
  endsAt: Date
  newBalance: string
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: `Your ${params.planName} plan is active`,
    html: layout(
      `Your ${esc(params.planName)} plan is active`,
      paragraph(
        `Hi ${esc(first)}, your capital has been committed and the plan is now running.`
      ) +
        amountHero(money(params.principal), "Principal committed", "success") +
        panel(
          [
            ["Plan", params.planName],
            ["Daily return", `${params.dailyReturnPercent}%`],
            ["Duration", `${params.durationDays} days`],
            ["Matures on", formatDate(params.endsAt)],
            ["Available balance", money(params.newBalance)],
          ],
          "Plan terms"
        ) +
        sectionTitle("Your plan timeline") +
        steps([
          ["Plan is active", "The principal shown above is committed to this plan for its stated duration."],
          ["Returns are credited", "Returns follow the plan terms shown in this email and are added to your account balance."],
          ["At maturity", `The plan ends on ${formatDate(params.endsAt)}. The principal and any amount earned are reflected in your account balance.`],
        ]) +
        paragraph(
          "You can review the plan in the Plans section of your account. If you choose to cancel early, the principal is returned and payouts already credited stay with you; no further returns accrue after cancellation."
        ),
      `${money(params.principal)} committed — matures ${formatDate(params.endsAt)}.`,
      { tone: "success" }
    ),
    text: `Hi ${first},

Your ${params.planName} plan is active.

Principal: ${money(params.principal)}
Daily return: ${params.dailyReturnPercent}%
Duration: ${params.durationDays} days
Matures on: ${formatDate(params.endsAt)}
Available balance: ${money(params.newBalance)}

Returns accrue daily under the plan terms and are credited to your balance. You can review this plan in the Plans section of your account. If you choose to cancel early, the principal is returned and payouts already credited stay with you; no further returns accrue after cancellation.`,
  }
}

export function subscriptionCompletedEmail(params: {
  fullName: string
  planName: string
  principal: string
  totalEarned: string
  newBalance: string
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: `Your ${params.planName} plan has matured`,
    html: layout(
      `Your ${esc(params.planName)} plan has matured`,
      paragraph(
        `Hi ${esc(first)}, your plan has run its full term. The principal has been returned to your balance alongside everything it earned.`
      ) +
        amountHero(money(params.totalEarned), "Total earned", "success") +
        panel(
          [
            ["Principal returned", money(params.principal)],
            ["New balance", money(params.newBalance)],
          ],
          "Plan summary"
        ) +
        sectionTitle("Your balance is ready") +
        paragraph(
          "The principal and earnings shown above are now available in your account balance. Sign in to review your account activity, keep these figures with your records, or decide what to do with the available funds next."
        ),
      `${money(params.principal)} returned plus ${money(params.totalEarned)} earned.`,
      { tone: "success" }
    ),
    text: `Hi ${first},

Your ${params.planName} plan has matured.

Principal returned: ${money(params.principal)}
Total earned: ${money(params.totalEarned)}
New balance: ${money(params.newBalance)}

The principal and earnings are now available in your account balance. Sign in to review your account activity and decide what to do with the available funds next.`,
  }
}

export function subscriptionCancelledEmail(params: {
  fullName: string
  planName: string
  principal: string
  newBalance: string
}): Email {
  const first = firstNameOf(params.fullName)

  return {
    subject: `Your ${params.planName} plan was cancelled`,
    html: layout(
      `Your ${esc(params.planName)} plan was cancelled`,
      paragraph(
        `Hi ${esc(first)}, your ${esc(params.planName)} plan has been closed before its scheduled end date. The principal shown below has been returned to your available balance.`
      ) +
        amountHero(money(params.principal), "Principal returned", "brand") +
        panel(
          [
            ["Plan", params.planName],
            ["Principal returned", money(params.principal)],
            ["Available balance", money(params.newBalance)],
          ],
          "Account summary"
        ) +
        sectionTitle("What happens now") +
        paragraph(
          "Returns already credited to your account remain yours. No additional returns will accrue on this plan after its cancellation. You can review the updated balance and account activity after signing in."
        ),
      `${money(params.principal)} returned to your balance.`,
      { tone: "warn" }
    ),
    text: `Hi ${first},

Your ${params.planName} plan was closed before its scheduled end date.

Principal returned: ${money(params.principal)}
Available balance: ${money(params.newBalance)}

Returns already credited remain in your account. No additional returns will accrue on this plan after cancellation. Sign in to review the updated balance and account activity.`,
  }
}

export function accountCreditedEmail(params: {
  fullName: string
  amount: string
  description: string | null
  newBalance: string
}): Email {
  const first = firstNameOf(params.fullName)
  const details = params.description?.trim()

  return {
    subject: "Your account has been credited",
    html: layout(
      "Account credited",
      paragraph(
        `Hi ${esc(first)}, a credit has been posted to your ${BRAND} account. The summary below shows the amount added and your updated balance.`
      ) +
        amountHero(money(params.amount), "Added to your balance", "success") +
        panel(
          [
            ...(details ? ([["Credit details", details]] as Array<[string, string]>) : []),
            ["Amount credited", money(params.amount)],
            ["Updated balance", money(params.newBalance)],
          ],
          "Account summary"
        ) +
        sectionTitle("Review your activity") +
        paragraph(
          "Sign in to see this credit alongside your recent account activity. If you do not recognize the credit or the details do not look right, contact support using the details in the footer."
        ),
      `${money(params.amount)} was credited to your account.`,
      { tone: "success" }
    ),
    text: `Hi ${first},

${money(params.amount)} was credited to your account.${details ? `\n\nCredit details: ${details}` : ""}

Amount credited: ${money(params.amount)}
Updated balance: ${money(params.newBalance)}

Sign in to see this credit alongside your recent account activity. If you do not recognize it or the details do not look right, contact support.`,
  }
}

/**
 * A position booked by the desk, with the cash that came with it.
 *
 * Separate from `accountCreditedEmail` rather than a variant of it: the
 * interesting part here is the position. Someone who wired money for 0.05 BTC
 * wants to see the units they were credited, not just a dollar figure, and
 * folding that into the generic credit mail would have made every other credit
 * carry two empty rows.
 *
 * Only sent when the ledger actually moved. Recording an asset the account was
 * never funded for is bookkeeping, not news.
 */
export function holdingAddedEmail(params: {
  fullName: string
  name: string
  symbol: string
  units: string
  valueUsd: string
  newBalance: string
}): Email {
  const first = firstNameOf(params.fullName)
  const position = `${formatUnits(params.units)} ${params.symbol}`

  return {
    subject: `${params.name} added to your portfolio`,
    html: layout(
      "Position added",
      paragraph(
        `Hi ${esc(first)}, a new ${esc(params.name)} position has been recorded in your portfolio. The position and account value are listed below so you can compare this update with your recent activity.`
      ) +
        amountHero(money(params.valueUsd), "Added to your balance", "success") +
        panel(
          [
            ["Asset", params.name],
            ["Position", position],
            ["Value", money(params.valueUsd)],
            ["New balance", money(params.newBalance)],
          ],
          "Position details"
        ) +
        sectionTitle("Review your portfolio") +
        paragraph(
          "Sign in to view the position with your other portfolio activity. The value shown in this email is the value recorded for this update; your account activity remains the place to review the latest information."
        ),
      // layout() interpolates the preheader raw — the symbol is admin-entered.
      `${esc(position)} — ${money(params.valueUsd)} added to your balance.`,
      { tone: "success" }
    ),
    text: `Hi ${first},

A new ${params.name} position has been recorded in your portfolio.

Asset: ${params.name}
Position: ${position}
Value: ${money(params.valueUsd)}

New balance: ${money(params.newBalance)}

Sign in to view the position with your other portfolio activity. The value shown in this email is the value recorded for this update; review your account activity for the latest information.`,
  }
}

/**
 * Profit, as its own event.
 *
 * Split from `accountCreditedEmail` because they were indistinguishable in an
 * inbox: earning a return and having a typo corrected both arrived as "Your
 * account has been credited". Profit is what the platform sells, so it gets the
 * subject line, the caption that say so.
 */
export function profitCreditedEmail(params: {
  fullName: string
  amount: string
  description: string | null
  newBalance: string
}): Email {
  const first = firstNameOf(params.fullName)
  const details = params.description?.trim()

  return {
    subject: `Profit credited — ${money(params.amount)}`,
    html: layout(
      "Profit credited",
      paragraph(
        `Hi ${esc(first)}, a profit credit has been posted to your ${BRAND} account. The amount shown below has been added to your balance.`
      ) +
        amountHero(money(params.amount), "Profit earned", "success") +
        panel(
          [
            ...(details
              ? ([["Details", details]] as Array<[string, string]>)
              : []),
            ["New balance", money(params.newBalance)],
          ],
          "Profit summary"
        ) +
        sectionTitle("Review the credit") +
        paragraph(
          "Sign in to see this credit in your recent account activity and compare it with the related investment or account entry. The updated balance below includes this credit."
        ),
      `${money(params.amount)} profit was credited to your account.`,
      { tone: "success" }
    ),
    text: `Hi ${first},

Profit of ${money(params.amount)} has been credited to your account.${details ? `\n\nDetails: ${details}` : ""}

New balance: ${money(params.newBalance)}`,
  }
}

/**
 * Money leaving an account by an admin's hand.
 *
 * The counterpart to `accountCreditedEmail`, and the last silent path: every
 * way money *arrived* notified the user, while a manual debit and a reversed
 * holding took it back without a word.
 *
 * Carries a support address, because the one thing someone will want after
 * reading this is a way to ask why.
 */
export function accountDebitedEmail(params: {
  fullName: string
  amount: string
  description: string | null
  newBalance: string
  supportEmail: string
}): Email {
  const first = firstNameOf(params.fullName)
  const details = params.description?.trim()
  const mailto = mailLink(params.supportEmail)

  return {
    subject: `Funds removed from your account — ${money(params.amount)}`,
    html: layout(
      "Funds removed",
      paragraph(
        `Hi ${esc(first)}, an account adjustment has been recorded and ${money(params.amount)} has been removed from your available balance. The summary below shows the information recorded for this update.`
      ) +
        amountHero(money(params.amount), "Removed from your balance", "warn") +
        panel(
          [
            ...(details
              ? ([["Reason", details]] as Array<[string, string]>)
              : []),
            ["New balance", money(params.newBalance)],
          ],
          "Adjustment summary"
        ) +
        sectionTitle("Review this update") +
        paragraph(
          `Sign in to review this adjustment alongside your recent account activity. If the amount or reason does not look right, contact ${mailto} and include the details shown above so our team can investigate.`
        ),
      `${money(params.amount)} removed from your balance.`,
      { tone: "warn" }
    ),
    text: `Hi ${first},

An account adjustment has been recorded and ${money(params.amount)} has been removed from your available balance.${details ? `\n\nReason: ${details}` : ""}

New balance: ${money(params.newBalance)}

Sign in to review this adjustment with your recent account activity. If the amount or reason does not look right, contact ${params.supportEmail} and include the details shown above so our team can investigate.`,
  }
}
