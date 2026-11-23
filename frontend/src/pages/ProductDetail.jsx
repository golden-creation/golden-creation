import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

import heart from "../assets/heart.png";
import share from "../assets/share.png";
import star from "../assets/star.png";

import addIcon from "../assets/add.png";
import minusIcon from "../assets/minus.png";

import car from "../assets/car.png";
import undo from "../assets/undo.png";
import verify from "../assets/verify.png";
import padlock from "../assets/padlock (1).png";

import chevron from "../assets/chevron.png";

import { useAppStore } from "../context/AppContext";

import {
  formatCurrency,
  getProductById,
  getProductReviews,
} from "../lib/api";

const ProductDetail = () => {
  const { id } = useParams();

  const navigate = useNavigate();

  const {
    addToCart,
    isInWishlist,
    toggleWishlist,
  } = useAppStore();

  const [product, setProduct] = useState(null);

  const [mainImg, setMainImg] =
    useState("");

  const [qty, setQty] = useState(1);

  const [activeTab, setActiveTab] =
    useState("Description");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  /* REVIEW STATES */

  const [rating, setRating] =
    useState(5);

  const [reviewData, setReviewData] =
    useState({
      name: "",
      review: "",
    });

  const [reviews, setReviews] =
    useState([]);
  const [realAverageRating, setRealAverageRating] =
    useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadProduct() {
      try {
        setLoading(true);

        const apiProduct =
          await getProductById(id);

        if (!isMounted) return;

        setProduct(apiProduct);

        setMainImg(
          apiProduct.imageUrl ||
            apiProduct.images?.[0] ||
            ""
        );

        setError("");
      } catch (err) {
        if (isMounted) {
          setError(
            err.message ||
              "Unable to load product"
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadProduct();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    let isMounted = true;

    getProductReviews(id)
      .then((payload) => {
        if (!isMounted) return;

        setReviews(
          payload.reviews || []
        );
        setRealAverageRating(
          Number(payload.averageRating || 0)
        );
      })
      .catch(() => {
        if (isMounted) {
          setReviews([]);
          setRealAverageRating(0);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  const thumbnails = useMemo(() => {
    if (!product) return [];

    if (product.images?.length) {
      return product.images;
    }

    return product.imageUrl
      ? [product.imageUrl]
      : [];
  }, [product]);

  const wishlistActive = product
    ? isInWishlist(product.id)
    : false;

  const tabs = [
    "Description",
    "Specifications",
    `Ratings & Reviews (${reviews.length})`,
  ];

  const handleAddToCart = () => {
    if (!product) return;

    addToCart(product, qty);

    setNotice(
      `${qty} item${
        qty > 1 ? "s" : ""
      } added to cart`
    );

    setTimeout(() => {
      setNotice("");
    }, 3000);
  };

  const handleBuyNow = () => {
    if (!product) return;

    addToCart(product, qty);

    navigate("/checkout");
  };

  const handleWishlist = () => {
    if (!product) return;

    const added =
      toggleWishlist(product);

    setNotice(
      added
        ? "Added to wishlist"
        : "Removed from wishlist"
    );

    setTimeout(() => {
      setNotice("");
    }, 3000);
  };

  const submitReview = () => {
    if (
      !reviewData.name ||
      !reviewData.review
    ) {
      alert("Please fill all fields");
      return;
    }

    const newReview = {
      name: reviewData.name,
      rating,
      review: reviewData.review,
      date: "Just now",
    };

    setReviews((prev) => [
      newReview,
      ...prev,
    ]);

    setReviewData({
      name: "",
      review: "",
    });

    setRating(5);

    alert(
      "Review submitted successfully"
    );
  };

  if (loading) {
    return (
      <>
        <Navbar />

        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-gray-500">
            Loading product...
          </p>
        </div>

        <Footer />
      </>
    );
  }

  if (error || !product) {
    return (
      <>
        <Navbar />

        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-red-600">
            {error ||
              "Product not found"}
          </div>
        </div>

        <Footer />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        {/* BREADCRUMB */}

        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <span
            onClick={() =>
              navigate("/")
            }
            className="cursor-pointer hover:text-black"
          >
            Home
          </span>

          <img
            src={chevron}
            className="h-3 w-3"
          />

          <span
            onClick={() =>
              navigate(
                "/writing-essentials"
              )
            }
            className="cursor-pointer hover:text-black"
          >
            Products
          </span>

          <img
            src={chevron}
            className="h-3 w-3"
          />

          <span className="font-medium text-black">
            {product.name}
          </span>
        </div>

        {/* NOTICE */}

        {notice && (
          <div className="mb-5 rounded-xl border border-[#C2863F] bg-[#FFF4CC] px-4 py-3 text-sm text-[#7a4d18]">
            {notice}
          </div>
        )}

        {/* PRODUCT SECTION */}

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          {/* IMAGES */}

          <div className="flex gap-4">
            <div className="flex flex-col gap-3">
              {thumbnails.map(
                (img, index) => (
                  <button
                    key={index}
                    onClick={() =>
                      setMainImg(img)
                    }
                    className={`h-16 w-16 overflow-hidden rounded-xl border ${
                      mainImg === img
                        ? "border-[#C2863F]"
                        : "border-gray-200"
                    }`}
                  >
                    <img
                      src={img}
                      className="h-full w-full object-cover"
                    />
                  </button>
                )
              )}
            </div>

            <div className="relative flex-1 overflow-hidden rounded-2xl border border-gray-100 bg-[#FBF8F2]">
              <img
                src={mainImg}
                alt={product.name}
                className="h-full w-full object-contain p-8"
              />

              <div className="absolute right-4 top-4 flex flex-col gap-2">
                <button
                  onClick={
                    handleWishlist
                  }
                  className={`flex h-10 w-10 items-center justify-center rounded-full border bg-white shadow-sm ${
                    wishlistActive
                      ? "border-[#C2863F]"
                      : "border-gray-200"
                  }`}
                >
                  <img
                    src={heart}
                    className="h-5 w-5"
                  />
                </button>

                <button className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm">
                  <img
                    src={share}
                    className="h-5 w-5"
                  />
                </button>
              </div>
            </div>
          </div>

          {/* DETAILS */}

          <div>
            {reviews.length > 0 ? (
              <div className="mb-3 flex items-center gap-2">
                <div className="flex">
                  {Array.from({
                    length: 5,
                  }).map((_, i) => (
                    <img
                      key={i}
                      src={star}
                      className={`h-4 w-4 ${
                        i < Math.round(realAverageRating)
                          ? "opacity-100"
                          : "opacity-20"
                      }`}
                    />
                  ))}
                </div>

                <span className="text-sm text-gray-500">
                  {realAverageRating.toFixed(1)} ({reviews.length} Review
                  {reviews.length === 1 ? "" : "s"})
                </span>
              </div>
            ) : null}

            <h1 className="text-3xl font-bold text-gray-900">
              {product.name}
            </h1>

            <p className="mt-4 text-sm leading-7 text-gray-500">
              {product.description}
            </p>

            <div className="mt-6 flex items-center gap-4">
              <span className="text-3xl font-bold text-[#242414]">
                {formatCurrency(
                  product.price
                )}
              </span>
            </div>

            {/* QUANTITY */}

            <div className="mt-8 flex items-center gap-4">
              <span className="text-sm font-medium">
                Quantity
              </span>

              <div className="flex items-center overflow-hidden rounded-lg border">
                <button
                  onClick={() =>
                    setQty((prev) =>
                      Math.max(
                        1,
                        prev - 1
                      )
                    )
                  }
                  className="flex h-10 w-10 items-center justify-center border-r"
                >
                  <img
                    src={minusIcon}
                    className="h-3 w-3"
                  />
                </button>

                <span className="w-12 text-center font-semibold">
                  {qty}
                </span>

                <button
                  onClick={() =>
                    setQty(
                      (prev) =>
                        prev + 1
                    )
                  }
                  className="flex h-10 w-10 items-center justify-center border-l"
                >
                  <img
                    src={addIcon}
                    className="h-3 w-3"
                  />
                </button>
              </div>
            </div>

            {/* BUTTONS */}

            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={
                  handleAddToCart
                }
                className="rounded-xl bg-[#C2863F] py-3 text-sm font-semibold text-white transition hover:bg-[#a96d29]"
              >
                Add To Cart
              </button>

              <button
                onClick={
                  handleBuyNow
                }
                className="rounded-xl border-2 border-[#C2863F] py-3 text-sm font-semibold text-[#C2863F] transition hover:bg-[#FFF4CC]"
              >
                Buy Now
              </button>
            </div>

            {/* BENEFITS */}

            <div className="mt-8 grid grid-cols-2 gap-5 border-t pt-6">
              <Benefit
                icon={car}
                title="Free Shipping"
                text="On all orders"
              />

              <Benefit
                icon={undo}
                title="Easy Returns"
                text="10 day return"
              />

              <Benefit
                icon={verify}
                title="Authentic"
                text="100% genuine"
              />

              <Benefit
                icon={padlock}
                title="Secure Payment"
                text="SSL protected"
              />
            </div>
          </div>
        </div>

        {/* TABS */}

        <div className="mt-12">
          <div className="flex gap-8 overflow-x-auto border-b">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() =>
                  setActiveTab(tab)
                }
                className={`border-b-2 pb-4 text-sm font-medium transition ${
                  activeTab === tab
                    ? "border-[#C2863F] text-[#C2863F]"
                    : "border-transparent text-gray-500"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* TAB CONTENT */}

          <div className="py-8">
            {activeTab ===
            "Description" ? (
              <div className="max-w-4xl">
                <h2 className="mb-4 text-2xl font-bold">
                  Product Description
                </h2>

                <p className="leading-8 text-gray-600">
                  {product.description}
                </p>
              </div>
            ) : activeTab.includes(
                "Ratings & Reviews"
              ) ? (
              <div className="grid gap-10 lg:grid-cols-[340px_1fr]">
                {/* LEFT SUMMARY */}

                <div className="rounded-3xl border border-gray-100 bg-[#FBF8F2] p-6">
                  <h3 className="text-2xl font-bold text-[#242414]">
                    Customer Ratings
                  </h3>

                  <div className="mt-6 flex items-end gap-3">
                    <h2 className="text-5xl font-bold text-[#242414]">
                      4.8
                    </h2>

                    <div className="pb-1">
                      <div className="flex">
                        {Array.from({
                          length: 5,
                        }).map((_, i) => (
                          <img
                            key={i}
                            src={star}
                            className="h-4 w-4"
                          />
                        ))}
                      </div>

                      <p className="mt-1 text-sm text-gray-500">
                        Based on{" "}
                        {reviews.length} reviews
                      </p>
                    </div>
                  </div>

                  {/* RATING BREAKDOWN */}

                  <div className="mt-8 space-y-3">
                    {[5, 4, 3, 2, 1].map(
                      (item) => (
                        <div
                          key={item}
                          className="flex items-center gap-3"
                        >
                          <span className="w-3 text-sm font-medium">
                            {item}
                          </span>

                          <img
                            src={star}
                            className="h-4 w-4"
                          />

                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={`h-full rounded-full ${
                                item === 5
                                  ? "w-[85%]"
                                  : item === 4
                                  ? "w-[60%]"
                                  : item === 3
                                  ? "w-[25%]"
                                  : item === 2
                                  ? "w-[10%]"
                                  : "w-[5%]"
                              } bg-[#C2863F]`}
                            />
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {/* REVIEW FORM */}

                  <div className="mt-10 border-t pt-8">
                    <h3 className="text-lg font-bold text-[#242414]">
                      Write a Review
                    </h3>

                    <div className="mt-5">
                      <label className="text-sm font-medium text-gray-700">
                        Your Name
                      </label>

                      <input
                        type="text"
                        value={
                          reviewData.name
                        }
                        onChange={(e) =>
                          setReviewData({
                            ...reviewData,
                            name:
                              e.target.value,
                          })
                        }
                        placeholder="Enter your name"
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-[#C2863F]"
                      />
                    </div>

                    <div className="mt-5">
                      <label className="text-sm font-medium text-gray-700">
                        Your Rating
                      </label>

                      <div className="mt-2 flex gap-1">
                        {[1, 2, 3, 4, 5].map(
                          (item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() =>
                                setRating(
                                  item
                                )
                              }
                            >
                              <img
                                src={star}
                                className={`h-7 w-7 transition ${
                                  item <=
                                  rating
                                    ? "opacity-100 scale-100"
                                    : "opacity-20 scale-90"
                                }`}
                              />
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <div className="mt-5">
                      <label className="text-sm font-medium text-gray-700">
                        Your Review
                      </label>

                      <textarea
                        value={
                          reviewData.review
                        }
                        onChange={(e) =>
                          setReviewData({
                            ...reviewData,
                            review:
                              e.target.value,
                          })
                        }
                        placeholder="Share your experience..."
                        className="mt-2 h-32 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-[#C2863F]"
                      />
                    </div>

                    <button
                      onClick={
                        submitReview
                      }
                      className="mt-6 w-full rounded-xl bg-[#C2863F] py-3 text-sm font-semibold text-white transition hover:bg-[#a96d29]"
                    >
                      Submit Review
                    </button>
                  </div>
                </div>

                {/* RIGHT REVIEWS */}

                <div>
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-[#242414]">
                      Ratings & Reviews
                    </h3>

                    <span className="rounded-full bg-[#FFF4CC] px-4 py-2 text-sm font-medium text-[#8A5A22]">
                      {reviews.length} Total
                      Reviews
                    </span>
                  </div>

                  <div className="space-y-5">
                    {reviews.map(
                      (
                        review,
                        index
                      ) => (
                        <div
                          key={index}
                          className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition hover:shadow-md"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF4CC] text-sm font-bold text-[#8A5A22]">
                                  {review.name.charAt(
                                    0
                                  )}
                                </div>

                                <div>
                                  <h4 className="font-semibold text-[#242414]">
                                    {
                                      review.name
                                    }
                                  </h4>

                                  <p className="text-xs text-gray-400">
                                    {
                                      review.date
                                    }
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-1">
                              {Array.from({
                                length:
                                  review.rating,
                              }).map(
                                (
                                  _,
                                  i
                                ) => (
                                  <img
                                    key={
                                      i
                                    }
                                    src={
                                      star
                                    }
                                    className="h-4 w-4"
                                  />
                                )
                              )}
                            </div>
                          </div>

                          <p className="mt-5 text-sm leading-7 text-gray-600">
                            {
                              review.review
                            }
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-400">
                Content for{" "}
                {activeTab} will be
                displayed here.
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

const Benefit = ({
  icon,
  title,
  text,
}) => {
  return (
    <div className="flex items-center gap-3">
      <img
        src={icon}
        className="h-6 w-6"
      />

      <div>
        <p className="text-sm font-semibold">
          {title}
        </p>

        <p className="text-xs text-gray-500">
          {text}
        </p>
      </div>
    </div>
  );
};

export default ProductDetail;
