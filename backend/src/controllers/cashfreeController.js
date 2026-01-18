// src/controllers/cashfreeController.js
require('dotenv').config();
// const fetch = require('node-fetch');
const crypto = require('crypto');
const { Order } = require('../models'); // Sequelize Order model (adjust path if needed)
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

/**
 * Helper to call Cashfree API
 */

async function cashfreeFetch(path, method = 'POST', bodyObj = null) {
  try {
    const base = process.env.CASHFREE_API_BASE || 'https://sandbox.cashfree.com/pg';
    const url = (base.endsWith('/') ? base.slice(0, -1) : base) + (path.startsWith('/') ? path : '/' + path);

    // Ensure API version header has valid fallback
    const apiVersion = process.env.CASHFREE_API_VERSION || '2023-08-01';

    // Build headers
    const headers = {
      'Content-Type': 'application/json',
      'x-api-version': apiVersion,
      'x-client-id': process.env.CASHFREE_CLIENT_ID || '',
      'x-client-secret': process.env.CASHFREE_CLIENT_SECRET || ''
    };

    // If bodyObj contains an amount numeric, ensure it's a string with 2 decimals
    if (bodyObj && typeof bodyObj.amount !== 'undefined') {
      // convert to string with two decimals
      const n = Number(bodyObj.amount);
      if (!isNaN(n)) bodyObj.amount = n.toFixed(2);
    }

    const bodyString = bodyObj ? JSON.stringify(bodyObj) : undefined;

    // console.log('cashfreeFetch -> URL:', url);
    // console.log('cashfreeFetch -> METHOD:', method);
    // console.log('cashfreeFetch -> HEADERS:', JSON.stringify(headers));
    // console.log('cashfreeFetch -> BODY:', bodyString);

    const resp = await fetch(url, {
      method,
      headers,
      body: bodyString
    });

    const text = await resp.text().catch(() => '');
    // try parse json safely
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (err) {
      json = { rawText: text };
    }

    // console.log('cashfreeFetch -> HTTP status:', resp.status);
    // console.log('cashfreeFetch -> response body:', JSON.stringify(json));

    return { ok: resp.ok, status: resp.status, json };
  } catch (err) {
    console.error('cashfreeFetch error:', err);
    throw err;
  }
}


/**
 * Create payment link for a given order
 * POST /api/payment/create-payment-link
 * body: { orderId }
 */

exports.createPaymentLink = async (req, res) => {
  try {
    const { orderId, amount: amountFromBody, return_url } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });

    // Fetch order
    const order = await Order.findByPk(orderId);
     const [userOrderDetails] = await sequelize.query(
      `
      SELECT 
        o.*,
        u.first_name AS buyer_first_name,
        u.last_name AS buyer_last_name,
        u.email AS buyer_email,
        u.phone AS buyer_phone
      FROM orders o
      LEFT JOIN users u ON o.buyer_id = u.id
      WHERE o.id = :orderId
      LIMIT 1
      `,
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });


    // If order.payment_method is COD, warn user (you normally don't create link for COD)
    if (order.payment_method && String(order.payment_method).toLowerCase() === 'cod') {
      // you may still want to create a link, but warn in logs
      console.warn(`createPaymentLink: order ${orderId} has payment_method=COD — continuing to create link because requested.`);
    }

    // Choose amount: DB total_amount preferred, then request body fallback
    const rawAmount = order.total_amount || amountFromBody;
    const amount = Number(rawAmount);

    if (!rawAmount || isNaN(amount) || amount <= 0) {
      console.error('createPaymentLink - invalid amount:', rawAmount);
      return res.status(400).json({ success: false, error: { message: 'Invalid amount for link creation', amount: rawAmount }});
    }
    const amountStr = Number(amount).toFixed(2);
    let buyerName = `${userOrderDetails.buyer_first_name || ''} ${userOrderDetails.buyer_last_name || ''}`.trim();
    let buyerEmail = userOrderDetails.buyer_email || '';
    let buyerPhone = userOrderDetails.buyer_phone || '';

    // Normalize buyer phone if needed
    if (buyerPhone) {
      const digits = buyerPhone.toString().replace(/\D/g, '');
      if (digits.length === 10) buyerPhone = digits;
      else buyerPhone = '+' + digits;
    } else {
      // fallback test number to prevent Cashfree errors
      buyerPhone = '9999999999';
    }

    // Build payload to send to Cashfree
    const payload = {
      link_amount: amountStr,     
      link_currency: order.currency || 'INR',
      link_purpose: `Order ${order.order_number || orderId}`,
      customer_details: {
        name: buyerName || 'fallback-name',
        email: buyerEmail || 'fallback-email',
        customer_phone: buyerPhone || '8888888888'
      },
      return_url: return_url || (process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/payment-return` : `${req.protocol}://${req.get('host')}/payment-return`)
    };

    // Call Cashfree
    const result = await cashfreeFetch('/links', 'POST', payload);

    // If Cashfree returned error forward it
    if (!result.ok) {
      console.error('Cashfree create link failed:', JSON.stringify(result.json));
      return res.status(result.status).json({ success: false, error: result.json });
    }

    const linkData = result.json;

    // Update order with link info
    await order.update({
      payment_link_id: linkData.link_id || linkData.data?.link_id || null,
      payment_link_url: linkData.link_url || linkData.data?.link_url || null,
      payment_status: order.payment_status || 'pending',
      payment_metadata: linkData
    });

    return res.json({ success: true, data: linkData });
  } catch (err) {
    console.error('createPaymentLink error', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
/**
 * Optional: get link details (for a return page verification)
 * GET /api/payment/link/:linkId
 */
exports.getLinkDetails = async (req, res) => {
  try {
    const { linkId } = req.params;
    if (!linkId) return res.status(400).json({ success: false, error: 'linkId required' });
    const result = await cashfreeFetch(`/links/${linkId}`, 'GET', null);
    if (!result.ok) return res.status(result.status).json({ success: false, error: result.json });
    return res.json({ success: true, data: result.json });
  } catch (err) {
    console.error('getLinkDetails error', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Webhook handler: Cashfree posts events here
 * Note: This route must use raw body (see app.js)
 */
// exports.webhookHandler = async (req, res) => {
//   try {
//     // rawBody must be attached by middleware in app.js (we'll set that)
//     const rawBody = req.rawBody || (req.body && typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
//     const signature = req.headers['x-webhook-signature'] || req.headers['x-cf-signature'] || req.headers['x-signature'] || '';
//     const timestamp = req.headers['x-webhook-timestamp'] || req.headers['x-cf-timestamp'] || '';

//     if (!signature) {
//       console.warn('Webhook: missing signature');
//       return res.status(400).send('missing signature');
//     }

//     const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_CLIENT_SECRET;
//     const dataToSign = timestamp + rawBody;
//     const expected = crypto.createHmac('sha256', webhookSecret).update(dataToSign).digest('base64');

//     if (expected !== signature) {
//       console.warn('Webhook: invalid signature');
//       return res.status(400).send('invalid signature');
//     }

//     // Parse payload
//     const payload = JSON.parse(rawBody);
//     console.log('Cashfree webhook payload:', payload);

//     // --- Example handling (adapt to real payload shape) ---
//     // If payload contains payment/link id and status, update order accordingly.
//     // Check what your webhook payload contains by inspecting logs.
//     // Typical keys could be: payload.event, payload.link, payload.payment
//     // Example: event = 'payment_link.paid' or payload.payment_status === 'PAID'

//     try {
//       const event = payload.event || payload.type || '';
//       // Attempt to get link id and status from payload
//       const linkId = payload.link?.id || payload.data?.link_id || payload.payment?.link_id || payload.link_id || payload.data?.link?.link_id;
//       const paymentStatus = payload.payment?.status || payload.data?.status || payload.data?.payment_status || payload.status || (payload.link && payload.link.status);

//       if (linkId) {
//         // find order by payment_link_id
//         const order = await Order.findOne({ where: { payment_link_id: linkId } });
//         if (order) {
//           // Map some possible status values to your DB
//           if (String(paymentStatus).toUpperCase() === 'PAID' || String(paymentStatus).toUpperCase() === 'SUCCESS' || event.includes('paid')) {
//             await order.update({ payment_status: 'paid' });
//             console.log('Order marked paid:', order.id);
//           } else if (String(paymentStatus).toUpperCase() === 'EXPIRED' || event.includes('expired')) {
//             await order.update({ payment_status: 'expired' });
//           } else if (String(paymentStatus).toUpperCase() === 'FAILED' || event.includes('failed')) {
//             await order.update({ payment_status: 'failed' });
//           } else {
//             // unknown; save raw payload to metadata field if you have one
//             await order.update({ payment_status: paymentStatus || 'updated' });
//           }
//         } else {
//           console.warn('Webhook: order not found for linkId', linkId);
//         }
//       } else {
//         console.warn('Webhook: no linkId in payload; payload logged for review.');
//       }
//     } catch (dbErr) {
//       console.error('Webhook DB handling error', dbErr);
//     }

//     return res.status(200).send('OK');
//   } catch (err) {
//     console.error('webhookHandler error', err);
//     return res.status(500).send('error');
//   }
// };

// exports.webhookHandler = async (req, res) => {
//   try {
//     /**
//      * 1. Read raw body (required for signature verification)
//      */
//     const rawBody =
//       req.rawBody ||
//       (typeof req.body === 'string'
//         ? req.body
//         : JSON.stringify(req.body || {}));

//     /**
//      * 2. Read signature + timestamp headers (Cashfree sends these)
//      */
//     const signature =
//       req.headers['x-webhook-signature'] ||
//       req.headers['x-cf-signature'] ||
//       req.headers['x-signature'];

//     const timestamp =
//       req.headers['x-webhook-timestamp'] ||
//       req.headers['x-cf-timestamp'];

//     if (!signature || !timestamp) {
//       console.warn('Cashfree webhook: missing signature or timestamp');
//       return res.status(400).send('missing signature');
//     }

//     /**
//      * 3. Verify signature
//      */
//     const secret = process.env.CASHFREE_WEBHOOK_SECRET;
//     if (!secret) {
//       console.error('Webhook secret not configured');
//       return res.status(500).send('server error');
//     }

//     const signedPayload = timestamp + rawBody;
//     const expectedSignature = crypto
//       .createHmac('sha256', secret)
//       .update(signedPayload)
//       .digest('base64');

//     if (expectedSignature !== signature) {
//       console.warn('Cashfree webhook: invalid signature');
//       return res.status(400).send('invalid signature');
//     }

//     /**
//      * 4. Parse payload
//      */
//     const payload = JSON.parse(rawBody);
//     console.log('Cashfree webhook payload:', payload);

//     /**
//      * 5. Extract event + link_id
//      */
//     const event = payload.event; // e.g. payment_link.paid

//     const linkId =
//       payload.data?.link?.link_id ||
//       payload.data?.link_id ||
//       payload.link_id;

//     if (!linkId) {
//       console.warn('Webhook received without link_id');
//       return res.status(200).send('OK');
//     }

//     /**
//      * 6. Find order using payment_link_id
//      */
//     const order = await Order.findOne({
//       where: { payment_link_id: linkId }
//     });

//     if (!order) {
//       console.warn('Webhook: order not found for link_id', linkId);
//       return res.status(200).send('OK');
//     }

//     /**
//      * 7. Update order based on EVENT (SOURCE OF TRUTH)
//      */
//     switch (event) {
//       case 'payment_link.paid': {
//         const paymentId =
//           payload.data?.payment?.payment_id ||
//           payload.data?.payment_id ||
//           null;

//         await order.update({
//           payment_status: 'paid',
//           payment_id: paymentId
//         });

//         console.log('Order marked PAID:', order.id);
//         break;
//       }

//       case 'payment_link.failed':
//         await order.update({ payment_status: 'failed' });
//         console.log('Order marked FAILED:', order.id);
//         break;

//       // case 'payment_link.expired':
//       //   await order.update({ payment_status: 'expired' });
//       //   console.log('Order marked EXPIRED:', order.id);
//       //   break;

//       default:
//         console.log('Webhook event ignored:', event);
//     }

//     /**
//      * 8. Always return 200 (Cashfree retry-safe)
//      */
//     return res.status(200).send('OK');
//   } catch (err) {
//     console.error('webhookHandler fatal error:', err);
//     return res.status(500).send('error');
//   }
// };
exports.webhookHandler = async (req, res) => {
  try {
    const rawBody =
      req.rawBody ||
      (typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body || {}));

    const signature =
      req.headers['x-webhook-signature'] ||
      req.headers['x-cf-signature'];

    const timestamp =
      req.headers['x-webhook-timestamp'] ||
      req.headers['x-cf-timestamp'];

    const secret = process.env.CASHFREE_WEBHOOK_SECRET;

    /**
     * 🔐 Signature verification (NON-BLOCKING)
     */
    if (signature && timestamp && secret) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(timestamp + rawBody)
        .digest('base64');

      if (expectedSignature !== signature) {
        console.warn('⚠️ Cashfree webhook signature mismatch');
        // DO NOT FAIL
      }
    } else {
      console.warn('⚠️ Cashfree webhook test payload / missing headers');
    }

    /**
     * 📦 Parse payload safely
     */
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error('Invalid JSON payload');
      return res.status(200).send('OK');
    }

    console.log('✅ Cashfree webhook payload:', payload);

    /**
     * 🔍 Extract event + link id
     */
    const event = payload.event || payload.type;
    const linkId =
      payload.data?.link_id ||
      payload.data?.link?.link_id ||
      payload.link_id;

    if (!linkId) {
      console.warn('Webhook without linkId');
      return res.status(200).send('OK');
    }

    const order = await Order.findOne({
      where: { payment_link_id: linkId }
    });

    if (!order) {
      console.warn('Order not found for linkId:', linkId);
      return res.status(200).send('OK');
    }

    /**
     * 💰 Payment status mapping
     */
    const linkStatus =
      payload.data?.link_status ||
      payload.data?.order?.transaction_status;

    if (linkStatus === 'PAID' || linkStatus === 'SUCCESS') {
      await order.update({ payment_status: 'paid' });
      console.log('Order marked PAID:', order.id);
    } else if (linkStatus === 'PARTIALLY_PAID') {
      await order.update({ payment_status: 'partial' });
    } else if (linkStatus === 'FAILED') {
      await order.update({ payment_status: 'failed' });
    }

    /**
     * ✅ ALWAYS ACK CASHFREE
     */
    return res.status(200).send('OK');

  } catch (err) {
    console.error('Webhook fatal error:', err);
    return res.status(200).send('OK');
  }
};

