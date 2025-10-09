import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { tableId, orderId, amount, waiterUid } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "try",
            product_data: { name: `Masa ${tableId} - Sipariş ${orderId}` },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.ORIGIN}?success=true`,
      cancel_url: `${process.env.ORIGIN}?canceled=true`,
      metadata: { tableId, orderId, waiterUid },
    });

    res.status(200).json({
      url: session.url,
      sessionId: session.id,
      provider: "stripe",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "create_checkout_failed" });
  }
}
