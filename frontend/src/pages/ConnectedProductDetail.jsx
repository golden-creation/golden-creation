import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Footer from "../components/Footer";
import PriceOffer from "../components/PriceOffer";
import PaymentEligibility from "../components/PaymentEligibility";
import Navbar from "../components/Navbar";
import heart from "../assets/heart.png";
import share from "../assets/share.png";
import zoomIcon from "../assets/search.png";
import star from "../assets/star.png";
import addIcon from "../assets/add.png";
import minusIcon from "../assets/minus.png";
import car from "../assets/car.png";
import undo from "../assets/undo.png";
import verify from "../assets/verify.png";
import padlock from "../assets/padlock (1).png";
import chevron from "../assets/chevron.png";
import rightArrow from "../assets/right-arrow.png";
import { useAppStore } from "../context/AppContext";
import {
  buildImageUrl,
  formatCurrency,
  formatDate,
  getProductById,
  getProductReviews,
  getProducts,
  getStoredReferralAttribution,
  analyticsItem,
  productPath,
  pushDataLayer,
  SITE_BASE_URL,
} from "../lib/api";
import { ProductDetailSkeleton } from "../components/Skeleton";

function formatDimensionValue(dimensions) {
  if (!dimensions || typeof dimensions !== "object") return "";

  const unit = dimensions.unit || "cm";
  const parts = [
    dimensions.length ? `L ${dimensions.length}${unit}` : "",
    dimensions.breadth || dimensions.width ? `B ${dimensions.breadth || dimensions.width}${unit}` : "",
    dimensions.height ? `H ${dimensions.height}${unit}` : "",
  ].filter(Boolean);

  return parts.join(" x ");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSpecificationRows(product, selectedVariant) {
  const rows = [];
  const hiddenLabels = new Set([
    "inventory tracker",
    "inventory policy",
    "fulfillment service",
    "requires shipping",
    "taxable",
    "gift card",
  ]);
  const addRow = (label, value) => {
    if (value === null || value === undefined || value === "") return;
    if (hiddenLabels.has(String(label).trim().toLowerCase())) return;
    rows.push([label, String(value)]);
  };
  const dimensions = selectedVariant?.dimensions || product?.dimensions;
  const specifications = {
    ...(product?.specifications && typeof product.specifications === "object" ? product.specifications : {}),
    ...(selectedVariant?.specifications && typeof selectedVariant.specifications === "object" ? selectedVariant.specifications : {}),
  };

  addRow("SKU", selectedVariant?.sku || product?.sku);
  addRow("Barcode", selectedVariant?.barcode || product?.barcode);
  addRow("Weight", selectedVariant?.weight || product?.weight ? `${selectedVariant?.weight || product?.weight} ${selectedVariant?.weightUnit || product?.weightUnit || "g"}` : "");
  addRow("Dimensions", formatDimensionValue(dimensions));

  Object.entries(specifications).forEach(([label, value]) => addRow(label, value));

  return rows;
}

function ConnectedProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToCart, currentUser, isInWishlist, toggleWishlist } = useAppStore();
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [mainImage, setMainImage] = useState("");
  const [qty, setQty] = useState(1);
  const [activeTab, setActiveTab] = useState("Description");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [zoomedImage, setZoomedImage] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [reviewData, setReviewData] = useState({
    averageRating: 0,
    reviewCount: 0,
    reviews: [],
  });

  useEffect(() => {
    let ignore = false;

    const loadProduct = async () => {
      try {
        setLoading(true);
        const [productResponse, productList] = await Promise.all([
          getProductById(id),
          getProducts(),
        ]);

        if (!ignore) {
          setProduct(productResponse);
          setMainImage(productResponse.imageUrl || productResponse.images[0] || "");
          setRelatedProducts(
            productList
              .filter((item) => item.id !== productResponse.id)
              .filter(
                (item) =>
                  item.categoryId === productResponse.categoryId || item.id !== productResponse.id
              )
              .slice(0, 4)
          );
          setError("");
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || "Unable to load this product.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadProduct();

    return () => {
      ignore = true;
    };
  }, [id]);

  useEffect(() => {
    let ignore = false;

    getProductReviews(id)
      .then((payload) => {
        if (!ignore) {
          setReviewData(payload);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [id]);

  const activeVariants = useMemo(
    () =>
      (product?.variants || []).filter(
        (variant) => variant.status === "Active" && variant.visibility !== "Hidden"
      ),
    [product]
  );
  const selectedVariant = useMemo(() => {
    if (!activeVariants.length) return null;

    return (
      activeVariants.find((variant) => Number(variant.id) === Number(selectedVariantId)) ||
      activeVariants.find((variant) => variant.isDefault) ||
      activeVariants[0]
    );
  }, [activeVariants, selectedVariantId]);
  const hasVariants = Boolean(product?.hasVariants && activeVariants.length);
  const currentStock = hasVariants
    ? Number(selectedVariant?.stock || 0)
    : Number(product?.stock ?? product?.stock_quantity ?? 0);
  const isOutOfStock = Boolean(product && currentStock <= 0);
  const hasInsufficientStock = Boolean(product && currentStock > 0 && qty > currentStock);
  const stockMessage = isOutOfStock
    ? "Product is out of stock."
    : hasInsufficientStock
    ? `Only ${currentStock} unit(s) available.`
    : "";
  const currentOptionSelection = useMemo(() => {
    return (selectedVariant?.options || []).reduce((selection, option) => {
      selection[option.optionName || option.name] = option.value;
      return selection;
    }, {});
  }, [selectedVariant]);
  const thumbnails = [
    ...(product?.images?.length ? product.images : [product?.imageUrl].filter(Boolean)),
    ...activeVariants.map((variant) => variant.image).filter(Boolean),
  ].filter((image, index, list) => image && list.indexOf(image) === index);
  const imageAltText = (image) =>
    product?.imagesDetailed?.find((item) => item.url === image || buildImageUrl(item.url) === buildImageUrl(image))?.altText ||
    product?.name ||
    "Golden Creation product image";
  const wishlistActive = product ? isInWishlist(product.id) : false;
  const realReviewCount = Number(reviewData.reviewCount || product?.reviewCount || 0);
  const realAverageRating =
    realReviewCount > 0
      ? Number(reviewData.averageRating || product?.averageRating || 0)
      : 0;
  const specificationRows = useMemo(
    () => buildSpecificationRows(product, selectedVariant),
    [product, selectedVariant]
  );
  const productStructuredData = useMemo(() => {
    if (!product) return null;

    const price = Number(selectedVariant?.price ?? product.price ?? 0) || 0;
    const productUrl = `${SITE_BASE_URL}${productPath(product)}${
      selectedVariant?.id ? `?variant=${encodeURIComponent(selectedVariant.id)}` : ""
    }`;
    const images = thumbnails.length
      ? thumbnails.map((image) => buildImageUrl(image))
      : [buildImageUrl(product.imageUrl || product.image || "")];
    const schema = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      image: images,
      description: stripHtml(product.description || product.name),
      sku: selectedVariant?.sku || product.sku || `PRD-${product.id}`,
      category: product.categoryName || undefined,
      brand: product.brandName
        ? {
            "@type": "Brand",
            name: product.brandName,
          }
        : undefined,
      offers: {
        "@type": "Offer",
        url: productUrl,
        priceCurrency: "INR",
        price: price.toFixed(2),
        availability:
          currentStock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
      },
    };

    if (realReviewCount > 0 && realAverageRating > 0) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: Number(realAverageRating.toFixed(1)),
        reviewCount: realReviewCount,
      };
    }

    return schema;
  }, [currentStock, product, realAverageRating, realReviewCount, selectedVariant, thumbnails]);

  useEffect(() => {
    if (!product) return;
    pushDataLayer("view_item", {
      ecommerce: {
        currency: "INR",
        value: Number(selectedVariant?.price ?? product.price ?? 0) || 0,
        items: [analyticsItem(product, 1)],
      },
    });
  }, [product, selectedVariant?.id, selectedVariant?.price]);

  useEffect(() => {
    if (!product) return;

    const requestedVariantId = Number(searchParams.get("variant")) || null;
    const nextVariant =
      activeVariants.find((variant) => Number(variant.id) === requestedVariantId) ||
      activeVariants.find((variant) => variant.isDefault) ||
      activeVariants[0] ||
      null;

    setSelectedVariantId(nextVariant?.id || null);
  }, [product, activeVariants, searchParams]);

  useEffect(() => {
    if (selectedVariant?.image) {
      setMainImage(selectedVariant.image);
    }
  }, [selectedVariant?.id, selectedVariant?.image]);

  useEffect(() => {
    if (currentStock > 0 && qty > currentStock) {
      setQty(currentStock);
    }
  }, [currentStock, qty]);

  const selectVariant = (variant) => {
    if (!variant) return;

    setSelectedVariantId(variant.id);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("variant", variant.id);
    setSearchParams(nextParams, { replace: true });
  };

  const selectVariantOption = (optionName, value) => {
    const nextSelection = {
      ...currentOptionSelection,
      [optionName]: value,
    };
    const exactMatch = activeVariants.find((variant) =>
      (variant.options || []).every((option) => {
        const key = option.optionName || option.name;
        return nextSelection[key] ? nextSelection[key] === option.value : true;
      })
    );
    const fallbackMatch = activeVariants.find((variant) =>
      (variant.options || []).some(
        (option) => (option.optionName || option.name) === optionName && option.value === value
      )
    );

    selectVariant(exactMatch || fallbackMatch);
  };

  const optionValueDisabled = (optionName, value) => {
    return !activeVariants.some((variant) => {
      const options = variant.options || [];
      const hasTarget = options.some(
        (option) => (option.optionName || option.name) === optionName && option.value === value
      );

      if (!hasTarget || Number(variant.stock || 0) <= 0) return false;

      return Object.entries(currentOptionSelection).every(([name, selectedValue]) => {
        if (name === optionName) return true;
        return options.some(
          (option) => (option.optionName || option.name) === name && option.value === selectedValue
        );
      });
    });
  };

  const productForCart = () => ({
    ...product,
    selectedVariant,
    variantId: selectedVariant?.id || null,
    variantSku: selectedVariant?.sku || "",
    variantTitle: selectedVariant?.optionSummary || "",
    variantOptions: selectedVariant?.options || [],
    price: selectedVariant?.price ?? product.price,
    imageUrl: selectedVariant?.image || product.imageUrl,
    stock: currentStock,
  });

  const handleAddToCart = () => {
    if (!product) {
      return;
    }

    if (!currentUser) {
      navigate("/login", { state: { from: `/product/${id}` } });
      return;
    }

    if (isOutOfStock || hasInsufficientStock) {
      setNotice(stockMessage);
      return;
    }

    if (!addToCart(productForCart(), qty)) {
      setNotice("Product is out of stock.");
      return;
    }
    setNotice(`${qty} item${qty === 1 ? "" : "s"} added to cart.`);
  };

  const handleBuyNow = () => {
    if (!product) {
      return;
    }

    if (!currentUser) {
      navigate("/login", { state: { from: `/product/${id}` } });
      return;
    }

    if (isOutOfStock || hasInsufficientStock) {
      setNotice(stockMessage);
      return;
    }

    if (!addToCart(productForCart(), qty)) {
      setNotice("Product is out of stock.");
      return;
    }
    navigate("/checkout");
  };

  const handleWishlist = () => {
    if (!product) {
      return;
    }

    if (!currentUser) {
      navigate("/login", { state: { from: `/product/${id}` } });
      return;
    }

    const added = toggleWishlist(product);
    setNotice(added ? "Added to wishlist." : "Removed from wishlist.");
  };

  const handleShare = async () => {
    const attribution = getStoredReferralAttribution();
    const url = new URL(product ? `${window.location.origin}${productPath(product)}` : window.location.href);
    if (attribution?.code) {
      url.searchParams.set(attribution.ownerType === "affiliate" ? "aff" : "ref", attribution.code);
    }
    const shareData = {
      title: product?.name || "Golden Creation product",
      text: product?.name ? `View ${product.name} on Golden Creation` : "View this product",
      url: url.toString(),
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (shareError) {
        if (shareError?.name === "AbortError") return;
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
      } else {
        const input = document.createElement("textarea");
        input.value = url.toString();
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      setNotice("Product link copied to clipboard.");
    } catch {
      setNotice("Unable to share this product right now.");
    }
  };

  useEffect(() => {
    if (!zoomedImage) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setZoomedImage("");
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [zoomedImage]);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      {productStructuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productStructuredData) }}
        />
      )}
      <div className="mx-auto max-w-7xl px-4 py-4 pb-28 sm:px-6 md:pb-4 lg:px-10">
        <div className="flex items-center gap-2 px-2 pt-4 text-sm text-gray-500">
          <span onClick={() => navigate("/")} className="cursor-pointer hover:text-black">
            Home
          </span>
          <img src={chevron} className="h-3 w-3 opacity-60" />
          <span
            onClick={() => navigate("/writing-essentials")}
            className="cursor-pointer hover:text-black"
          >
            Writing Essentials
          </span>
          <img src={chevron} className="h-3 w-3 opacity-60" />
          <span className="font-medium text-black">Product</span>
        </div>

        {loading ? (
          <div className="mt-8" aria-busy="true">
            <ProductDetailSkeleton />
          </div>
        ) : error ? (
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-[#E8DDBF] bg-[#FFF9C9] px-5 py-8 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8A541E]">
              Product unavailable
            </p>
            <h1 className="mt-3 text-2xl font-bold text-[#242414]">
              We could not find this product
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#5F5A44]">
              {error}. The product may have moved, been unpublished, or the link may be outdated.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => navigate("/writing-essentials")}
                className="mobile-touch-target rounded-full bg-[#C2863F] px-5 py-3 text-sm font-semibold text-white"
              >
                Browse All Products
              </button>
              <button
                type="button"
                onClick={() => navigate("/contact")}
                className="mobile-touch-target rounded-full border border-[#C2863F] bg-white px-5 py-3 text-sm font-semibold text-[#8A541E]"
              >
                Contact Support
              </button>
            </div>
          </div>
        ) : product ? (
          <>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-4">
                <div className="no-scrollbar flex shrink-0 gap-3 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible sm:pb-0">
                  {thumbnails.map((image) => (
                    <button
                      key={image}
                      type="button"
                      onMouseEnter={() => setMainImage(image)}
                      onClick={() => setMainImage(image)}
                      className={`h-16 w-16 shrink-0 overflow-hidden rounded border ${
                        mainImage === image ? "border-black shadow-sm" : "border-gray-200"
                      }`}
                    >
                      <img src={image} className="h-full w-full object-contain p-1" alt={imageAltText(image)} />
                    </button>
                  ))}
                </div>
                <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white">
                  <span className="absolute left-4 top-4 rounded-sm bg-[#C2863B] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
                    Live Product
                  </span>
                  {mainImage ? (
                    <button
                      type="button"
                      onClick={() => setZoomedImage(mainImage)}
                      className="flex h-full w-full cursor-zoom-in items-center justify-center"
                      aria-label={`Zoom ${product.name} image`}
                    >
                      <img
                        src={mainImage}
                        className="max-h-[450px] w-full object-contain p-6"
                        alt={imageAltText(mainImage)}
                      />
                    </button>
                  ) : (
                    <span className="py-16 text-sm text-gray-400">No image available</span>
                  )}
                  <div className="absolute right-4 top-4 flex flex-col gap-2">
                    {mainImage && (
                      <button
                        type="button"
                        onClick={() => setZoomedImage(mainImage)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm"
                        aria-label="Zoom product image"
                        title="Zoom image"
                      >
                        <img src={zoomIcon} className="h-4 w-4" alt="" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleWishlist}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-sm ${
                        wishlistActive
                          ? "border-[#C2863F] bg-[#FFF4CC]"
                          : "border-gray-100 bg-white"
                      }`}
                    >
                      <img
                        src={heart}
                        className={`h-4 w-4 ${wishlistActive ? "" : "opacity-70"}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={handleShare}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm"
                      aria-label="Share product"
                      title="Share product"
                    >
                      <img src={share} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                {notice && (
                  <div className="mb-4 rounded-lg border border-[#C2863F] bg-[#FFF4CC] px-4 py-3 text-sm text-[#7a4d18]">
                    {notice}
                  </div>
                )}
                {realReviewCount > 0 ? (
                  <div className="mb-2 flex items-center gap-1.5">
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <img
                          key={index}
                          src={star}
                          className={`h-3.5 w-3.5 ${
                            index < Math.round(realAverageRating) ? "opacity-100" : "opacity-20"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-medium text-gray-500">
                      {realAverageRating.toFixed(1)} ({realReviewCount} review
                      {realReviewCount === 1 ? "" : "s"})
                    </span>
                  </div>
                ) : null}
                <p className="text-xs uppercase tracking-wide text-[#C2863F]">
                  {product.categoryName}
                </p>
                {(product.brandName || product.brand) && (
                  <button
                    type="button"
                    onClick={() => product.brandSlug && navigate(`/brand/${product.brandSlug}`)}
                    className="mb-3 mt-2 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-xs font-semibold text-[#8A541E] shadow-sm"
                  >
                    {product.brandLogo ? (
                      <img src={product.brandLogo} alt={product.brandName || product.brand} className="h-7 w-7 object-contain" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded bg-[#FBF8F2]">
                        {(product.brandName || product.brand).charAt(0)}
                      </span>
                    )}
                    <span>{product.brandName || product.brand}</span>
                  </button>
                )}
                <h1 className="mb-4 text-2xl font-bold leading-[1.2] text-gray-900 md:text-3xl">
                  {product.name}
                </h1>
                <div className="mb-6">
                  <PriceOffer
                    className="text-3xl"
                    price={selectedVariant?.price ?? product.price}
                    comparePrice={selectedVariant?.comparePrice || product.comparePrice}
                    mrp={product.mrp}
                    percent={product.discountPercent}
                  />
                  <p className="mt-1 text-xs text-gray-500">Product discount is separate from a checkout coupon.</p>
                  <PaymentEligibility items={[{ productId: product.id, variantId: selectedVariant?.id || 0, quantity: 1 }]} />
                </div>
                {hasVariants && (
                  <div className="mb-6 space-y-5 rounded-lg border border-gray-100 bg-[#FBF8F2] p-4">
                    {(product.variantOptions || []).map((option) => (
                      <div key={option.id || option.name}>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                            {option.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {currentOptionSelection[option.name] || "Select"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(option.values || []).map((value) => {
                            const active = currentOptionSelection[option.name] === value.value;
                            const disabled = optionValueDisabled(option.name, value.value);

                            return (
                              <button
                                key={value.id || value.value}
                                type="button"
                                disabled={disabled}
                                onClick={() => selectVariantOption(option.name, value.value)}
                                className={`rounded-md border px-3 py-2 text-sm transition ${
                                  active
                                    ? "border-[#C2863F] bg-[#C2863F] text-white"
                                    : "border-gray-200 bg-white text-gray-700"
                                } ${disabled ? "cursor-not-allowed opacity-40" : "hover:border-[#C2863F]"}`}
                              >
                                {value.value}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                      {selectedVariant?.sku && <span>SKU: {selectedVariant.sku}</span>}
                      <span>
                        {currentStock > 0
                          ? `${currentStock} in stock`
                          : "Out of stock"}
                      </span>
                    </div>
                  </div>
                )}
                {!hasVariants && (
                  <div className="mb-6 rounded-lg border border-gray-100 bg-[#FBF8F2] px-4 py-3 text-sm text-gray-700">
                    {currentStock > 0 ? `${currentStock} in stock` : "Out of stock"}
                  </div>
                )}
                <div className="mb-7 flex items-center gap-6">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                    Quantity
                  </span>
                  <div className="flex items-center overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm">
                    <button
                      onClick={() => setQty((previous) => Math.max(1, previous - 1))}
                      className="flex h-10 w-10 items-center justify-center border-r hover:bg-gray-50"
                    >
                      <img src={minusIcon} className="h-2.5 w-2.5" />
                    </button>
                    <span className="w-10 text-center text-sm font-bold text-gray-800">{qty}</span>
                    <button
                      onClick={() =>
                        setQty((previous) =>
                          currentStock > 0 ? Math.min(currentStock, previous + 1) : previous
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center border-l hover:bg-gray-50"
                    >
                      <img src={addIcon} className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleWishlist}
                    className={`w-full rounded-md border py-3 text-sm font-semibold ${
                      wishlistActive
                        ? "border-[#404C31] bg-[#404C31] text-white"
                        : "border-[#404C31] bg-white text-[#404C31]"
                    }`}
                  >
                    {wishlistActive ? "Saved to Wishlist" : "Save to Wishlist"}
                  </button>
                  <button
                    onClick={handleAddToCart}
                    className={`w-full rounded-md py-3 text-sm font-semibold text-white shadow ${
                      isOutOfStock || hasInsufficientStock
                        ? "bg-gray-400"
                        : "bg-[#C2863F]"
                    }`}
                  >
                    Add to Cart
                  </button>
                  <button
                    onClick={handleBuyNow}
                    className={`w-full rounded-md border-2 bg-white py-3 text-sm font-semibold ${
                      isOutOfStock || hasInsufficientStock
                        ? "border-gray-300 text-gray-400"
                        : "border-[#C2863F] text-[#C2863F]"
                    }`}
                  >
                    Buy It Now
                  </button>
                </div>
                <div className="fixed inset-x-0 bottom-0 z-[900] border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
                  {stockMessage && (
                    <p className="mb-2 text-center text-xs font-semibold text-red-600">{stockMessage}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className={`mobile-touch-target rounded-full text-sm font-semibold text-white ${
                        isOutOfStock || hasInsufficientStock ? "bg-gray-400" : "bg-[#C2863F]"
                      }`}
                    >
                      Add to Cart
                    </button>
                    <button
                      type="button"
                      onClick={handleBuyNow}
                      className={`mobile-touch-target rounded-full border text-sm font-semibold ${
                        isOutOfStock || hasInsufficientStock
                          ? "border-gray-300 text-gray-400"
                          : "border-[#C2863F] text-[#8A541E]"
                      }`}
                    >
                      Buy Now
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-gray-100 pt-4">
                  <Benefit icon={car} title="Fast Express Delivery" text="Ships in 24 hours" />
                  <Benefit icon={undo} title="10-Day Easy Returns" text="Hassle-free process" />
                  <Benefit icon={verify} title="Genuine Product" text="Brand-backed quality" />
                  <Benefit icon={padlock} title="Secure Checkout" text="256-bit SSL Encryption" />
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex gap-10 overflow-x-auto border-b border-gray-100">
                {["Description", "Specifications", "Reviews"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`border-b-2 pb-4 text-xs font-bold uppercase tracking-widest ${
                      activeTab === tab
                        ? "border-[#C2863F] text-gray-900"
                        : "border-transparent text-gray-400"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="py-6">
                {activeTab === "Description" ? (
                  <div className="max-w-4xl">
                    <h2 className="mb-2 text-2xl font-bold text-gray-900">
                      Product Overview
                    </h2>
                    <p className="text-sm leading-7 text-gray-500 md:text-base">
                      {product.description}
                    </p>
                  </div>
                ) : activeTab === "Specifications" ? (
                  specificationRows.length ? (
                    <div className="max-w-3xl overflow-hidden rounded-lg border border-gray-100">
                      {specificationRows.map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[160px_1fr] border-b border-gray-100 last:border-b-0">
                          <div className="bg-[#FBF8F2] px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">
                            {label}
                          </div>
                          <div className="px-4 py-3 text-sm text-gray-700">{value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">
                      Specifications will be available soon.
                    </div>
                  )
                ) : activeTab === "Reviews" ? (
                  <div className="space-y-3">
                    {reviewData.reviews.length ? (
                      reviewData.reviews.map((review) => (
                        <div key={review.id} className="rounded-lg border p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-semibold">{review.customer_name || "Verified Buyer"}</p>
                            <p className="text-xs text-gray-500">{formatDate(review.created_at)}</p>
                          </div>
                          <div className="mb-2 flex">
                            {Array.from({ length: 5 }).map((_, index) => (
                              <img
                                key={index}
                                src={star}
                                className={`h-4 w-4 ${index < review.rating ? "opacity-100" : "opacity-20"}`}
                              />
                            ))}
                          </div>
                          <p className="text-sm text-gray-600">{review.review_text || "Rated this product."}</p>
                          {review.review_images?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {review.review_images.slice(0, 4).map((image, index) => (
                                <img
                                  key={`${review.id}-${index}`}
                                  src={image}
                                  className="h-20 w-20 rounded-lg border object-cover"
                                  alt="Customer review"
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">
                        No reviews yet.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm italic text-gray-400">
                    Detailed {activeTab} content can be expanded next.
                  </div>
                )}
              </div>
            </div>

            <section
              className="mt-10 py-10"
              style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FFF49C 100%)" }}
            >
              <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-3xl font-black text-gray-900">
                    Complete Your Collection
                  </h2>
                  <p className="text-sm font-medium text-gray-500">
                    More stationery picks selected for you
                  </p>
                </div>
                <button
                  onClick={() => navigate("/writing-essentials")}
                  className="group flex items-center gap-2 border-b border-black pb-1 text-xs font-bold uppercase tracking-widest text-gray-700 hover:border-[#C2863F] hover:text-[#C2863F]"
                >
                  View All Products
                  <img src={rightArrow} className="w-4 transition group-hover:translate-x-1" />
                </button>
              </div>
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                {relatedProducts.map((relatedProduct) => (
                  <button
                    key={relatedProduct.id}
                    type="button"
                    onClick={() => navigate(productPath(relatedProduct))}
                    className="rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="mb-6 flex h-48 items-center justify-center rounded-xl bg-[#F8FAFC] p-4">
                      {relatedProduct.imageUrl ? (
                        <img
                          src={relatedProduct.imageUrl}
                          alt={relatedProduct.name || "Golden Creation product"}
                          className="h-40 w-auto object-contain"
                        />
                      ) : (
                        <span className="text-sm text-gray-400">No image</span>
                      )}
                    </div>
                    <h4 className="mb-2 text-sm font-bold text-gray-900">
                      {relatedProduct.name}
                    </h4>
                    <p className="mb-3 text-base font-black text-gray-900">
                      {formatCurrency(relatedProduct.price)}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85 p-3 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Zoomed product image"
          onClick={() => setZoomedImage("")}
        >
          <button
            type="button"
            onClick={() => setZoomedImage("")}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl font-medium text-black shadow-lg"
            aria-label="Close image zoom"
          >
            &times;
          </button>
          <img
            src={zoomedImage}
            alt={imageAltText(zoomedImage)}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-1.5rem)] object-contain sm:max-h-[calc(100vh-4rem)] sm:max-w-[calc(100vw-4rem)]"
          />
        </div>
      )}
      <Footer />
    </div>
  );
}

function Benefit({ icon, title, text }) {
  return (
    <div className="flex items-center gap-3">
      <img src={icon} className="h-5 w-5 opacity-80" />
      <div>
        <p className="mb-1 text-[11px] font-bold uppercase leading-none text-gray-800">
          {title}
        </p>
        <p className="text-[10px] text-gray-400">{text}</p>
      </div>
    </div>
  );
}

export default ConnectedProductDetail;
