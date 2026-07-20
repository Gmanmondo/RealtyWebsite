// netlify/functions/submission-created.js
//
// Netlify automatically invokes any function named exactly
// "submission-created" whenever a verified form submission comes in on
// this site — no special wiring needed beyond the filename. This is a
// core Functions feature (unrelated to the paid Forms "notifications"
// add-on), so it works on the free plan.
//
// This function takes the place of Netlify's built-in email
// notification: it receives the submitted fields and sends the email
// itself via Resend (https://resend.com), which has a free tier.
//
// Set these in Netlify dashboard → Site configuration → Environment
// variables, then redeploy:
//   RESEND_API_KEY   = re_xxxxxxxxxxxxxxxxxxxx
//   CONTACT_EMAIL_TO = dallas@example.com        (where you want messages sent)
//   CONTACT_EMAIL_FROM = noreply@yourdomain.com  (must be on a domain verified in Resend)

exports.handler = async function (event) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const TO_EMAIL = process.env.CONTACT_EMAIL_TO;
  const FROM_EMAIL = process.env.CONTACT_EMAIL_FROM;

  if (!RESEND_API_KEY || !TO_EMAIL || !FROM_EMAIL) {
    console.error("Missing Resend configuration environment variables.");
    // Still return 200 — Netlify doesn't retry submission-created on
    // failure, and we don't want a misconfigured function to affect
    // the form submission itself (which already succeeded by the time
    // this runs).
    return { statusCode: 200, body: "Missing email configuration." };
  }

  try {
    const payload = JSON.parse(event.body);
    // payload.payload.data holds the submitted field values, keyed by
    // each input's name attribute (name, email, phone, message, plus
    // Netlify's own form-name and bot-field).
    const data = payload.payload?.data || {};

    const name = data.name || "(no name provided)";
    const email = data.email || "(no email provided)";
    const phone = data.phone || "(none provided)";
    const message = data.message || "(no message)";

    const emailBody = `
New message from your website contact form:

Name: ${name}
Email: ${email}
Phone: ${phone}

Message:
${message}
    `.trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: TO_EMAIL,
        reply_to: email, // lets Dallas hit "reply" and go straight to the sender
        subject: `New contact form message from ${name}`,
        text: emailBody,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend API error:", errText);
    }

    return { statusCode: 200, body: "Notification handled." };
  } catch (err) {
    console.error("Could not process submission-created event:", err);
    return { statusCode: 200, body: "Error handled." };
  }
};