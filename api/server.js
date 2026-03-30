// YieldDesk — API Server
// Handles Stripe checkout, webhooks, and Pro API access
// Deploy to Render as a Node.js web service

import express from 'express';
import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { calculate, PROCESS_NODES, WAFER_DIAMETERS_MM } from '../js/calculator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_PRICE_ID       = process.env.STRIPE_PRICE_ID; // Monthly Pro price ID
const BASE_URL              = process.env.BASE_URL || 'http://localhost:3000';

// In-memory pro key store (replace with DB in production)
// Key: Stripe customer ID → { email, active, apiKey }
const proUsers = new Map();

function generateApiKey() {
  return 'yd_' + [...Array(32)].map(() => Math.random().toString(36)[2]).join('');
}

const app = express();

// Raw body for Stripe webhook verification
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Serve static files
app.use(express.static(ROOT));

// ── Stripe Checkout ────────────────────────────────────────────
app.get('/checkout', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${BASE_URL}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${BASE_URL}/#pricing`,
      allow_promotion_codes: true,
    });
    res.redirect(303, session.url);
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
});

// ── Stripe Webhook ─────────────────────────────────────────────
app.post('/api/webhook', (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const customerId = session.customer;
      const email = session.customer_details?.email;
      if (!proUsers.has(customerId)) {
        proUsers.set(customerId, { email, active: true, apiKey: generateApiKey() });
        console.log(`New Pro subscriber: ${email}`);
      }
      break;
    }
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused': {
      const sub = event.data.object;
      const user = proUsers.get(sub.customer);
      if (user) { user.active = false; console.log(`Subscription cancelled: ${user.email}`); }
      break;
    }
    case 'customer.subscription.resumed':
    case 'invoice.payment_succeeded': {
      const obj = event.data.object;
      const cid = obj.customer;
      const user = proUsers.get(cid);
      if (user) { user.active = true; }
      break;
    }
  }

  res.json({ received: true });
});

// ── Pro API — Yield Calculator ─────────────────────────────────
// GET /api/v1/yield?processNode=14nm&dieArea=100&waferDiam=300&waferCost=4500
app.get('/api/v1/yield', (req, res) => {
  // Validate API key
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const user = [...proUsers.values()].find(u => u.apiKey === apiKey && u.active);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or inactive API key. Upgrade at yielddesk.tools' });
  }

  const { processNode, dieArea, waferDiam, waferCost, edgeLoss } = req.query;

  if (!processNode || !PROCESS_NODES[processNode]) {
    return res.status(400).json({ error: `Invalid processNode. Valid values: ${Object.keys(PROCESS_NODES).join(', ')}` });
  }

  const dieAreaMm2 = parseFloat(dieArea);
  if (!dieAreaMm2 || dieAreaMm2 <= 0) {
    return res.status(400).json({ error: 'dieArea must be a positive number (mm²)' });
  }

  const waferDiamMm = parseFloat(waferDiam) || 300;
  const waferCostOverride = waferCost ? parseFloat(waferCost) : undefined;
  const edgeLossMm = parseFloat(edgeLoss) || 3;

  try {
    const result = calculate({ waferDiamMm, dieAreaMm2, processNode, waferCostOverride, edgeLossMm });
    res.json({
      input: { processNode, dieAreaMm2, waferDiamMm, waferCost: result.waferCost, edgeLossMm },
      output: {
        diesPerWafer:     result.diesPerWafer,
        yieldMurphy:      parseFloat(result.yieldMurphy.toFixed(4)),
        yieldPoisson:     parseFloat(result.yieldPoisson.toFixed(4)),
        goodDiesPerWafer: result.goodDiesPerWafer,
        costPerGoodDie:   result.costPerGoodDie ? parseFloat(result.costPerGoodDie.toFixed(2)) : null,
        defectDensity:    result.defectDensity,
        processNodeLabel: result.processNodeLabel,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API Key lookup (after Stripe success) ──────────────────────
app.get('/api/v1/account', async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: 'session_id required' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const user = proUsers.get(session.customer);
    if (!user) return res.status(404).json({ error: 'Account not found. Webhook may not have fired yet.' });
    res.json({ email: user.email, active: user.active, apiKey: user.apiKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ───────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', proUsers: proUsers.size });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`YieldDesk running on port ${PORT}`));
