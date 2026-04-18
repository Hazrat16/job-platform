function gatewayBase(isSandbox: boolean): string {
  return isSandbox
    ? "https://sandbox.sslcommerz.com"
    : "https://securepay.sslcommerz.com";
}

export type InitiateHostedCheckoutInput = {
  storeId: string;
  storePassword: string;
  isSandbox: boolean;
  tranId: string;
  totalAmount: number;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address1: string;
    city: string;
    country: string;
    postcode: string;
  };
  productName: string;
  productCategory: string;
};

export type InitiateHostedCheckoutResult =
  | { ok: true; gatewayUrl: string; sessionKey?: string }
  | { ok: false; message: string };

export async function initiateHostedCheckout(
  input: InitiateHostedCheckoutInput,
): Promise<InitiateHostedCheckoutResult> {
  const base = gatewayBase(input.isSandbox);
  const url = `${base}/gwprocess/v4/api.php`;
  const amt = input.totalAmount.toFixed(2);
  const c = input.customer;

  const body = new URLSearchParams();
  body.set("store_id", input.storeId);
  body.set("store_passwd", input.storePassword);
  body.set("total_amount", amt);
  body.set("currency", "BDT");
  body.set("tran_id", input.tranId);
  body.set("success_url", input.successUrl);
  body.set("fail_url", input.failUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("ipn_url", input.ipnUrl);

  body.set("cus_name", c.name.slice(0, 50));
  body.set("cus_email", c.email.slice(0, 50));
  body.set("cus_add1", c.address1.slice(0, 50));
  body.set("cus_add2", c.address1.slice(0, 50));
  body.set("cus_city", c.city.slice(0, 50));
  body.set("cus_state", c.city.slice(0, 50));
  body.set("cus_postcode", c.postcode.slice(0, 30));
  body.set("cus_country", c.country.slice(0, 50));
  body.set("cus_phone", c.phone.replace(/\D/g, "").slice(0, 20) || "01700000000");
  body.set("cus_fax", c.phone.replace(/\D/g, "").slice(0, 20) || "01700000000");

  body.set("shipping_method", "NO");
  body.set("num_of_item", "1");
  body.set("weight_of_items", "0.00");
  body.set("ship_name", c.name.slice(0, 50));
  body.set("ship_add1", c.address1.slice(0, 50));
  body.set("ship_add2", c.address1.slice(0, 50));
  body.set("ship_city", c.city.slice(0, 50));
  body.set("ship_state", c.city.slice(0, 50));
  body.set("ship_postcode", c.postcode.slice(0, 50));
  body.set("ship_country", c.country.slice(0, 50));

  body.set("product_name", input.productName.slice(0, 255));
  body.set("product_category", input.productCategory.slice(0, 100));
  body.set("product_profile", "non-physical-goods");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, message: "Invalid response from SSLCOMMERZ" };
  }

  const status = String(parsed["status"] || "");
  if (status !== "SUCCESS") {
    const reason = String(parsed["failedreason"] || parsed["message"] || "Session failed");
    return { ok: false, message: reason };
  }

  const gatewayUrl =
    (typeof parsed["GatewayPageURL"] === "string" && parsed["GatewayPageURL"]) ||
    (typeof parsed["redirectGatewayURL"] === "string" && parsed["redirectGatewayURL"]) ||
    "";

  if (!gatewayUrl) {
    return { ok: false, message: "No gateway URL in SSLCOMMERZ response" };
  }

  const sessionKey =
    typeof parsed["sessionkey"] === "string" ? parsed["sessionkey"] : undefined;

  if (sessionKey) {
    return { ok: true, gatewayUrl, sessionKey };
  }
  return { ok: true, gatewayUrl };
}

export type ValidationPayload = {
  status?: string;
  tran_id?: string;
  amount?: string | number;
  currency_type?: string;
  val_id?: string;
  bank_tran_id?: string;
};

export async function validateTransactionByValId(
  valId: string,
  storeId: string,
  storePassword: string,
  isSandbox: boolean,
): Promise<ValidationPayload | null> {
  const base = gatewayBase(isSandbox);
  const q = new URLSearchParams({
    val_id: valId,
    store_id: storeId,
    store_passwd: storePassword,
    format: "json",
  });
  const url = `${base}/validator/api/validationserverAPI.php?${q.toString()}`;
  const res = await fetch(url);
  const text = await res.text();
  try {
    return JSON.parse(text) as ValidationPayload;
  } catch {
    return null;
  }
}
