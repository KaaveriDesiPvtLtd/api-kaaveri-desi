const PDFDocument = require('pdfkit');
const billingConfig = require('../config/billing');

/**
 * Generates an Invoice PDF inside a memory buffer
 * @param {Object} order - The created order object
 * @returns {Promise<Buffer>}
 */
const generateInvoicePDF = (order) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      generateHeader(doc);
      generateCustomerInformation(doc, order);
      generateInvoiceTable(doc, order);
      generateFooter(doc);

      doc.end();
    } catch (error) {
      console.error('Error in PDF generation:', error);
      reject(error);
    }
  });
};

function generateHeader(doc) {
  doc
    .fillColor('#8B1F1F')
    .fontSize(24)
    .text(billingConfig.companyName, 50, 45)
    .fillColor('#444444')
    .fontSize(10)
    .text(billingConfig.addressLine1, 200, 50, { align: 'right' })
    .text(billingConfig.addressLine2, 200, 65, { align: 'right' })
    .text(`GST: ${billingConfig.gstNumber}`, 200, 80, { align: 'right' })
    .moveDown();
}

function generateCustomerInformation(doc, order) {
  doc
    .fillColor('#444444')
    .fontSize(20)
    .text('INVOICE', 50, 130);

  generateHr(doc, 155);

  const customerInformationTop = 170;

  doc
    .fontSize(10)
    .text('Invoice Number:', 50, customerInformationTop)
    .font('Helvetica-Bold')
    .text(order.orderId, 150, customerInformationTop)
    .font('Helvetica')
    .text('Invoice Date:', 50, customerInformationTop + 15)
    .text(new Date().toLocaleDateString('en-IN'), 150, customerInformationTop + 15)
    .text('Payment Method:', 50, customerInformationTop + 30)
    .text(order.paymentMethod.toUpperCase(), 150, customerInformationTop + 30)
    
    .font('Helvetica-Bold')
    .text('Billed To:', 300, customerInformationTop)
    .font('Helvetica')
    .text(order.shippingAddress.fullName, 300, customerInformationTop + 15)
    .text(order.shippingAddress.addressLine1, 300, customerInformationTop + 30)
    .text(
      `${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}`,
      300,
      customerInformationTop + 45
    )
    .text(order.shippingAddress.phone, 300, customerInformationTop + 60)
    .moveDown();

  generateHr(doc, 250);
}

function generateInvoiceTable(doc, order) {
  let i;
  const invoiceTableTop = 290;

  doc.font('Helvetica-Bold');
  generateTableRow(
    doc,
    invoiceTableTop,
    'Item Description',
    'Unit Price',
    'Quantity',
    'Line Total'
  );
  generateHr(doc, invoiceTableTop + 20);
  doc.font('Helvetica');

  let position = 0;
  
  order.orderItems.forEach((item, index) => {
    position = invoiceTableTop + 30 + (index * 30);
    const lineTotal = item.price * item.quantity;
    
    generateTableRow(
      doc,
      position,
      item.title,
      `${billingConfig.currencySymbol}${item.price.toFixed(2)}`,
      item.quantity.toString(),
      `${billingConfig.currencySymbol}${lineTotal.toFixed(2)}`
    );

    generateHr(doc, position + 20);
  });

  const subtotalPosition = position + 30;
  doc.font('Helvetica-Bold');
  generateTableRow(
    doc,
    subtotalPosition,
    '',
    '',
    'Total Amount',
    `${billingConfig.currencySymbol}${order.totalAmount.toFixed(2)}`
  );
  doc.font('Helvetica');
}

function generateFooter(doc) {
  doc
    .fontSize(10)
    .text(
      'Payment is due within 15 days. Thank you for your business.',
      50,
      700,
      { align: 'center', width: 500 }
    )
    .text(
      `Need help? Contact ${billingConfig.email} | ${billingConfig.phone}`,
      50,
      715,
      { align: 'center', width: 500 }
    );
}

function generateTableRow(doc, y, item, unitCost, quantity, lineTotal) {
  doc
    .fontSize(10)
    .text(item, 50, y, { width: 250 })
    .text(unitCost, 310, y, { width: 90, align: 'right' })
    .text(quantity, 420, y, { width: 50, align: 'right' })
    .text(lineTotal, 0, y, { align: 'right' });
}

function generateHr(doc, y) {
  doc
    .strokeColor('#aaaaaa')
    .lineWidth(1)
    .moveTo(50, y)
    .lineTo(550, y)
    .stroke();
}

module.exports = { generateInvoicePDF };
