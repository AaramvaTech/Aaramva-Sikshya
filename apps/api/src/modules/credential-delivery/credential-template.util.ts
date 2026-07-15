/**
 * MAIL-3 — per-recipient credential templates + tenant-aware sender identity.
 * Pure functions (unit-tested; no DB, no I/O). The poller resolves a row's
 * `template_type` + `schoolContext()` into an email/SMS body and a From/Reply-To.
 *
 * Sender identity model (spec §1):
 *  - Tenant-scoped (STAFF / GUARDIAN_SELF / STUDENT_SELF / STUDENT_VIA_GUARDIAN):
 *    From "{School} (via Aaramva Shikshya)", Reply-To {school official email}
 *    (omitted when null — never the platform address).
 *  - Platform-scoped (NEW_SCHOOL_OWNER): From "Aaramva Shikshya", no Reply-To.
 */

export const CREDENTIAL_TEMPLATE_TYPES = [
  'NEW_SCHOOL_OWNER',
  'STAFF',
  'GUARDIAN_SELF',
  'STUDENT_VIA_GUARDIAN',
  'STUDENT_SELF',
] as const;
export type CredentialTemplateType = (typeof CREDENTIAL_TEMPLATE_TYPES)[number];

const PLATFORM_NAME = 'Aaramva Shikshya';
// Devanagari line is allowed in email (length is free); footer only on tenant sends.
const FOOTER_HTML =
  '<p style="color:#8a8a8a;font-size:12px">powered by Aaramva Shikshya (आरामवा शिक्षा)</p>';
const FOOTER_TEXT = '— powered by Aaramva Shikshya (आरामवा शिक्षा)';

export interface SchoolIdentity {
  name: string;
  code: string; // tenant slug (what the mobile app asks for)
  loginUrl: string;
  officialEmail: string | null;
}

export interface CredentialContext {
  school: SchoolIdentity;
  loginEmail: string; // username
  tempPassword: string;
  ownerName: string; // the account owner's display name
  ownerRole: string | null;
  studentName?: string; // STUDENT_VIA_GUARDIAN only
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** Derive the template type from the account owner's role + guardian-routing. */
export function deriveTemplateType(
  role: string | null | undefined,
  guardianRouted: boolean,
): CredentialTemplateType {
  switch (role) {
    case 'SCHOOL_OWNER':
      return 'NEW_SCHOOL_OWNER';
    case 'PARENT':
      return 'GUARDIAN_SELF';
    case 'STUDENT':
      return guardianRouted ? 'STUDENT_VIA_GUARDIAN' : 'STUDENT_SELF';
    default:
      return 'STAFF';
  }
}

export function isPlatformScoped(type: CredentialTemplateType): boolean {
  return type === 'NEW_SCHOOL_OWNER';
}

/** From display name + optional Reply-To for a send of this type (spec §1). */
export function resolveSenderIdentity(
  type: CredentialTemplateType,
  school: Pick<SchoolIdentity, 'name' | 'officialEmail'>,
): { fromName: string; replyTo?: string } {
  if (isPlatformScoped(type)) return { fromName: PLATFORM_NAME };
  const identity: { fromName: string; replyTo?: string } = {
    fromName: `${school.name} (via ${PLATFORM_NAME})`,
  };
  // Fallback chain: null official email → omit Reply-To. NEVER the platform address.
  if (school.officialEmail) identity.replyTo = school.officialEmail;
  return identity;
}

function roleLabel(role: string): string {
  const s = role.toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function subjectFor(type: CredentialTemplateType, ctx: CredentialContext): string {
  const s = ctx.school.name;
  switch (type) {
    case 'NEW_SCHOOL_OWNER':
      return `Your ${s} administrator account on ${PLATFORM_NAME}`;
    case 'STAFF':
      return `Your ${s} staff account`;
    case 'GUARDIAN_SELF':
      return `Your ${s} parent account`;
    case 'STUDENT_VIA_GUARDIAN':
      return `Login details for ${ctx.studentName ?? ctx.ownerName} at ${s}`;
    case 'STUDENT_SELF':
      return `Your ${s} student account`;
  }
}

function introFor(type: CredentialTemplateType, ctx: CredentialContext): string {
  const s = ctx.school.name;
  switch (type) {
    case 'NEW_SCHOOL_OWNER':
      return `Your school administrator account for ${s} on ${PLATFORM_NAME} has been created.`;
    case 'STAFF':
      return `Your staff account at ${s}${ctx.ownerRole ? ` (${roleLabel(ctx.ownerRole)})` : ''} has been created.`;
    case 'GUARDIAN_SELF':
      return `Your parent/guardian account at ${s} has been created.`;
    case 'STUDENT_VIA_GUARDIAN':
      return `Login details for ${ctx.studentName ?? ctx.ownerName} at ${s} — for your child.`;
    case 'STUDENT_SELF':
      return `Your student account at ${s} has been created.`;
  }
}

/** Render the credential email (subject + html + text) for a template type. */
export function renderCredentialEmail(
  type: CredentialTemplateType,
  ctx: CredentialContext,
): { subject: string; html: string; text: string } {
  const { school, loginEmail, tempPassword } = ctx;
  const platform = isPlatformScoped(type);
  const intro = introFor(type, ctx);

  const text = [
    intro,
    '',
    `School code: ${school.code}`,
    `Login email: ${loginEmail}`,
    `Temporary password: ${tempPassword}`,
    '',
    `How to log in:`,
    `Web: ${school.loginUrl}`,
    `Mobile: open the ${PLATFORM_NAME} app, enter the school code "${school.code}", then log in.`,
    '',
    `For your security, you will be asked to change this password the first time you log in.`,
    ...(platform ? [] : ['', FOOTER_TEXT]),
  ].join('\n');

  const html = `<p>${esc(intro)}</p>
<ul>
  <li><strong>School code:</strong> ${esc(school.code)}</li>
  <li><strong>Login email:</strong> ${esc(loginEmail)}</li>
  <li><strong>Temporary password:</strong> ${esc(tempPassword)}</li>
</ul>
<p><strong>How to log in</strong><br/>
Web: <a href="${school.loginUrl}">${esc(school.loginUrl)}</a><br/>
Mobile: open the ${PLATFORM_NAME} app, enter the school code "<strong>${esc(school.code)}</strong>", then log in.</p>
<p>For your security, you will be asked to change this password the first time you log in.</p>${platform ? '' : `\n${FOOTER_HTML}`}`;

  return { subject: subjectFor(type, ctx), html, text };
}

/**
 * Render the ASCII SMS body (≤160 chars = 1 Sparrow credit). School/student names
 * are ASCII-stripped (Nepali names → fall back to the code / a generic word) and
 * length-capped so the invariant holds for realistic max-length inputs.
 */
export function renderCredentialSms(type: CredentialTemplateType, ctx: CredentialContext): string {
  const ascii = (v: string): string => v.replace(/[^\x20-\x7E]/g, '').trim();
  const s = (ascii(ctx.school.name) || ctx.school.code).slice(0, 32);
  const code = ctx.school.code.slice(0, 24);
  const pw = ctx.tempPassword;
  const stu = (ascii(ctx.studentName ?? ctx.ownerName) || 'the student').slice(0, 24);
  switch (type) {
    case 'NEW_SCHOOL_OWNER':
      return `${PLATFORM_NAME}: ${s} admin temp password ${pw}. Change it on first login.`;
    case 'STAFF':
      return `${s}: staff temp password ${pw}. Change it on first login. School code ${code}.`;
    case 'GUARDIAN_SELF':
      return `${s}: parent temp password ${pw}. Change it on first login. School code ${code}.`;
    case 'STUDENT_VIA_GUARDIAN':
      return `${s}: ${stu} temp password ${pw}. Change on first login. Code ${code}.`;
    case 'STUDENT_SELF':
      return `${s}: student temp password ${pw}. Change it on first login. School code ${code}.`;
  }
}
