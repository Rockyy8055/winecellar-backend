const nodemailer = require('nodemailer');

function envTrim(key) {
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : v;
}

function envNumber(key, fallback) {
  const v = envTrim(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildTransport() {
  // Option A: Explicit SMTP
  const smtpHost = envTrim('SMTP_HOST');
  if (smtpHost) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: envNumber('SMTP_PORT', 587),
      secure: String(envTrim('SMTP_SECURE') || '').toLowerCase() === 'true' || envNumber('SMTP_PORT', 587) === 465,
      auth: envTrim('SMTP_USER') && envTrim('SMTP_PASS') ? { user: envTrim('SMTP_USER'), pass: envTrim('SMTP_PASS') } : undefined,
    });
  }
  // Option B: Gmail App Password
  if (envTrim('GMAIL_USER') && envTrim('GMAIL_APP_PASS')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: envTrim('GMAIL_USER'), pass: envTrim('GMAIL_APP_PASS') },
    });
  }
  // Backward compatibility (existing env in project)
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: envTrim('EMAIL'), pass: envTrim('EMAIL_PASSWORD') },
  });
}

const transporter = buildTransport();

transporter.verify().then(() => {
  console.log('Email transport ready');
}).catch((err) => {
  console.error('Email transport verify failed:', err && err.message ? err.message : err);
});

function getFromAddress() {
  return envTrim('SMTP_FROM') || envTrim('GMAIL_USER') || envTrim('EMAIL');
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