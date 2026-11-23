import { formatCurrency } from "../lib/api";
import { resolveProductOffer } from "../lib/productOffer";

export default function PriceOffer({ price, comparePrice, mrp, percent, className = "" }) {
  const offer = resolveProductOffer({ price, comparePrice, mrp, percent });

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 ${className}`}>
      <span className="font-bold text-[#C2863F]">{formatCurrency(offer.sellingPrice)}</span>
      {offer.active && (
        <>
          <span className="text-sm text-gray-400 line-through">{formatCurrency(offer.mrp)}</span>
          <span className="text-xs font-semibold text-green-700">{offer.percent}% OFF</span>
          <span className="text-xs text-gray-500">Save {formatCurrency(offer.savings)}</span>
        </>
      )}
    </span>
  );
}
