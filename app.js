/*
 * Voltiva - Customer Order Handler
 *
 * Requires:
 * 1. Supabase client already initialized on the page as `supabase`.
 * 2. A Supabase `orders` table with the columns below.
 * 3. The customer must be signed in.
 *
 * This records an order request only. It does not charge
 * the customer or purchase products from Paybeta.
 */

(function () {
  "use strict";

  const supabaseClient = window.supabaseClient || window.supabase;

  if (!supabaseClient || typeof supabaseClient.from !== "function") {
    console.error(
      "Voltiva: Supabase client is missing. Configure it before submitting orders."
    );
    return;
  }

  async function submitOrder(order) {
    if (!order || typeof order !== "object") {
      throw new Error("Order details are missing.");
    }

    const allowedServices = [
      "data",
      "airtime",
      "cable",
      "electricity",
      "boosting"
    ];

    const service = String(order.service || "").toLowerCase().trim();
    const customerReference = String(order.customerReference || "").trim();
    const productCode = String(order.productCode || "").trim();
    const amount = Number(order.amount);

    if (!allowedServices.includes(service)) {
      throw new Error("Please select a valid service.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Please enter a valid order amount.");
    }

    if (!customerReference || customerReference.length > 160) {
      throw new Error("Please check the recipient or account details.");
    }

    if (!productCode || productCode.length > 100) {
      throw new Error("Please select a valid product.");
    }

    const {
      data: { user },
      error: authError
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Please log in before placing an order.");
    }

    const { data, error } = await supabaseClient
      .from("orders")
      .insert({
        user_id: user.id,
        service: service,
        product_code: productCode,
        customer_reference: customerReference,
        amount: amount,
        status: "pending"
      })
      .select("id, status")
      .single();

    if (error) {
      console.error("Voltiva order request failed:", error.message);
      throw new Error(
        "We could not save your order request. Please try again later."
      );
    }

    return {
      success: true,
      orderId: data.id,
      status: data.status,
      message: "Your order request was received and is pending review."
    };
  }

  // Use this function from your order forms.
  window.VoltivaOrders = {
    submitOrder: submitOrder
  };

  // Connect forms that use data-order-form.
  document.addEventListener("submit", async function (event) {
    const form = event.target;

    if (
      !(form instanceof HTMLFormElement) ||
      !form.matches("[data-order-form]")
    ) {
      return;
    }

    event.preventDefault();

    const button = form.querySelector('[type="submit"]');
    const message = form.querySelector("[data-order-message]");

    if (button) button.disabled = true;
    if (message) message.textContent = "Submitting your order request...";

    try {
      const fields = new FormData(form);

      const result = await submitOrder({
        service: fields.get("service"),
        productCode: fields.get("product_code"),
        customerReference: fields.get("customer_reference"),
        amount: fields.get("amount")
      });

      if (message) {
        message.textContent =
          result.message + " Reference: " + result.orderId;
      }

      form.reset();
    } catch (error) {
      if (message) {
        message.textContent = error.message;
      } else {
        alert(error.message);
      }
    } finally {
      if (button) button.disabled = false;
    }
  });
})();
