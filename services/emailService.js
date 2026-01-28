const nodemailer = require('nodemailer');

function envTrim(key) {
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : v;
}

function buildTransport() {
  const user = envTrim('EMAIL_USER') || envTrim('SMTP_USER') || envTrim('GMAIL_USER') || envTrim('EMAIL');
  const pass = envTrim('EMAIL_PASS') || envTrim('SMTP_PASS') || envTrim('GMAIL_APP_PASS') || envTrim('EMAIL_PASSWORD');
  if (!user || !pass) {
    console.warn('Email transport missing credentials. Set EMAIL_USER/EMAIL_PASS or equivalent.');
  }

  return nodemailer.createTransport({
    host: envTrim('SMTP_HOST') || 'smtp.gmail.com',
    port: Number(envTrim('SMTP_PORT')) || 587,
    secure: false,
    auth: user && pass ? { user, pass } : undefined,
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
}

const transporter = buildTransport();

function getFromAddress() {
  return envTrim('EMAIL_FROM') || envTrim('SMTP_FROM') || envTrim('EMAIL_USER') || envTrim('SMTP_USER') || envTrim('GMAIL_USER') || envTrim('EMAIL');
}

function sendMail(to, subject, text, html) {
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
        console.log('Email sent:', info && info.response ? info.response : info);
        resolve(info);
      }
    });
  });
}

module.exports = { sendMail };