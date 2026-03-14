const nodemailer = require('nodemailer');

// Reuse existing transporter configuration (similar to otpRoutes.js)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

/**
 * Sends an order confirmation email with the attached PDF invoice
 * @param {string} toEmail - Customer's email address
 * @param {string} orderId - System Order ID
 * @param {Buffer} pdfBuffer - Generated PDF invoice buffer
 */
const sendOrderConfirmationEmail = async (toEmail, orderId, pdfBuffer) => {
  try {
    const mailOptions = {
        from: `KAAVERI DESI <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: `Order Confirmation - ${orderId}`,
        text: `Dear Customer,\n\nThank you for shopping with KAAVERI DESI! Your order ${orderId} has been successfully placed.\n\nPlease find your detailed invoice attached to this email.\n\nWarm regards,\nThe KAAVERI DESI Team`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #8B1F1F;">Order Confirmation</h2>
                <p>Dear Customer,</p>
                <p>Thank you for shopping with <strong>KAAVERI DESI</strong>! Your order <strong>${orderId}</strong> has been successfully placed.</p>
                <p>Please find your detailed invoice attached to this email as a PDF.</p>
                <p>If you have any questions, feel free to contact us.</p>
                <br />
                <p>Warm regards,<br /><strong>The KAAVERI DESI Team</strong></p>
            </div>
        `,
        attachments: [
            {
                filename: `Invoice_${orderId}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent to ${toEmail}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
    return false;
  }
};

module.exports = {
  sendOrderConfirmationEmail
};
