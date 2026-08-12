import nodemailer from "nodemailer";
import { config } from "./config.js";

const transporter = config.smtp
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null;

export async function sendRoleInvitation(
  email: string,
  roleLabel: "Research Coordinator" | "Research Instructor",
  alreadyVerified: boolean,
) {
  if (!transporter || !config.smtp) {
    if (config.nodeEnv === "production") {
      throw new Error("SMTP is not configured");
    }
    console.info(`[email disabled] ${roleLabel} invitation queued`);
    return;
  }

  await transporter.sendMail({
    from: config.smtp.from,
    to: email,
    subject: `ResearchNAV ${roleLabel} access`,
    text: alreadyVerified
      ? `Your ResearchNAV account was approved as ${roleLabel}. Open your dashboard at ${config.appUrl}.`
      : `You were invited as ${roleLabel}. Sign in with this Google account at ${config.appUrl} to confirm your email and activate the dashboard.`,
    html: alreadyVerified
      ? `<p>Your ResearchNAV account was approved as <strong>${roleLabel}</strong>.</p><p><a href="${config.appUrl}">Open your ResearchNAV dashboard</a>.</p>`
      : `<p>You were invited as <strong>${roleLabel}</strong>.</p><p><a href="${config.appUrl}">Sign in to ResearchNAV</a> with this Google account to activate the dashboard.</p>`,
  });
}
