const Stripe = require("stripe");

let client;

function getStripeClient() {
  if (!client) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set. See .env.example.");
    }
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20",
    });
  }
  return client;
}

module.exports = { getStripeClient };