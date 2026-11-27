import { useEffect, useState } from "react";
import { getPaymentPreview } from "../lib/api";

export default function PaymentEligibility({ items = [] }) {
  const [lines, setLines] = useState([]);
  const key = JSON.stringify(
    items
      .filter((item) => item?.productId)
      .map((item) => [item.productId, item.variantId || 0, item.quantity || 1])
  );

  useEffect(() => {
    const payload = JSON.parse(key);
    if (!payload.length) {
      setLines([]);
      return undefined;
    }
    let cancelled = false;
    getPaymentPreview({
      items: payload.map(([productId, variantId, quantity]) => ({ productId, variantId, quantity })),
    })
      .then((preview) => {
        if (!cancelled) setLines(preview?.lines || []);
      })
      .catch(() => {
        if (!cancelled) setLines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!lines.length) return null;
  return (
    <div className="mt-2 space-y-1 text-xs text-gray-500">
      {lines.map((line) => (
        <p key={`${line.productId}-${line.unitPrice}`}>
          {line.eligibility?.label} {line.distanceNote}
        </p>
      ))}
    </div>
  );
}
