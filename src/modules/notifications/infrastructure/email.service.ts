import "server-only";

export type EmailRecipient = {
  email: string;
  name?: string;
};

export type SendEmailOptions = {
  to: string | EmailRecipient[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
};

export type EmailSendResult = {
  success: boolean;
  messageId?: string;
  provider: "resend" | "none";
  error?: string;
};

/**
 * Transactional email.
 *
 * ── Status, stated plainly ───────────────────────────────────────────────────
 * Nothing in the app calls this yet. Phase 11 makes custom SMTP and live
 * voucher delivery mandatory (§15, 4.2 and 8.7); this is the seam that work
 * plugs into. The only transport implemented is Resend, used when
 * `RESEND_API_KEY` is set.
 *
 * With no provider configured it returns `success: false`. The first version
 * logged the message to the console and reported success — which is exactly
 * the fake success §2.3 forbids: a caller would have told a user their voucher
 * was emailed when nothing was sent.
 */
export async function sendTransactionalEmail(options: SendEmailOptions): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn(`[email] Not sent — no email provider configured. Subject: ${options.subject}`);
    return {
      success: false,
      provider: "none",
      error: "No email provider is configured.",
    };
  }

  const fromAddress = options.from || process.env.RESEND_FROM;
  if (!fromAddress) {
    // A sender address is not something to invent (§2.6).
    return { success: false, provider: "resend", error: "RESEND_FROM is not configured." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: Array.isArray(options.to) ? options.to.map((r) => r.email) : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[email] Resend API error:", res.status, errText.slice(0, 500));
      return { success: false, provider: "resend", error: `Resend responded ${res.status}` };
    }

    const data = (await res.json()) as { id?: string };
    return { success: true, messageId: data.id, provider: "resend" };
  } catch (err) {
    console.error("[email] Resend request failed:", err);
    return {
      success: false,
      provider: "resend",
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Guest names and hotel names are user-entered; never interpolate them raw into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Pre-formatted booking confirmation email.
 */
export async function sendBookingConfirmationEmail(params: {
  guestEmail: string;
  guestName: string;
  bookingRef: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  voucherUrl: string;
}) {
  const voucherUrl = /^https?:\/\//i.test(params.voucherUrl) ? params.voucherUrl : "";
  const subject = `تأكيد الحجز ${params.bookingRef} - Booking Confirmation`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <p>عزيزي ${escapeHtml(params.guestName)}،</p>
      <p>تم تسجيل حجزك برقم مرجعي: <strong>${escapeHtml(params.bookingRef)}</strong></p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;">الفندق:</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${escapeHtml(params.hotelName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;">تاريخ الوصول:</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(params.checkIn)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;">تاريخ المغادرة:</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(params.checkOut)}</td>
        </tr>
      </table>
      ${
        voucherUrl
          ? `<p style="margin-top: 25px;">
        <a href="${escapeHtml(voucherUrl)}" style="background-color: #0284c7; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
          عرض قسيمة الحجز · View Voucher
        </a>
      </p>`
          : ""
      }
    </div>
  `;

  return sendTransactionalEmail({
    to: params.guestEmail,
    subject,
    html,
  });
}
