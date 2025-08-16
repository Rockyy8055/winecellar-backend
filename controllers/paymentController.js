const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/payment');
const { sendEmail } = require('../services/emailService');

const createPaymentIntent = async (req, res) => {
  try {
    const amountMajor = Number(req.body.amount); // e.g., 287.92
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const amount = Math.round(amountMajor * 100); // integer cents
    const currency = (req.body.currency || 'usd').toLowerCase();

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const handlePaymentConfirmation = async (req, res) => {
  const event = req.body;

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;

      const paymentData = {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        paymentMethod: paymentIntent.payment_method,
        paymentStatus: paymentIntent.status,
        transactionId: paymentIntent.receipt_email,
        metadata: paymentIntent.metadata,
        createdAt: paymentIntent.created,
      };


      try {
        const payment = new Payment(paymentData);
        await payment.save();


        const clientEmail = paymentIntent.metadata.clientEmail; // Assuming client email is stored in metadata
        const vendorEmail = process.env.VENDOR_EMAIL; // Use your vendor email (can also be in environment variable)

        const clientSubject = 'Payment Confirmation';
        const clientText = `Dear Customer, \n\nYour payment of £${(paymentData.amount / 100).toFixed(2)} was successful. Thank you for your purchase! \n\nTransaction ID: ${paymentData.transactionId} \nPayment Status: ${paymentData.paymentStatus} \n\nBest regards, \nYour Company Name`;

        const vendorSubject = 'New Payment Received';
        const vendorText = `Dear Vendor, \n\nA new payment has been received. \n\nAmount: £${(paymentData.amount / 100).toFixed(2)} \nTransaction ID: ${paymentData.transactionId} \nPayment Status: ${paymentData.paymentStatus} \n\nBest regards, \nYour Company Name`;

        await sendEmail(clientEmail, clientSubject, clientText);


        await sendEmail(vendorEmail, vendorSubject, vendorText);

        res.status(200).json(payment);
      } catch (error) {
        console.error('Error saving payment data:', error);
        res.status(500).json({ error: 'Failed to save payment data' });
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;

      await Payment.findOneAndUpdate(
        { paymentIntentId: failedPayment.id },
        {
          paymentStatus: 'failed',
          transactionId: '',
        }
      );

      res.status(200).json({ message: 'Payment failed' });
      break;

    default:
      res.status(400).send('Event type not handled');
      break;
  }
};

module.exports = { createPaymentIntent, handlePaymentConfirmation };