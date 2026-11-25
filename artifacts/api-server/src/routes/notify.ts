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

export interface EmailAttemptStatus {
  sent: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
}

export interface NotifyResponseBody {
  success: boolean;
  notified: boolean;
  coupleReceiptSent: boolean;
  studio: EmailAttemptStatus;
  couple: EmailAttemptStatus;
  errors: string[];
}

export const DEFAULT_FROM_EMAIL = "OAKS Wedding <hello@mail.oakswedding.com>";
export const DEFAULT_REPLY_TO_EMAIL = "mywedding@oakswedding.com";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      notified: false,
      coupleReceiptSent: false,
      studio: { sent: false, error: "Method not allowed" },
      couple: { sent: false, skipped: true },
      errors: ["Method not allowed"],
    } satisfies NotifyResponseBody);
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
    uploadedPhotoCount,
    notAddedPhotoSlotCount,
    failedPhotoCount,
    uploadingPhotoCount,
    pendingPhotoCount,
  } = req.body || {};

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const notifyEmails = process.env.NOTIFY_EMAILS?.trim();
  const fromAddress =
    process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
  const replyToAddress =
    process.env.RESEND_REPLY_TO?.trim() || DEFAULT_REPLY_TO_EMAIL;

  const errors: string[] = [];

  if (!resendApiKey) {
    errors.push("studio: RESEND_API_KEY is not configured on the server");
    return res.status(500).json({
      success: false,
      notified: false,
      coupleReceiptSent: false,
      studio: {
        sent: false,
        status: 500,
        error: "RESEND_API_KEY is not configured on the server",
      },
      couple: { sent: false, skipped: true },
      errors,
    } satisfies NotifyResponseBody);
  }

  const recipients = (notifyEmails || "")
    .split(",")
    .map((e: string) => e.trim())
    .filter(Boolean);

  const safeP1 = escapeHtml(partner1 || "Partner 1");
  const safeP2 = escapeHtml(partner2 || "Partner 2");
  const safeDisplayId = escapeHtml(displayId || submissionId || "Unnumbered");
  const safeWeddingDate = escapeHtml(weddingDate || "Not specified");
  const safePhone = escapeHtml(phone || "Not specified");
  const safeEmail = escapeHtml(email || "Not specified");
  const safeSubmittedAt = escapeHtml(submittedAt || new Date().toISOString());

  const uploadedPhotos =
    typeof uploadedPhotoCount === "number" && uploadedPhotoCount >= 0
      ? uploadedPhotoCount
      : 0;
  const notAddedSlots =
    typeof notAddedPhotoSlotCount === "number" && notAddedPhotoSlotCount >= 0
      ? notAddedPhotoSlotCount
      : 0;
  const failedPhotos =
    typeof failedPhotoCount === "number" && failedPhotoCount >= 0
      ? failedPhotoCount
      : 0;
  const uploadingPhotos =
    typeof uploadingPhotoCount === "number" && uploadingPhotoCount >= 0
      ? uploadingPhotoCount
      : typeof pendingPhotoCount === "number" && pendingPhotoCount >= 0
      ? pendingPhotoCount
      : 0;

  const photosSummaryLine = `Photos: ${uploadedPhotos} uploaded, ${notAddedSlots} not added by couple, ${failedPhotos} failed`;
  const pendingNote =
    uploadingPhotos > 0
      ? `<p style="color:#b45309;"><strong>Note:</strong> ${uploadingPhotos} photo(s) were still uploading in the background when the form was sent.</p>`
      : "";

  const studioStatus: EmailAttemptStatus = { sent: false };
  const coupleStatus: EmailAttemptStatus = { sent: false };

  // 1. Send studio alert email
  if (recipients.length === 0) {
    studioStatus.status = 500;
    studioStatus.error = "NOTIFY_EMAILS is not configured on the server";
    errors.push(`studio(500): ${studioStatus.error}`);
  } else {
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
          <p><strong>${escapeHtml(photosSummaryLine)}</strong></p>
          ${pendingNote}
          <div style="margin-top: 30px;">
            <a href="https://${escapeHtml(req.headers?.host || "")}/admin" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-size: 15px;">
              Open Admin Dashboard
            </a>
          </div>
        </div>
      `;

      const studioText = [
        `OAKS Wedding Photography & Films`,
        `New Couple Submission: ${partner1 || "Partner 1"} & ${partner2 || "Partner 2"} (${displayId || submissionId || "Unnumbered"})`,
        `Wedding Date: ${weddingDate || "Not specified"}`,
        `Phone: ${phone || "Not specified"}`,
        `Email: ${email || "Not specified"}`,
        `Submitted At: ${submittedAt || new Date().toISOString()}`,
        photosSummaryLine,
        ...(uploadingPhotos > 0
          ? [
              `Note: ${uploadingPhotos} photo(s) were still uploading in the background when the form was sent.`,
            ]
          : []),
      ].join("\n");

      // Send to each studio address separately so one rejected address can never
      // stop the alert from reaching the other studio inbox.
      const studioSubject = `New Questionnaire: ${partner1 || "Partner 1"} & ${partner2 || "Partner 2"}${displayId ? ` (${displayId})` : ""}`;
      const perRecipient = await Promise.all(
        recipients.map(async (recipient: string) => {
          try {
            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromAddress,
                to: [recipient],
                reply_to: replyToAddress,
                subject: studioSubject,
                html: studioHtml,
                text: studioText,
              }),
            });
            if (response.ok) return { recipient, ok: true, status: response.status };
            const errText = (await response.text()).slice(0, 260);
            return {
              recipient,
              ok: false,
              status: response.status,
              error: errText || `Resend returned ${response.status}`,
            };
          } catch (err: any) {
            return {
              recipient,
              ok: false,
              status: 502,
              error: (err?.message || "Network error calling Resend").slice(0, 260),
            };
          }
        })
      );

      const failures = perRecipient.filter((r) => !r.ok);
      studioStatus.sent = failures.length === 0;
      studioStatus.status = failures.length === 0 ? 200 : failures[0].status;
      if (failures.length > 0) {
        studioStatus.error = failures
          .map((f) => `${f.recipient}: ${f.error}`)
          .join(" | ")
          .slice(0, 500);
        for (const f of failures) {
          errors.push(`studio(${f.status}) ${f.recipient}: ${f.error}`);
        }
      }
    } catch (err: any) {
      studioStatus.status = 502;
      studioStatus.error = (err?.message || "Network error calling Resend").slice(0, 260);
      errors.push(`studio(502): ${studioStatus.error}`);
    }
  }

  // 2. Send couple receipt confirmation email if the couple entered a valid email
  const cleanCoupleEmail = typeof email === "string" ? email.trim() : "";
  if (!cleanCoupleEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanCoupleEmail)) {
    coupleStatus.skipped = true;
  } else {
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

      const coupleText = [
        `We've received your story, ${partner1 || "Partner 1"} & ${partner2 || "Partner 2"}.`,
        `Thank you for taking the time to share your story, your family, and your vision with us.`,
        `Reference: ${displayId || submissionId || "Unnumbered"}`,
        `Wedding Date: ${weddingDate || "Not specified"}`,
        `With warmth, Team OAKS Wedding`,
      ].join("\n\n");

      const coupleRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [cleanCoupleEmail],
          reply_to: replyToAddress,
          subject: `We received your OAKS Wedding questionnaire, ${partner1 || ""} & ${partner2 || ""}`,
          html: coupleHtml,
          text: coupleText,
        }),
      });

      coupleStatus.status = coupleRes.status;
      if (coupleRes.ok) {
        coupleStatus.sent = true;
      } else {
        const errText = (await coupleRes.text()).slice(0, 260);
        coupleStatus.error = errText || `Resend returned ${coupleRes.status}`;
        errors.push(`couple(${coupleRes.status}): ${coupleStatus.error}`);
      }
    } catch (err: any) {
      coupleStatus.status = 502;
      coupleStatus.error = (err?.message || "Network error calling Resend").slice(0, 260);
      errors.push(`couple(502): ${coupleStatus.error}`);
    }
  }

  // The studio alert decides success. A couple-receipt problem is still reported in
  // `couple` / `errors`, but must not mark the studio alert as "Email not sent".
  const allAttemptedSucceeded = studioStatus.sent;

  const responsePayload: NotifyResponseBody = {
    success: allAttemptedSucceeded,
    notified: studioStatus.sent,
    coupleReceiptSent: coupleStatus.sent,
    studio: studioStatus,
    couple: coupleStatus,
    errors,
  };

  if (!allAttemptedSucceeded) {
    const httpStatus =
      (studioStatus.status && studioStatus.status >= 400 ? studioStatus.status : 0) || 502;
    return res.status(httpStatus).json(responsePayload);
  }

  return res.status(200).json(responsePayload);
}
