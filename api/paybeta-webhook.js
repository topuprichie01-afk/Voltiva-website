
import { createHmac, timingSafeEqual } from "node:crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use POST."
    });
  }

  const secret = process.env.PAYBETA_SECRET_KEY;

  if (!secret) {
    return res.status(500).json({
      success: false,
      message: "Webhook security configuration is missing."
    });
  }

  const payload = req.body || {};
  const reference = payload?.data?.reference;
  const signature = req.headers.signature || "";

  if (
    typeof reference !== "string" ||
    !reference ||
    typeof signature !== "string"
  ) {
    return res.status(400).json({
      success: false,
      message: "Missing transaction reference or signature."
    });
  }

  const expected = createHmac("sha256", secret)
    .update(reference)
    .digest("hex");

  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid Paybeta signature."
    });
  }

  return res.status(200).json({
    success: true,
    message: "Paybeta webhook signature verified.",
    received: true
  });
}
