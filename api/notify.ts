/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

function escapeHtml(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    submissionId,
    displayId,
    partner1,
    partner2,
    weddingDate,
    phone,
    email,
    submittedAt,
    pendingPhotoCount,
  } = req.body || {};

  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmails = process.env.NOTIFY_EMAILS;
  const fromAddress =
    process.env.RESEND_FROM_EMAIL || "OAKS Studio <notifications@resend.dev>";

  if (!resendApiKey) {
    return res.status(200).json({
      success: true,
      notified: false,
      coupleReceiptSent: false,
      message: "RESEND_API_KEY not set; email notifications skipped.",
    });
  }

  const safeP1 = escapeHtml(partner1 || "Partner 1");
  const safeP2 = escapeHtml(partner2 || "Partner 2");
  const safeDisplayId = escapeHtml(displayId || submissionId || "Unnumbered");
  const safeWeddingDate = escapeHtml(weddingDate || "Not specified");
  const safePhone = escapeHtml(phone || "Not specified");
  const safeEmail = escapeHtml(email || "Not specified");
  const safeSubmittedAt = escapeHtml(submittedAt || new Date().toISOString());
  const pendingNote =
    typeof pendingPhotoCount === "number" && pendingPhotoCount > 0
      ? `<p style="color:#b45309;"><strong>Note:</strong> ${pendingPhotoCount} photo(s) were still uploading in the background.</p>`
      : "";

  const results: {
    notified: boolean;
    coupleReceiptSent: boolean;
    errors: string[];
  } = {
    notified: false,
    coupleReceiptSent: false,
    errors: [],
  };

  // 1. Send studio notification email
  const recipients = (notifyEmails || "")
    .split(",")
    .map((e: string) => e.trim())
    .filter(Boolean);

  if (recipients.length > 0) {
    try {
      const studioHtml = `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
          <h2 style="color: #b08d57; margin-bottom: 4px;">OAKS Wedding Photography &amp; Films</h2>
          <h3 style="margin-top: 0; font-size: 22px;">New Couple Submission: ${safeP1} &amp; ${safeP2} (${safeDisplayId})</h3>
          <hr style="border: 0; border-top: 1px solid #e5ddd2; margin: 20px 0;" />
          <p><strong>Wedding Date:</strong> ${safeWeddingDate}</p>
          <p><strong>Phone:</strong> ${safePhone}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Submitted At:</strong> ${safeSubmittedAt}</p>
          ${pendingNote}
          <div style="margin-top: 30px;">
            <a href="https://${escapeHtml(req.headers?.host || "")}/admin" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-size: 15px;">
              Open Admin Dashboard
            </a>
          </div>
        </div>
      `;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: recipients,
          subject: `New Questionnaire: ${partner1 || "Partner 1"} & ${partner2 || "Partner 2"} (${displayId || "New"})`,
          html: studioHtml,
        }),
      });

      if (response.ok) {
        results.notified = true;
      } else {
        results.errors.push(`studio: ${await response.text()}`);
      }
    } catch (err: any) {
      results.errors.push(`studio: ${err?.message || "unknown"}`);
    }
  }

  // 2. Send couple receipt confirmation email if the couple entered an email address
  const cleanCoupleEmail = typeof email === "string" ? email.trim() : "";
  if (cleanCoupleEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanCoupleEmail)) {
    try {
      const coupleHtml = `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a; background-color: #faf8f5;">
          <div style="background: #ffffff; border: 1px solid #e5ddd2; border-radius: 16px; padding: 28px;">
            <p style="color: #b08d57; letter-spacing: 2px; font-size: 12px; text-transform: uppercase; margin: 0 0 8px 0;">
              OAKS Wedding Photography &amp; Films
            </p>
            <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: normal;">
              We&apos;ve received your story, ${safeP1} &amp; ${safeP2}
            </h2>
            <p style="color: #5f5f5f; font-size: 15px; line-height: 1.6;">
              Thank you for taking the time to share your story, your family, and your vision with us.
              Your questionnaire responses have been safely saved for our team.
            </p>
            <div style="margin: 20px 0; padding: 14px 16px; background: #faf7f2; border: 1px solid #e8dfd3; border-radius: 12px; font-size: 13px; color: #4a453e;">
              <div><strong>Reference:</strong> ${safeDisplayId}</div>
              <div><strong>Wedding Date:</strong> ${safeWeddingDate}</div>
            </div>
            <p style="color: #7a756d; font-size: 13px; line-height: 1.6; margin-bottom: 0;">
              With warmth,<br />
              <strong>Team OAKS Wedding</strong>
            </p>
          </div>
        </div>
      `;

      const coupleRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [cleanCoupleEmail],
          subject: `We received your OAKS Wedding questionnaire, ${partner1 || ""} & ${partner2 || ""}`,
          html: coupleHtml,
        }),
      });

      if (coupleRes.ok) {
        results.coupleReceiptSent = true;
      } else {
        results.errors.push(`couple: ${await coupleRes.text()}`);
      }
    } catch (err: any) {
      results.errors.push(`couple: ${err?.message || "unknown"}`);
    }
  }

  return res.status(200).json({
    success: true,
    ...results,
  });
}
