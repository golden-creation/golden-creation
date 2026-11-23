import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import PriceOffer from "../components/PriceOffer";
import Navbar from "../components/Navbar";
import heroImg from "../assets/a2.webp";
import goldenCreationHeroLogo from "../assets/golden-creation-hero-logo.png";
import rightArrow from "../assets/right-arrow.png";
import chevron from "../assets/chevron.png";
import gift from "../assets/gift.png";
import car from "../assets/car.png";
import verify from "../assets/verify.png";
import bag from "../assets/shopping-bag.png";
import graduate from "../assets/graduate.png";
import briefcase from "../assets/briefcase.png";
import palette from "../assets/color-palette.png";
import music from "../assets/music.png";
import curatedImg from "../assets/curated.webp";
import star from "../assets/star.png";
import {
  getBrands,
  getCategories,
  getCollections,
  getGoogleReviews,
  getProducts,
  productPath,
  subscribeNewsletter,
} from "../lib/api";
import { ProductGridSkeleton, SkeletonBlock } from "../components/Skeleton";

const googleReviewLink =
  "https://www.google.com/maps/search/?api=1&query=G-38%20BAANI%20THE%20ADDRESS%20SHOPING%20ARCADE%20SECTOR%2056%20GOLF%20COURSE%20ROAD%20GURUGRAM%20Haryana%20122011";
const fallbackGoogleReviewData = {
  placeName: "Golden Creation",
  rating: 0,
  reviewCount: 0,
  googleMapsUrl: googleReviewLink,
  reviews: [],
};

function productSearchText(product) {
  return [
    product.name,
    product.categoryName,
    product.category_name,
    product.category,
    product.brandName,
    product.brand_name,
    product.brand,
    Array.isArray(product.tags) ? product.tags.join(" ") : product.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function showcaseProducts(products, terms, fallbackOffset = 0) {
  const matches = products.filter((product) =>
    terms.some((term) => productSearchText(product).includes(term))
  );
  const matchIds = new Set(matches.map((product) => Number(product.id)));
  const fallback = products
    .slice(fallbackOffset)
    .concat(products.slice(0, fallbackOffset))
    .filter((product) => !matchIds.has(Number(product.id)));

  return [...matches, ...fallback].slice(0, 5);
}

function findCollectionSlug(collections, name, fallback) {
  const match = collections.find(
    (collection) =>
      String(collection.name || "").trim().toLowerCase() === name.toLowerCase()
  );

  return match?.slug || fallback;
}

function ConnectedHome() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [brandMessage, setBrandMessage] = useState("");
  const [collections, setCollections] = useState([]);
  const [googleReviews, setGoogleReviews] = useState(fallbackGoogleReviewData);
  const [googleReviewsLoading, setGoogleReviewsLoading] = useState(true);
  const [googleReviewsError, setGoogleReviewsError] = useState("");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const categorySliderRef = useRef(null);
  const brandSliderRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;

    const loadStorefront = async () => {
      try {
        setLoading(true);
        const [categoryResponse, productResponse, brandResponse, collectionResponse] = await Promise.all([
          getCategories(),
          getProducts(),
          getBrands({ sort: "name" }).catch(() => null),
          getCollections({ limit: 100, status: "Active" }).catch(() => []),
        ]);

        if (!ignore) {
          setCategories(categoryResponse);
          setProducts(productResponse);
          setBrands(Array.isArray(brandResponse) ? brandResponse : []);
          setBrandMessage(brandResponse === null ? "Brands could not be loaded." : brandResponse.length ? "" : "No brands available.");
          setCollections(collectionResponse);
          setError("");
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || "Unable to load storefront data.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadStorefront();

    getGoogleReviews()
      .then((payload) => {
        if (!ignore) {
          setGoogleReviews(payload);
          setGoogleReviewsError(
            payload.source === "google_places" ? "" : "Google reviews are temporarily unavailable."
          );
        }
      })
      .catch(() => {
        if (!ignore) {
          setGoogleReviews(fallbackGoogleReviewData);
          setGoogleReviewsError("Google reviews are temporarily unavailable.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setGoogleReviewsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const reviewCount = Math.min(
      googleReviews.reviews.filter((review) => Number(review.rating) === 5).length,
      5
    );

    if (reviewCount <= 1) {
      setReviewIndex(0);
      return undefined;
    }

    const mobileQuery = window.matchMedia("(max-width: 767px)");
    let intervalId;

    const syncCarousel = () => {
      window.clearInterval(intervalId);

      if (mobileQuery.matches) {
        intervalId = window.setInterval(() => {
          setReviewIndex((current) => (current + 1) % reviewCount);
        }, 3000);
      }
    };

    syncCarousel();
    mobileQuery.addEventListener?.("change", syncCarousel);

    return () => {
      window.clearInterval(intervalId);
      mobileQuery.removeEventListener?.("change", syncCarousel);
    };
  }, [googleReviews.reviews]);

  const featuredProducts = products.slice(0, 5);
  const writingProducts = showcaseProducts(products, ["pen", "writing", "pencil"], 5);
  const officeProducts = showcaseProducts(products, ["office", "desk", "stationery"], 10);
  const creativeProducts = showcaseProducts(products, ["art", "craft", "colour", "color"], 15);
  const visibleCategories = categories
    .filter((category) => !category.parent_id)
    .slice(0, 10);
  const visibleBrands = brands.filter((brand) => brand.status !== "Inactive");
  const visibleGoogleReviews = googleReviews.reviews.filter(
    (review) => Number(review.rating) === 5
  );
  const googleRating = Number(googleReviews.rating || 0);
  const hasGoogleRating = googleRating > 0;
  const reviewDestination = googleReviews.googleMapsUrl || googleReviewLink;
  const studentCollectionSlug = findCollectionSlug(collections, "For Students", "for-students");
  const professionalCollectionSlug = findCollectionSlug(
    collections,
    "For Professionals",
    "for-professionals"
  );
  const artistCollectionSlug = findCollectionSlug(collections, "For Artists", "for-artists");

  const scrollCategories = (direction) => {
    const slider = categorySliderRef.current;

    if (!slider) {
      return;
    }

    slider.scrollBy({
      left: direction * Math.min(slider.clientWidth * 0.9, 760),
      behavior: "smooth",
    });
  };

  const scrollBrands = (direction) => {
    const slider = brandSliderRef.current;

    if (!slider) {
      return;
    }

    slider.scrollBy({
      left: direction * Math.min(slider.clientWidth * 0.9, 760),
      behavior: "smooth",
    });
  };

  return (
    <div className="w-full overflow-x-hidden bg-[#FBF8F2]">
      <Navbar />

      <section className="bg-[#93C572] px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto grid max-w-7xl items-center gap-8 md:grid-cols-[1.05fr_0.95fr]">
          <div className="py-2 md:py-4">
            <img
              src={goldenCreationHeroLogo}
              alt="Golden Creation - House of Office Stationery and Gift Items"
              className="w-full max-w-[640px] object-contain"
            />
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#5F5A44] md:mt-5 md:text-base">
              Browse curated writing tools, art supplies, desk essentials, and bundles made for school, work, and creative routines.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row md:mt-7">
              <button
                onClick={() => navigate("/writing-essentials")}
                className="mobile-touch-target flex items-center justify-center gap-2 rounded-full bg-[#C2863F] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#A06422]"
              >
                Shop All Products
                <img src={rightArrow} className="w-4 invert" />
              </button>
              <button
                onClick={() => navigate("/BundleKits")}
                className="mobile-touch-target rounded-full border border-[#C2863F] bg-white px-6 py-3 text-center text-sm font-semibold text-[#8A5A22] transition hover:bg-[#FFF7B8]"
              >
                Explore Bundles
              </button>
            </div>
            <a
              href={reviewDestination}
              target="_blank"
              rel="noreferrer"
              aria-label="View Golden Creation reviews on Google Maps"
              className="mobile-touch-target mt-7 flex w-full max-w-full items-center justify-between gap-2 rounded-full bg-white px-4 py-3 text-[#242414] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:w-fit sm:justify-start sm:gap-3"
            >
              <span className="text-sm font-bold">Google</span>
              {hasGoogleRating ? (
                <>
                  <span className="text-lg font-bold text-[#A06422]">
                    {googleRating.toFixed(1)}
                  </span>
                  <span className="flex gap-0.5" aria-hidden="true">
                    {[...Array(5)].map((_, index) => (
                      <img
                        key={index}
                        src={star}
                        className={`h-4 w-4 ${
                          index < Math.round(googleRating) ? "opacity-100" : "opacity-25"
                        }`}
                        alt=""
                      />
                    ))}
                  </span>
                  <span className="hidden text-xs font-medium text-gray-500 sm:inline">
                    {googleReviews.reviewCount.toLocaleString("en-IN")} Google reviews
                  </span>
                </>
              ) : (
                <span className="text-xs font-medium text-gray-500">
                  {googleReviewsLoading ? "Loading reviews" : "View Google reviews"}
                </span>
              )}
              <img src={rightArrow} alt="" className="h-4 w-4 shrink-0" />
            </a>
          </div>
          <div className="relative">
            <div className="absolute -right-4 -top-4 hidden rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#8A5A22] shadow-lg md:block">
              New collections weekly
            </div>
            <img
              src={heroImg}
              className="h-[250px] w-full rounded-3xl object-cover shadow-2xl sm:h-[380px] md:h-[460px]"
            />
            <div className="absolute bottom-4 left-4 rounded-2xl bg-white/90 px-4 py-3 shadow-lg backdrop-blur">
              <p className="text-xs uppercase tracking-wide text-gray-500">Curated Range</p>
              <p className="font-bold text-[#C2863F]">Office, School & Gifts</p>
            </div>
          </div>
        </div>
      </section>

      <div className="bg-white px-4 py-6 md:px-8">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 md:grid-cols-4">
          <Feature icon={gift} title="Easy Sign In" />
          <Feature icon={car} title="Fast Delivery" />
          <Feature icon={verify} title="Curated Categories" />
          <Feature icon={bag} title="Smooth Checkout" />
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-[#C2863F] bg-[#FFF4CC] px-4 py-3 text-sm text-[#7a4d18] md:mx-10">
          {error}
        </div>
      )}

      <section className="px-4 py-12 md:px-8">
        <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#C2863F]">Browse faster</p>
            <h2 className="mt-1 text-2xl font-bold text-[#242414]">Shop by Category</h2>
            <p className="mt-1 text-sm text-gray-500">
              Curated collections for every kind of writing, planning, and making.
            </p>
          </div>
          <button
            onClick={() => navigate("/writing-essentials")}
            className="flex items-center gap-1 text-sm font-semibold text-[#C2863F]"
          >
            View All Categories
            <img src={chevron} className="w-4" />
          </button>
        </div>

        {loading ? (
          <div className="mt-6 flex gap-4 overflow-hidden">
            {[0, 1, 2].map((item) => (
              <div key={item} className="min-w-[72vw] rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:min-w-[240px]">
                <SkeletonBlock className="aspect-[4/3]" />
                <SkeletonBlock className="mt-3 h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="relative mt-6">
            <div className="mb-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => scrollCategories(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:border-[#C2863F] hover:bg-[#FFF49C]"
                aria-label="Previous categories"
              >
                <img src={chevron} className="h-4 w-4 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => scrollCategories(1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:border-[#C2863F] hover:bg-[#FFF49C]"
                aria-label="Next categories"
              >
                <img src={chevron} className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <div
                ref={categorySliderRef}
                className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3"
              >
                {visibleCategories.map((category) => (
                  <CategoryCard
                    key={category.id}
                    img={category.image}
                    title={category.name}
                    onClick={() =>
                      navigate(category.slug ? `/category/${category.slug}` : `/writing-essentials?category=${category.id}`)
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        </div>
      </section>

      <section
        className="bg-white px-4 py-12 md:px-8"
      >
        <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#C2863F]">Most loved</p>
            <h2 className="mt-1 text-2xl font-bold text-[#242414]">Our Bestsellers</h2>
          </div>
          <button
            onClick={() => navigate("/writing-essentials")}
            className="hidden items-center gap-1 text-sm font-semibold text-[#C2863F] sm:flex"
          >
            Browse all
            <img src={chevron} className="w-4" />
          </button>
        </div>

        {loading ? (
          <ProductGridSkeleton count={5} />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5 md:gap-5">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onClick={() => navigate(productPath(product))}
              />
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-center sm:hidden">
          <button
            onClick={() => navigate("/writing-essentials")}
            className="inline-flex items-center justify-center gap-1 rounded-full border border-[#C2863F] px-5 py-2 text-sm font-semibold text-[#C2863F]"
          >
            Browse all
            <img src={chevron} className="w-4" />
          </button>
        </div>
        </div>
      </section>

      <section className="w-full bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C2863F]">
                Shop by leading brands
              </p>
              <h2 className="mt-2 text-2xl font-bold text-[#242414]">
                Trusted stationery names in one place
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-gray-500">
                Explore writing, office, school, and art essentials from brands customers already know and trust.
              </p>
            </div>
            {visibleBrands.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => scrollBrands(-1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:border-[#C2863F] hover:bg-[#FFF49C]"
                  aria-label="Previous brands"
                >
                  <img src={chevron} className="h-4 w-4 rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollBrands(1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition hover:border-[#C2863F] hover:bg-[#FFF49C]"
                  aria-label="Next brands"
                >
                  <img src={chevron} className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            {visibleBrands.length ? (
              <div
                ref={brandSliderRef}
                className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3"
              >
                {visibleBrands.map((brand) => (
                  <BrandCard
                    key={brand.id || brand.slug || brand.name}
                    brand={brand}
                    onClick={() => navigate(brand.slug ? `/brand/${brand.slug}` : `/writing-essentials?brands=${encodeURIComponent(brand.name)}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-[#FBF8F2] p-8 text-center text-sm text-gray-500">
                {loading ? "Loading brands..." : brandMessage || "No brands available."}
              </div>
            )}
          </div>
        </div>
      </section>

      <ProductShowcaseSection
        eyebrow="Writing essentials"
        title="Pens and pencils for everyday writing"
        products={writingProducts}
        loading={loading}
        onBrowse={() => navigate("/writing-essentials?q=pens")}
        onProduct={(product) => navigate(productPath(product))}
      />

      <section className="px-4 py-14 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 rounded-3xl bg-white p-6 shadow-sm md:flex-row md:p-10">
        <div className="flex-1">
          <span className="rounded-full bg-[#C2863F] px-3 py-1 text-xs font-semibold text-white">
            Curated Bundles
          </span>
          <h2 className="mt-3 text-2xl font-bold text-[#C2863F] md:text-3xl">
            Everything You Need
            <br />
            For the New Semester
          </h2>
          <p className="mt-3 max-w-md text-sm text-gray-600 md:text-base">
            Pick ready-made stationery bundles for classes, office desks, journaling, and art projects.
          </p>
          <button
            onClick={() => navigate("/BundleKits")}
            className="mt-4 rounded-md bg-[#C2863F] px-5 py-2 font-medium text-white shadow"
          >
            Shop The Bundle
          </button>
        </div>
        <div className="flex-1">
          <img
            src={curatedImg}
            alt="bundle"
            className="w-full max-w-sm rounded-xl object-cover shadow-lg"
          />
        </div>
        </div>
      </section>

      <ProductShowcaseSection
        eyebrow="Office essentials"
        title="Desk supplies for productive work"
        products={officeProducts}
        loading={loading}
        tone="white"
        onBrowse={() => navigate("/writing-essentials?q=office")}
        onProduct={(product) => navigate(productPath(product))}
      />

      <section className="w-full bg-[#FFF49C] px-4 py-12 md:px-8">
        <h2 className="text-center text-2xl font-bold text-[#242414]">
          Tailored for Your Workflow
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-[#5F5A44]">
          Whether you are studying for finals, managing a team, or sketching
          your next masterpiece.
        </p>
        <div className="mx-auto mt-8 grid max-w-7xl gap-5 md:grid-cols-3">
          <TailCard
            img={graduate}
            title="For Students"
            desc="Perfect for exams, notes, and daily study needs."
            onClick={() => navigate(`/collections/${studentCollectionSlug}`)}
          />
          <TailCard
            img={briefcase}
            title="For Professionals"
            desc="Stay organized with tools built for productivity."
            onClick={() => navigate(`/collections/${professionalCollectionSlug}`)}
          />
          <TailCard
            img={palette}
            title="For Artists"
            desc="Unleash creativity with premium sketch tools."
            onClick={() => navigate(`/collections/${artistCollectionSlug}`)}
          />
        </div>
      </section>

      <section className="bg-[#FBF8F2] px-4 py-10 md:px-8">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 text-center md:grid-cols-4">
          <Feature icon={car} title="Fast Shipping" />
          <Feature icon={verify} title="Secure Payment" />
          <Feature icon={music} title="Expert Support" />
          <Feature icon={star} title="Quality Guarantee" />
        </div>
      </section>

      <ProductShowcaseSection
        eyebrow="Creative supplies"
        title="Art and craft picks"
        products={creativeProducts}
        loading={loading}
        onBrowse={() => navigate("/writing-essentials?q=art%20craft")}
        onProduct={(product) => navigate(productPath(product))}
      />

      <section className="bg-[#404C31] px-4 py-14 text-center text-white md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#FFF49C]">
          Google Reviews
        </p>
        <h2 className="mt-2 text-2xl font-bold">What Our Customers Say</h2>
        <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-3 rounded-full bg-white px-5 py-3 text-[#242414] shadow-sm">
          <span className="text-sm font-bold">Google</span>
          {hasGoogleRating ? (
            <>
              <span className="text-lg font-bold text-[#C2863F]">
                {googleRating.toFixed(1)}
              </span>
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, index) => (
                  <img
                    key={index}
                    src={star}
                    className={`w-4 ${
                      index < Math.round(googleRating) ? "opacity-100" : "opacity-25"
                    }`}
                    alt=""
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-gray-500">
                {googleReviews.reviewCount.toLocaleString("en-IN")} Google reviews
              </span>
            </>
          ) : (
            <span className="text-xs font-medium text-gray-500">
              {googleReviewsLoading ? "Loading Google rating" : "Google rating unavailable"}
            </span>
          )}
        </div>
        <div className="mt-2 text-xs text-white/65">
          Reviews are shown from Google Maps with reviewer attribution.
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <a
            href={reviewDestination}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-[#404C31]"
          >
            View on Google Maps
          </a>
          <a
            href={reviewDestination}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#404C31] transition hover:bg-[#FFF49C]"
          >
            Review us on Google
          </a>
        </div>
        {googleReviewsLoading ? (
          <div className="mx-auto mt-10 grid max-w-7xl gap-5 md:grid-cols-3 xl:grid-cols-5">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="min-h-[220px] rounded-2xl bg-white/90 p-5 shadow-md">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="mt-6 space-y-3">
                  <div className="h-3 rounded bg-gray-200" />
                  <div className="h-3 rounded bg-gray-200" />
                  <div className="h-3 w-2/3 rounded bg-gray-200" />
                </div>
                <div className="mt-8 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-200" />
                  <div className="space-y-2">
                    <div className="h-3 w-24 rounded bg-gray-200" />
                    <div className="h-3 w-16 rounded bg-gray-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : visibleGoogleReviews.length ? (
          <>
            <div className="mx-auto mt-10 max-w-lg overflow-hidden md:hidden">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${reviewIndex * 100}%)` }}
              >
                {visibleGoogleReviews.slice(0, 5).map((review, index) => (
                  <div
                    key={`${review.authorName || "review"}-${review.time || index}`}
                    className="min-w-full px-1"
                  >
                    <ReviewCard
                      img={review.profilePhotoUrl}
                      name={review.authorName}
                      text={review.text || "Rated Golden Creation on Google."}
                      rating={review.rating}
                      relativeTime={review.relativeTime}
                      authorUrl={review.authorUrl}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-center gap-2">
                {visibleGoogleReviews.slice(0, 5).map((review, index) => (
                  <button
                    key={`${review.authorName || "review-dot"}-${review.time || index}`}
                    type="button"
                    onClick={() => setReviewIndex(index)}
                    aria-label={`Show review ${index + 1}`}
                    className={`h-2.5 w-2.5 rounded-full transition ${
                      reviewIndex === index ? "bg-[#FFF49C]" : "bg-white/35"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="mx-auto mt-10 hidden max-w-7xl gap-5 md:grid md:grid-cols-3 xl:grid-cols-5">
              {visibleGoogleReviews.slice(0, 5).map((review, index) => (
                <ReviewCard
                  key={`${review.authorName || "review"}-${review.time || index}`}
                  img={review.profilePhotoUrl}
                  name={review.authorName}
                  text={review.text || "Rated Golden Creation on Google."}
                  rating={review.rating}
                  relativeTime={review.relativeTime}
                  authorUrl={review.authorUrl}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-white/15 bg-white/10 px-5 py-6 text-sm text-white/80">
            {googleReviewsError || "Google reviews are temporarily unavailable."}
          </div>
        )}
        <div className="mt-5 text-xs text-white/60">
          Powered by Google Maps
        </div>
      </section>

      <section className="flex justify-center px-4 py-12 md:px-8">
        <div className="w-full max-w-7xl rounded-3xl bg-[#161A1D] px-4 py-12 text-center shadow-lg md:px-10">
          <h2 className="text-xl font-bold text-white">
            Join the Golden Creation Community
          </h2>
          <p className="mt-3 text-sm text-gray-400">
            Subscribe to get early access to new collections, productivity
            tips, and exclusive offers.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <input
              type="email"
              value={newsletterEmail}
              onChange={(event) => setNewsletterEmail(event.target.value)}
              placeholder="Enter your email"
              className="w-full rounded-md border border-gray-300 px-4 py-2 outline-none sm:w-64"
            />
            <button
              onClick={async () => { try { const response = await subscribeNewsletter(newsletterEmail, "homepage"); setNewsletterMessage(response.message); setNewsletterEmail(""); } catch (newsletterError) { setNewsletterMessage(newsletterError.message); } }}
              className="rounded-md bg-[#C2863F] px-4 py-2 text-sm text-white transition hover:bg-[#a86e32]"
            >
              Subscribe
            </button>
          </div>
          {newsletterMessage && <p className="mt-3 text-xs text-[#C2863F]">{newsletterMessage}</p>}
          <p className="mt-4 text-xs text-[#C2863F]">
            By subscribing, you agree to our Privacy Policy and Terms of
            Service.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function ReviewCard({ img, name, text, rating = 5, relativeTime, authorUrl }) {
  return (
    <article className="flex min-h-[220px] flex-col justify-between rounded-2xl bg-white p-5 text-left text-gray-800 shadow-md">
      <div>
        <div className="mb-4 flex items-center gap-0.5">
          {[...Array(5)].map((_, index) => (
            <img
              key={index}
              src={star}
              className={`h-3.5 w-3.5 ${
                index < Math.round(Number(rating || 0)) ? "opacity-100" : "opacity-20"
              }`}
              alt=""
            />
          ))}
        </div>
        <p className="line-clamp-5 text-sm leading-6 text-gray-600">{text}</p>
      </div>
      <div className="mt-5 flex items-center gap-3">
        {img ? (
          <img src={img} className="h-10 w-10 rounded-full object-cover" alt={name} />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF49C] text-sm font-bold text-[#8A5A22]">
            {String(name || "G").charAt(0)}
          </span>
        )}
        <div className="min-w-0">
          {authorUrl ? (
            <a
              href={authorUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm font-semibold hover:text-[#C2863F]"
            >
              {name}
            </a>
          ) : (
            <p className="truncate text-sm font-semibold">{name}</p>
          )}
          <p className="text-xs text-gray-400">{relativeTime || "Google review"}</p>
        </div>
      </div>
    </article>
  );
}

function ProductCard({ product, onClick }) {
  const rating = Number(product.averageRating || product.rating || 0);
  const reviewCount = Number(product.reviewCount || 0);
  const hasRating = reviewCount > 0 && rating > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[#C2863F] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#C2863F]/25"
    >
      <div className="relative flex aspect-square items-center justify-center bg-[#F7F5EF] p-3">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            className="h-full w-full object-contain transition duration-300 group-hover:scale-105"
            alt={product.name}
          />
        ) : (
          <span className="text-sm text-gray-400">No image</span>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#8A5A22] shadow-sm">
          {product.categoryName}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 min-h-[38px] text-sm font-semibold leading-snug text-[#242414]">
          {product.name}
        </p>

        {hasRating && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, index) => (
                <img
                  key={index}
                  src={star}
                  className={`h-3.5 w-3.5 ${index < Math.round(rating) ? "opacity-100" : "opacity-20"}`}
                  alt=""
                />
              ))}
            </div>
            <span className="text-[11px] font-semibold text-[#6B5B2A]">
              {rating.toFixed(1)}
            </span>
            <span className="text-[11px] text-gray-400">({reviewCount})</span>
          </div>
        )}

        <div className="mt-3 flex items-end justify-between gap-2">
          <PriceOffer price={product.price} comparePrice={product.comparePrice} mrp={product.mrp} percent={product.discountPercent} />
          <span className="rounded-full bg-[#FFF49C] px-2.5 py-1 text-[11px] font-semibold text-[#8A5A22] transition group-hover:bg-[#C2863F] group-hover:text-white">
            View
          </span>
        </div>
      </div>
    </button>
  );
}

function ProductShowcaseSection({ eyebrow, title, products, loading, onBrowse, onProduct, tone = "soft" }) {
  return (
    <section className={`${tone === "white" ? "bg-white" : "bg-[#FBF8F2]"} px-4 py-12 md:px-8`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#C2863F]">{eyebrow}</p>
            <h2 className="mt-1 text-2xl font-bold text-[#242414]">{title}</h2>
          </div>
          <button onClick={onBrowse} className="hidden items-center gap-1 text-sm font-semibold text-[#C2863F] sm:flex">
            Browse all
            <img src={chevron} className="w-4" />
          </button>
        </div>
        {loading ? (
          <ProductGridSkeleton count={5} />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5 md:gap-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onClick={() => onProduct(product)} />
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-center sm:hidden">
          <button onClick={onBrowse} className="inline-flex items-center justify-center gap-1 rounded-full border border-[#C2863F] px-5 py-2 text-sm font-semibold text-[#C2863F]">
            Browse all
            <img src={chevron} className="w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

function Feature({ icon, title }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF49C]">
        <img src={icon} className="h-6 w-6 object-contain" />
      </div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
    </div>
  );
}

function TailCard({ img, title, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl bg-white p-6 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#A06422]/30"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#404C31]">
        <img src={img} className="w-8 invert" />
      </div>
      <p className="font-semibold text-[#242414]">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{desc}</p>
    </button>
  );
}

function CategoryCard({ img, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-w-[72vw] snap-start rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm transition duration-200 hover:border-[#C2863F] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#C2863F]/25 sm:min-w-[240px] lg:min-w-[260px]"
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-[#F7F5EF]">
        {img ? (
          <img
            src={img}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            alt={title}
          />
        ) : (
          <span className="px-4 text-center text-lg font-semibold text-[#8A5A22]">{title}</span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="line-clamp-2 text-sm font-semibold text-[#242414]">{title}</p>
        <span className="shrink-0 rounded-full bg-[#FFF49C] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#8A5A22]">
          Shop
        </span>
      </div>
    </button>
  );
}

function BrandCard({ brand, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group min-w-[74vw] snap-start rounded-2xl border border-gray-100 bg-[#FBF8F2] p-4 text-left shadow-sm transition duration-200 hover:border-[#C2863F] hover:bg-white hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#C2863F]/25 sm:min-w-[260px] lg:min-w-[300px]"
    >
      <div className="flex h-24 items-center justify-center rounded-xl bg-white px-4 text-center shadow-sm ring-1 ring-gray-100 transition duration-200 group-hover:brightness-105">
        {brand.logo ? (
          <img src={brand.logo} alt={brand.name} className="max-h-16 w-full object-contain" />
        ) : (
          <span className="font-serif text-2xl font-bold tracking-wide text-[#242414] sm:text-3xl">
            {brand.name}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#242414]">{brand.name}</p>
          <p className="text-xs text-gray-500">
            {Number(brand.product_count || brand.productCount || 0)} products
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#C2863F] transition group-hover:bg-[#FFF49C]">
          Shop
        </span>
      </div>
    </button>
  );
}

export default ConnectedHome;
