const { Resend } = require('resend');

function envTrim(key) {
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : v;
}

const resendApiKey = envTrim('RESEND_API_KEY');
const emailFrom = envTrim('EMAIL_FROM');

const resendClient = resendApiKey ? new Resend(resendApiKey) : null;

async function sendMail(to, subject, text, html) {
  if (!resendClient) {
    throw new Error('Resend client is not configured. Set RESEND_API_KEY.');
  }
  const payload = {
    from: emailFrom || 'Wine Cellar <no-reply@winecellar.co.in>',
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  };
  const response = await resendClient.emails.send(payload);
  console.log('Resend email response:', response && response.id ? response.id : response);
  return response;
}

module.exports = { sendMail };