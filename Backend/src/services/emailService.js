const https = require("https");

const BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

const clean = (value) => String(value || "").trim();
const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const postJson = (url, payload, headers) => new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const target = new URL(url);

    const req = https.request({
        hostname: target.hostname,
        path: target.pathname,
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            ...headers,
        },
    }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
            let parsed = {};
            if (data) {
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = { raw: data };
                }
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(parsed);
                return;
            }

            const message = parsed.message || parsed.raw || `Brevo API returned ${res.statusCode}`;
            reject(new Error(message));
        });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
});

const sendTransactionalEmail = async ({ to, subject, htmlContent, textContent }) => {
    const apiKey = clean(process.env.BREVO_API_KEY);
    const senderEmail = clean(process.env.BREVO_SENDER_EMAIL);
    const senderName = clean(process.env.BREVO_SENDER_NAME) || "Admin Assist";

    if (!apiKey || !senderEmail) {
        const message = "BREVO_API_KEY and BREVO_SENDER_EMAIL must be set to send email";
        if (process.env.NODE_ENV === "production") throw new Error(message);
        console.warn(`${message}; skipping email in development.`);
        return { skipped: true };
    }

    return postJson(BREVO_EMAIL_URL, {
        sender: { email: senderEmail, name: senderName },
        to: [{ email: to.email, name: to.name }],
        subject,
        htmlContent,
        textContent,
    }, {
        "api-key": apiKey,
    });
};

const sendVerificationEmail = ({ to, verificationUrl }) => {
    const subject = "Verify your Admin Assist account";
    const plainName = to.name || "there";
    const safeName = escapeHtml(plainName);
    const safeVerificationUrl = escapeHtml(verificationUrl);

    return sendTransactionalEmail({
        to,
        subject,
        htmlContent: `
            <html>
              <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #172033;">
                <p>Hello ${safeName},</p>
                <p>Thanks for creating an Admin Assist account. Verify your email address to activate your account.</p>
                <p>
                  <a href="${safeVerificationUrl}" style="display:inline-block;padding:12px 18px;background:#0f4c81;color:#ffffff;text-decoration:none;border-radius:6px;">
                    Verify email address
                  </a>
                </p>
                <p>If the button does not work, copy and paste this link into your browser:</p>
                <p><a href="${safeVerificationUrl}">${safeVerificationUrl}</a></p>
                <p>This link expires in 24 hours.</p>
              </body>
            </html>
        `,
        textContent: [
            `Hello ${plainName},`,
            "Thanks for creating an Admin Assist account.",
            "Verify your email address to activate your account:",
            verificationUrl,
            "This link expires in 24 hours.",
        ].join("\n\n"),
    });
};

module.exports = { sendVerificationEmail };
