import React from "react";
import star from "../assets/star.png";

function ProductRating({ product, className = "", starClassName = "h-3.5 w-3.5" }) {
  const reviewCount = Number(product?.reviewCount ?? product?.review_count ?? 0) || 0;
  const rating = Number(
    product?.averageRating ?? product?.average_rating ?? product?.rating ?? 0
  ) || 0;

  if (reviewCount <= 0 || rating <= 0) return null;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="flex">
        {Array.from({ length: 5 }).map((_, index) => (
          <img
            key={index}
            src={star}
            alt=""
            className={`${starClassName} ${
              index < Math.round(rating) ? "opacity-100" : "opacity-20"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-gray-500">({reviewCount})</span>
    </div>
  );
}

export default ProductRating;
