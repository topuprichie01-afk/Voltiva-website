
import { timingSafeEqual } from "node:crypto";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use POST."
    });
  }

  const secret = process.env.ORDER_STATUS_SECRET;
  const authorization = req.headers.authorization || "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!secret) {
    return res.status(500).json({
      success: false,
      message: "Server security configuration is missing."
    });
  }

  const expected = Buffer.from(secret);
  const supplied = Buffer.from(suppliedSecret);

  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized request."
    });
  }

  let body = req.body;

  try {
    if (typeof body === "string") {
      body = JSON.parse(body);
    }
  } catch {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request."
    });
  }

  const { order_id, status } = body || {};

  const allowedStatuses = [
    "pending",
    "processing",
    "completed",
    "failed"
  ];

  if (
    typeof order_id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(order_id) ||
    !allowedStatuses.includes(status)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID or status."
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      success: false,
      message: "Database server configuration is missing."
    });
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({ status })
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: "Database update failed."
      });
    }

    const updatedOrders = await response.json();

    if (!updatedOrders.length) {
      return res.status(404).json({
        success: false,
        message: "Order not found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated.",
      order: updatedOrders[0]
    });

  } catch {
    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
}
