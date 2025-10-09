import Stripe from "stripe";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}
const db = getFirestore();

export const config = { api: { bodyParser: false } };

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("❌ Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { orderId, tableId, waiterUid } = session.metadata || {};

    if (orderId && tableId) {
      const ref = db.collection("tables").doc(tableId).collection("orders").doc(orderId);
      try {
        await ref.update({
          payment: {
            status: "paid",
            method: "qr",
            provider: "stripe",
            sessionId: session.id,
            transactionId: session.payment_intent || null,
            amount: session.amount_total / 100,
            currency: session.currency.toUpperCase(),
            collectedBy: waiterUid || null,
            paidAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("🔥 Firestore update failed:", err);
      }
    }
  }

  return res.status(200).json({ received: true });
}
