const nodemailer = require('nodemailer');

function buildTransport() {
  // Option A: Explicit SMTP
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  // Option B: Gmail App Password
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
    });
  }
  // Backward compatibility (existing env in project)
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL, pass: process.env.EMAIL_PASSWORD },
  });
}

const transporter = buildTransport();

function getFromAddress() {
  return process.env.SMTP_FROM || process.env.GMAIL_USER || process.env.EMAIL;
}

const sendMail = (to, subject, text, html) => {
  const mailOptions = {
    from: getFromAddress(),
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        reject(error);
      } else {
        console.log('Email sent:', info.response);
        resolve(info);
      }
    });
  });
};

module.exports = { sendMail };