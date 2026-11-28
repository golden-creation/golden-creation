import { useEffect, useState } from "react";
import { getPaymentPreview } from "../lib/api";

export default function PaymentEligibility({ items = [] }) {
  const [message, setMessage] = useState("");
  const key = JSON.stringify(
    items
      .filter((item) => item?.productId)
      .map((item) => [item.productId, item.variantId || 0, item.quantity || 1])
  );

  useEffect(() => {
    const payload = JSON.parse(key);
    if (!payload.length) {
      setMessage("");
      return undefined;
    }
    let cancelled = false;
    getPaymentPreview({
      items: payload.map(([productId, variantId, quantity]) => ({ productId, variantId, quantity })),
    })
      .then((preview) => {
        if (!cancelled) setMessage(preview?.cart?.label || "");
      })
      .catch(() => {
        if (!cancelled) setMessage("");
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!message) return null;
  return <p className="mt-2 text-xs text-gray-500">{message} Coupons, shipping, and the delivery PIN are confirmed at checkout.</p>;
}
