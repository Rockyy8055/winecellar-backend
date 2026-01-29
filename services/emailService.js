const { Resend } = require('resend');

function envTrim(key) {
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : v;
}

function buildResendClient() {
  const apiKey = envTrim('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set. Transactional emails will fail.');
    return null;
  }
  try {
    return new Resend(apiKey);
  } catch (err) {
    console.error('Failed to initialize Resend client:', err);
    return null;
  }
}

const resendClient = buildResendClient();

function getFromAddress() {
  return envTrim('EMAIL_FROM') || envTrim('RESEND_FROM') || envTrim('EMAIL') || 'Wine Cellar <orders@example.com>';
}

function getEmailProvider() {
  return 'resend';
}

async function sendMail(to, subject, text, html) {
  if (!resendClient) {
    throw new Error('Resend client is not configured. Set RESEND_API_KEY.');
  }

  const payload = {
    from: getFromAddress(),
    to: [to],
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
  };

  try {
    const result = await resendClient.emails.send(payload);
    console.log('Email sent via Resend:', result);
    return result;
  } catch (error) {
    console.error('Resend email error:', error);
    throw error;
  }
}

module.exports = { sendMail, getEmailProvider };