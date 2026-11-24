
export default async function handler(req, res) {
  const FRONTEND = "https://topuprichie01-afk.github.io";

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
    PAYBETA_SECRET_KEY
  } = process.env;

  if (!SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !PAYBETA_SECRET_KEY) {
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
        message: "Please sign in."
      });
    }

    const authResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({
        success: false,
        message: "Invalid login session."
      });
    }

    const user = await authResponse.json();
    const reference = req.body?.reference;

    if (
      typeof reference !== "string" ||
      !/^VOLTIVA-[a-f0-9-]{36}$/i.test(reference)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment reference."
      });
    }

    const dbHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    };

    // Find the customer's own funding request.
    const fundingResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/wallet_fundings?reference=eq.${encodeURIComponent(reference)}&user_id=eq.${encodeURIComponent(user.id)}&select=reference,amount,status&limit=1`,
      { headers: dbHeaders }
    );

    if (!fundingResponse.ok) {
      throw new Error("Could not check funding record.");
    }

    const records = await fundingResponse.json();
    const funding = records[0];

    if (!funding) {
      return res.status(404).json({
        success: false,
        message: "Funding request not found."
      });
    }

    if (funding.status === "successful") {
      return res.status(200).json({
        success: true,
        message: "This payment has already been credited."
      });
    }

    if (funding.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "This funding request is not pending."
      });
    }

    // Independently verify the payment with Paybeta.
    const paymentResponse = await fetch(
      `https://checkout.paybeta.ng/v1/payments/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "P-API-KEY": PAYBETA_SECRET_KEY
        }
      }
    );

    const payment = await paymentResponse.json();
    const data = payment?.data;

    if (!paymentResponse.ok || !data) {
      return res.status(502).json({
        success: false,
        message: "Could not verify payment with Paybeta."
      });
    }

    if (
      data.reference !== reference ||
      data.mode !== "test" ||
      data.livemode !== false
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment reference or test mode does not match."
      });
    }

    if (data.status === "pending") {
      return res.status(202).json({
        success: false,
        message: "Payment is still pending."
      });
    }

    if (data.status !== "successful") {
      return res.status(400).json({
        success: false,
        message: "Payment has not succeeded."
      });
    }

    const paidAmount = Number(data.amount_paid);

    if (
      !Number.isFinite(paidAmount) ||
      paidAmount !== Number(funding.amount) ||
      data.currency !== "NGN"
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment amount or currency does not match."
      });
    }

    // Credit through the protected database function.
    const creditResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/credit_wallet_funding`,
      {
        method: "POST",
        headers: {
          ...dbHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_reference: reference,
          p_paybeta_payment_id: data.id,
          p_amount_paid: paidAmount
        })
      }
    );

    if (!creditResponse.ok) {
      throw new Error("Wallet credit could not be completed.");
    }

    const creditResult = await creditResponse.json();

    if (
      creditResult !== "credited" &&
      creditResult !== "already_credited"
    ) {
      throw new Error("Unexpected wallet credit result.");
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
      credited: creditResult === "credited"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Payment verification could not be completed."
    });
  }
}

