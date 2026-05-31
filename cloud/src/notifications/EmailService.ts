import { Resend } from 'resend';
import { prisma } from '../db.js';
import { getConfig } from '../config.js';
import { logger } from '../observability/logger.js';

/**
 * EmailService — Resend wrapper for the P4.4 weekly digest of unseen
 * AgentEvents.
 *
 * Gated on RESEND_API_KEY. Without it, all operations no-op (logged once
 * on first call) — dev / preview environments never email anyone by
 * accident. The Synthesist agent (WS-11) will reuse this transport when
 * it lands; the contract here stays generic.
 *
 * Per-user idempotency: the digest worker bumps User.lastDigestAt only
 * on a successful send. The tick handler short-circuits users whose
 * lastDigestAt is inside the current 7-day bucket — so a manual re-run
 * doesn't re-email anyone.
 */

export interface DigestEvent {
  agent: string;
  kind: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  createdAt: Date;
}

export interface DigestPayload {
  userEmail: string;
  userDisplayName?: string;
  events: DigestEvent[];
  /** Date the digest covers (the start of the rolled-up week). */
  since: Date;
}

export class EmailService {
  private resend: Resend | null = null;
  private warned = false;

  private getResend(): Resend | null {
    if (this.resend) return this.resend;
    const cfg = getConfig();
    if (!cfg.RESEND_API_KEY) {
      if (!this.warned) {
        logger.info('EmailService: RESEND_API_KEY unset, all email operations are no-ops');
        this.warned = true;
      }
      return null;
    }
    this.resend = new Resend(cfg.RESEND_API_KEY);
    return this.resend;
  }

  isEnabled(): boolean {
    return !!getConfig().RESEND_API_KEY;
  }

  /** True on a successful send, false on no-op / failure. */
  async sendDigest(payload: DigestPayload): Promise<boolean> {
    const resend = this.getResend();
    if (!resend) return false;
    if (payload.events.length === 0) return false; // never send an empty digest

    const cfg = getConfig();
    try {
      const result = await resend.emails.send({
        from: cfg.RESEND_FROM,
        to: payload.userEmail,
        subject: subjectFor(payload),
        html: renderDigestHtml(payload),
        text: renderDigestText(payload),
      });
      if (result.error) {
        logger.warn({ err: result.error, to: payload.userEmail }, 'resend send returned error');
        return false;
      }
      return true;
    } catch (err) {
      logger.warn({ err, to: payload.userEmail }, 'resend send threw');
      return false;
    }
  }

  /**
   * Walk users with digestEnabled=true who have unseen events newer than
   * the cutoff and whose lastDigestAt is outside the current week-bucket.
   * Returns the count of digests sent.
   */
  async runWeeklyDigest(now = new Date()): Promise<{ sent: number; skipped: number }> {
    if (!this.isEnabled()) {
      this.getResend(); // log the no-op warning once
      return { sent: 0, skipped: 0 };
    }
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Pull candidate users. Limit to a sane batch so a backlog after an
    // outage doesn't fan a single tick into thousands of sends.
    const users = await prisma.user.findMany({
      where: {
        digestEnabled: true,
        OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: since } }],
      },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
      take: 1000,
    });

    let sent = 0;
    let skipped = 0;
    for (const user of users) {
      const events = await prisma.agentEvent.findMany({
        where: {
          userId: user.id,
          seenAt: null,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      if (events.length === 0) {
        skipped++;
        continue;
      }
      const ok = await this.sendDigest({
        userEmail: user.email,
        ...(user.displayName ? { userDisplayName: user.displayName } : {}),
        events: events.map((e) => ({
          agent: e.agent,
          kind: e.kind,
          title: e.title,
          body: e.body,
          actionUrl: e.actionUrl,
          createdAt: e.createdAt,
        })),
        since,
      });
      if (ok) {
        sent++;
        await prisma.user
          .update({ where: { id: user.id }, data: { lastDigestAt: now } })
          .catch((err) => logger.warn({ err, userId: user.id }, 'lastDigestAt bump failed'));
      } else {
        skipped++;
      }
    }
    logger.info({ sent, skipped, candidates: users.length }, 'weekly digest tick complete');
    return { sent, skipped };
  }
}

// ── Templates ──────────────────────────────────────────────────────────────
// Plain HTML + plain-text twin. Resend will pick the right one per client.
// Deliberately no external assets / web fonts — gmail/outlook strip half of
// those anyway, and the digest's job is "skim and click", not "render a deck."

function subjectFor(p: DigestPayload): string {
  const n = p.events.length;
  const lead = p.events[0]!.title.slice(0, 60);
  return n === 1 ? lead : `Recome digest — ${n} new from your agents`;
}

function renderDigestHtml(p: DigestPayload): string {
  const greeting = p.userDisplayName ? `Hi ${escapeHtml(p.userDisplayName)},` : 'Hi,';
  const items = p.events
    .map((e) => {
      const action = e.actionUrl
        ? `<p style="margin:6px 0 0"><a href="${escapeAttr(e.actionUrl)}" style="color:#5eead4;text-decoration:underline">Open →</a></p>`
        : '';
      const body = e.body
        ? `<p style="margin:6px 0 0;color:#475569;font-size:14px;line-height:1.5">${escapeHtml(e.body).slice(0, 280)}</p>`
        : '';
      return `<li style="padding:14px 0;border-bottom:1px solid #e2e8f0">
        <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0f766e">${escapeHtml(e.agent)} · ${escapeHtml(e.kind.replace(/_/g, ' '))}</div>
        <h3 style="margin:6px 0 0;font-size:16px;font-weight:600;color:#0f172a">${escapeHtml(e.title)}</h3>
        ${body}
        ${action}
      </li>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Recome digest</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:24px auto;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:16px">
    <div style="font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#0f766e;margin-bottom:8px">Recome · weekly digest</div>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a">${escapeHtml(greeting)}</h1>
    <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.55">
      Here's what your agents brought you since ${formatShortDate(p.since)}. Nothing here is urgent —
      it's the stuff you'd otherwise miss between sessions.
    </p>
    <ul style="list-style:none;padding:0;margin:0">${items}</ul>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.55">
      <a href="https://recome.app/inbox" style="color:#0f766e">Open inbox →</a> ·
      <a href="https://recome.app/settings" style="color:#94a3b8">unsubscribe / manage digest</a>
    </p>
  </div>
</body></html>`;
}

function renderDigestText(p: DigestPayload): string {
  const greeting = p.userDisplayName ? `Hi ${p.userDisplayName},` : 'Hi,';
  const lines = p.events.map((e, i) => {
    const head = `${i + 1}. [${e.agent}] ${e.title}`;
    const url = e.actionUrl ? `   ${e.actionUrl}` : '';
    return [head, url].filter(Boolean).join('\n');
  });
  return [
    `Recome · weekly digest`,
    '',
    greeting,
    '',
    `Here's what your agents brought you since ${formatShortDate(p.since)}:`,
    '',
    lines.join('\n\n'),
    '',
    '—',
    'Open inbox: https://recome.app/inbox',
    'Unsubscribe / manage digest: https://recome.app/settings',
  ].join('\n');
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

let svc: EmailService | null = null;
export function getEmailService(): EmailService {
  if (!svc) svc = new EmailService();
  return svc;
}
