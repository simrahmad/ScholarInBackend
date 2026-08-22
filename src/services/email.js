const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  if (!transporter) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn("SMTP credentials not configured — payment emails will be skipped.");
      return null;
    }
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false, // port 587 uses STARTTLS, not implicit TLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendPaymentReceivedEmail({ to, consultantName, amount, bookingId }) {
  const t = getTransporter();
  if (!t || !to) return;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || `"Scholario" <${process.env.SMTP_USER}>`,
      to,
      subject: "You've received a payment on Scholario",
      text:
        `Hi ${consultantName || "there"},\n\n` +
        `You've received a payment of $${Number(amount).toFixed(2)} for booking ${bookingId}.\n` +
        `Your account is in Stripe test mode, so no real funds were transferred.\n\n— Scholario`,
    });
    console.log(`Payment email sent to ${to} for booking ${bookingId}`);
  } catch (err) {
    console.error("Failed to send payment email:", err.message);
  }
}

module.exports = { sendPaymentReceivedEmail };