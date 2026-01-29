const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const { google } = require('googleapis');

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

const resendApiKey = envTrim('RESEND_API_KEY');
const resendClient = resendApiKey ? new Resend(resendApiKey) : null;

const gmailOAuth = (() => {
  const clientId = envTrim('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = envTrim('GOOGLE_OAUTH_CLIENT_SECRET');
  const refreshToken = envTrim('GOOGLE_OAUTH_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) return null;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return { oauth2Client, email: envTrim('GOOGLE_OAUTH_EMAIL') };
})();

const gmailClient = gmailOAuth ? google.gmail({ version: 'v1', auth: gmailOAuth.oauth2Client }) : null;

function getFromAddress() {
  return envTrim('EMAIL_FROM') || envTrim('SMTP_FROM') || envTrim('EMAIL_USER') || envTrim('SMTP_USER') || envTrim('GMAIL_USER') || envTrim('EMAIL');
}

function getEmailProvider() {
  if (gmailClient) return 'gmail-api';
  if (resendClient) return 'resend';
  return 'gmail';
}

function sendMail(to, subject, text, html) {
  if (gmailClient) {
    const makeBody = (to, from, subject, text, html) => {
      const str = [
        `To: ${to}`,
        `From: ${from}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        html || text || ''
      ].join('\n');
      return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    };
    const from = gmailOAuth.email || envTrim('EMAIL_FROM') || envTrim('EMAIL_USER');
    const raw = makeBody(to, from, subject, text, html);
    return gmailClient.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    }).then((result) => {
      console.log('Email sent via Gmail API:', result.data);
      return result.data;
    }).catch((error) => {
      console.error('Gmail API send error:', error);
      throw error;
    });
  }

  if (resendClient) {
    const payload = {
      from: getFromAddress(),
      to: [to],
      subject,
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
    };
    return resendClient.emails.send(payload).then((info) => {
      console.log('Email sent:', info);
      return info;
    }).catch((error) => {
      console.error('Error sending email:', error);
      throw error;
    });
  }

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

module.exports = { sendMail, getEmailProvider };