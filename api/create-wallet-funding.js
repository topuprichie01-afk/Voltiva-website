
import { randomUUID } from "node:crypto";

const FRONTEND =
  "https://topuprichie01-afk.github.io";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", FRONTEND);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Use POST."
    });
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    PAYBETA_API_KEY
  } = process.env;

  if (!SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !PAYBETA_API_KEY) {
    return res.status(500).json({
      success: false,
      message: "Server configuration is incomplete."
    });
  }

  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Please sign in first."
      });
    }

    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        success: false,
        message: "Your login session is invalid."
      });
    }

    const user = await userResponse.json();

    const amount = Number(req.body?.amount);

    if (!Number.isFinite(amount) ||
        amount < 100 ||
        amount > 1000000) {
      return res.status(400).json({
        success: false,
        message: "Enter an amount between ₦100 and ₦1,000,000."
      });
    }

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: "Your account has no email address."
      });
    }

    const reference = `VOLTIVA-${randomUUID()}`;

    const dbHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    };

    const saveResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/wallet_fundings`,
      {
        method: "POST",
        headers: {
          ...dbHeaders,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          user_id: user.id,
          reference,
          amount,
          status: "pending"
        })
      }
    );

    if (!saveResponse.ok) {
      throw new Error("Could not create funding record.");
    }

    const paymentResponse = await fetch(
      "https://checkout.paybeta.ng/v1/payments",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "P-API-KEY": PAYBETA_API_KEY
        },
        body: JSON.stringify({
          mode: "test",
          reference,
          amount,
          currency: "NGN",
          description: "Voltiva wallet funding",
          customer: {
            email: user.email
          },
          redirect_url:
            "https://topuprichie01-afk.github.io/Voltiva-website/dashboard.html"
        })
      }
    );

    const payment = await paymentResponse.json();
    const paymentData = payment?.data;

    if (!paymentResponse.ok ||
        payment.status !== "successful" ||
        !paymentData?.checkout_url) {

      await fetch(
        `${SUPABASE_URL}/rest/v1/wallet_fundings?reference=eq.${encodeURIComponent(reference)}`,
        {
          method: "PATCH",
          headers: {
            ...dbHeaders,
            Prefer: "return=minimal"
          },
          body: JSON.stringify({ status: "failed" })
        }
      );

      return res.status(502).json({
        success: false,
        message: "Paybeta could not create the payment."
      });
    }

    await fetch(
      `${SUPABASE_URL}/rest/v1/wallet_fundings?reference=eq.${encodeURIComponent(reference)}`,
      {
        method: "PATCH",
        headers: {
          ...dbHeaders,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          paybeta_payment_id: paymentData.id
        })
      }
    );

    return res.status(200).json({
      success: true,
      reference,
      checkout_url: paymentData.checkout_url
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to create wallet funding."
    });
  }
}
