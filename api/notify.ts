/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    displayId,
    partner1,
    partner2,
    weddingDate,
    phone,
    email,
    submittedAt,
  } = req.body || {};

  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmails = process.env.NOTIFY_EMAILS;

  if (!resendApiKey || !notifyEmails) {
    // If email notifications are not configured, succeed without error
    return res.status(200).json({
      success: true,
      notified: false,
      message: "Resend credentials not set; email notification skipped.",
    });
  }

  const recipients = notifyEmails
    .split(",")
    .map((e: string) => e.trim())
    .filter(Boolean);

  try {
    const emailHtml = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
        <h2 style="color: #b08d57; margin-bottom: 4px;">OAKS Wedding Photography & Films</h2>
        <h3 style="margin-top: 0; font-size: 22px;">New Couple Submission: ${partner1} &amp; ${partner2} (${displayId})</h3>
        <hr style="border: 0; border-top: 1px solid #e5ddd2; margin: 20px 0;" />
        <p><strong>Wedding Date:</strong> ${weddingDate || "Not specified"}</p>
        <p><strong>Phone:</strong> ${phone || "Not specified"}</p>
        <p><strong>Email:</strong> ${email || "Not specified"}</p>
        <p><strong>Submitted At:</strong> ${submittedAt || new Date().toISOString()}</p>
        <div style="margin-top: 30px;">
          <a href="https://${req.headers?.host || ""}/admin" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-size: 15px;">
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
        from: "OAKS Studio <notifications@resend.dev>",
        to: recipients,
        subject: `New Questionnaire: ${partner1} & ${partner2} (${displayId})`,
        html: emailHtml,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn("Resend email failure:", errText);
      return res.status(200).json({ success: true, notified: false, error: errText });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, notified: true, id: data.id });
  } catch (err: any) {
    console.error("Notify error:", err);
    return res.status(200).json({ success: true, notified: false, error: err.message });
  }
}
