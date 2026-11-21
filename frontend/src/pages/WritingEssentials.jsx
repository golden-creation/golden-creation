import React, { useCallback, useEffect, useMemo, useState } from "react";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import dashboard from "../assets/dashboard.png";
import menu from "../assets/menu.png";
import down from "../assets/down-arrow.png";
import star from "../assets/star.png";
import leftIcon from "../assets/left.png";
import chevron from "../assets/chevron.png";
import r1 from "../assets/r1.jpeg";
import r2 from "../assets/r2.jpeg";
import r3 from "../assets/r3.jpeg";
import r4 from "../assets/r4.jpeg";
import r5 from "../assets/r5.jpeg";
import r6 from "../assets/r6.jpeg";
import r7 from "../assets/r7.jpeg";
import r8 from "../assets/r8.jpeg";
import r9 from "../assets/r9.jpeg";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { formatCurrency, getBrands, getCategories, getProducts, getVariantFilters, productPath } from "../lib/api";
import ProductRating from "../components/ProductRating";
import { ProductGridSkeleton } from "../components/Skeleton";

const fallbackImages = [r1, r2, r3, r4, r5, r6, r7, r8, r9];
const ratingOptions = [4, 3, 2];
const priceRanges = [
  { label: "Under ₹500", min: 0, max: 500 },
  { label: "₹500 - ₹1,500", min: 500, max: 1500 },
  { label: "₹1,500 - ₹3,000", min: 1500, max: 3000 },
  { label: "Above ₹3,000", min: 3000, max: Infinity },
];

function WritingEssentials() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [variantFilters, setVariantFilters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [activeIcon, setActiveIcon] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [sortBy, setSortBy] = useState("featured");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedVariantFilters, setSelectedVariantFilters] = useState({});
  const [selectedRatings, setSelectedRatings] = useState([]);
  const [selectedPriceRange, setSelectedPriceRange] = useState("");
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const { slug: categorySlug } = useParams();
  const navigate = useNavigate();

  const searchTerm = (searchParams.get("q") || "").trim().toLowerCase();
  const getProductBrand = useCallback(
    (product) => product.brandName || product.brand || "Golden Creation",
    []
  );
  const getProductBrandSlug = useCallback(
    (product) =>
      product.brandSlug ||
      String(getProductBrand(product))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    [getProductBrand]
  );

  useEffect(() => {
    const categoryParam = searchParams.get("category");
    const categoryFromQuery = Number(categoryParam);
    const categoryFromSlug = categories.find((category) => category.slug === categorySlug)?.id;
    setSelectedCategory(
      categorySlug && categoryFromSlug
        ? categoryFromSlug
        : categoryParam && !Number.isNaN(categoryFromQuery)
        ? categoryFromQuery
        : null
    );
    setSelectedBrands(
      (searchParams.get("brands") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );
    setSelectedTags(
      (searchParams.get("tags") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );
    setSelectedVariantFilters({
      Color: (searchParams.get("color") || "").split(",").map((item) => item.trim()).filter(Boolean),
      Size: (searchParams.get("size") || "").split(",").map((item) => item.trim()).filter(Boolean),
      Material: (searchParams.get("material") || "").split(",").map((item) => item.trim()).filter(Boolean),
    });
    setPage(1);
  }, [searchParams, categorySlug, categories]);

  useEffect(() => {
    let isMounted = true;

    async function loadCatalog() {
      try {
        setLoading(true);
        const [apiProducts, apiCategories, apiBrands, apiVariantFilters] = await Promise.all([
          getProducts(),
          getCategories(),
          getBrands({ sort: "name" }),
          getVariantFilters(),
        ]);

        if (!isMounted) {
          return;
        }

        setProducts(
          apiProducts.map((product, index) => ({
            ...product,
            img: product.imageUrl || fallbackImages[index % fallbackImages.length],
          }))
        );
        setCategories(apiCategories);
        setBrands(apiBrands);
        setVariantFilters(apiVariantFilters);
        setError("");
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || "Unable to load products.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadCatalog();

    return () => {
      isMounted = false;
    };
  }, []);

  const iconStyle = (name) =>
    `w-4 cursor-pointer transition transform ${
      activeIcon === name ? "scale-125 opacity-70" : "hover:scale-110"
    }`;

  const availableBrands = useMemo(() => {
    const brandCounts = products.reduce((counts, product) => {
      const key = getProductBrandSlug(product);

      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());

    const apiBrands = brands.map((brand) => ({
      name: brand.name,
      slug: brand.slug,
      count: brandCounts.get(brand.slug) || brand.product_count || 0,
      logo: brand.logo,
    }));
    const productOnlyBrands = [...brandCounts.entries()]
      .filter(([slug]) => !apiBrands.some((brand) => brand.slug === slug))
      .map(([slug, count]) => ({ slug, name: slug.replace(/-/g, " "), count }));

    return [...apiBrands, ...productOnlyBrands]
      .filter((brand) => brand.count > 0)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [brands, products, getProductBrandSlug]);

  useEffect(() => {
    setSelectedBrands((currentBrands) =>
      currentBrands.filter((brand) =>
        availableBrands.some((item) => item.slug === brand)
      )
    );
  }, [availableBrands]);

  const selectedPrice = priceRanges.find((range) => range.label === selectedPriceRange);

  const filteredProducts = useMemo(() => {
    const filtered = products.filter((product) => {
    const matchesCategory =
      selectedCategory == null || Number(product.categoryId) === Number(selectedCategory);
    const matchesSearch =
      !searchTerm ||
      product.name.toLowerCase().includes(searchTerm) ||
      product.categoryName.toLowerCase().includes(searchTerm) ||
      getProductBrand(product).toLowerCase().includes(searchTerm) ||
      (product.tags || []).join(" ").toLowerCase().includes(searchTerm) ||
      (product.variants || [])
        .some((variant) =>
          `${variant.sku} ${variant.optionSummary} ${(variant.options || []).map((option) => option.value).join(" ")}`
            .toLowerCase()
            .includes(searchTerm)
        );
    const matchesBrand =
      selectedBrands.length === 0 || selectedBrands.includes(getProductBrandSlug(product));
    const matchesTags =
      selectedTags.length === 0 ||
      selectedTags.some((tag) => (product.tagSlugs || []).includes(tag));
    const matchesRating =
      selectedRatings.length === 0 ||
      Number(product.rating || 0) >= Math.max(...selectedRatings);
    const productPrice = Number(product.price) || 0;
    const matchesPrice =
      !selectedPrice ||
      (productPrice >= selectedPrice.min && productPrice <= selectedPrice.max);
    const activeVariantFilters = Object.entries(selectedVariantFilters).filter(([, values]) => values?.length);
    const matchesVariantFilters =
      activeVariantFilters.length === 0 ||
      activeVariantFilters.every(([optionName, values]) =>
        (product.variants || []).some((variant) =>
          (variant.options || []).some(
            (option) =>
              String(option.optionName || option.name).toLowerCase() === optionName.toLowerCase() &&
              values.includes(String(option.value).toLowerCase())
          )
        )
      );

    return matchesCategory && matchesSearch && matchesBrand && matchesTags && matchesRating && matchesPrice && matchesVariantFilters;
    });

    if (sortBy === "price-low") {
      return [...filtered].sort((left, right) => left.price - right.price);
    }

    if (sortBy === "price-high") {
      return [...filtered].sort((left, right) => right.price - left.price);
    }

    if (sortBy === "name") {
      return [...filtered].sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    }

    return filtered;
  }, [
    products,
    searchTerm,
    selectedCategory,
    selectedBrands,
    selectedTags,
    selectedVariantFilters,
    selectedRatings,
    selectedPrice,
    getProductBrand,
    getProductBrandSlug,
    sortBy,
  ]);

  const itemsPerPage = 9;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = useMemo(
    () =>
      filteredProducts.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
      ),
    [currentPage, filteredProducts]
  );

  const handleClear = () => {
    setSelectedCategory(null);
    setSelectedBrands([]);
    setSelectedTags([]);
    setSelectedVariantFilters({});
    setSelectedRatings([]);
    setSelectedPriceRange("");
    setSortBy("featured");
    setPage(1);
    setActiveIcon("clear");
    setTimeout(() => setActiveIcon(""), 200);
    navigate("/writing-essentials");
  };

  const toggleBrand = (brandName) => {
    const nextBrands = selectedBrands.includes(brandName)
      ? selectedBrands.filter((item) => item !== brandName)
      : [...selectedBrands, brandName];
    const nextParams = new URLSearchParams(searchParams);
    if (nextBrands.length) {
      nextParams.set("brands", nextBrands.join(","));
    } else {
      nextParams.delete("brands");
    }
    navigate(`/writing-essentials${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
    setSelectedBrands(nextBrands);
    setPage(1);
  };

  const categoryHref = (category) =>
    category?.slug ? `/category/${category.slug}` : `/writing-essentials?category=${category.id}`;

  const toggleRating = (rating) => {
    setSelectedRatings((currentRatings) =>
      currentRatings.includes(rating)
        ? currentRatings.filter((item) => item !== rating)
        : [...currentRatings, rating]
    );
    setPage(1);
  };

  const toggleVariantFilter = (optionName, value) => {
    const queryKey = optionName.toLowerCase();
    const normalizedValue = String(value).toLowerCase();
    const currentValues = selectedVariantFilters[optionName] || [];
    const nextValues = currentValues.includes(normalizedValue)
      ? currentValues.filter((item) => item !== normalizedValue)
      : [...currentValues, normalizedValue];
    const nextParams = new URLSearchParams(searchParams);

    if (nextValues.length) {
      nextParams.set(queryKey, nextValues.join(","));
    } else {
      nextParams.delete(queryKey);
    }

    navigate(`/writing-essentials${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
    setSelectedVariantFilters((current) => ({
      ...current,
      [optionName]: nextValues,
    }));
    setPage(1);
  };

  const activeFilterCount =
    (selectedCategory == null ? 0 : 1) +
    selectedBrands.length +
    selectedTags.length +
    Object.values(selectedVariantFilters).reduce((sum, values) => sum + (values?.length || 0), 0) +
    selectedRatings.length +
    (selectedPriceRange ? 1 : 0) +
    (searchTerm ? 1 : 0);
  const selectedCategoryName =
    categories.find((category) => Number(category.id) === Number(selectedCategory))?.name || "";
  const selectedBrandNames = selectedBrands
    .map((slug) => availableBrands.find((brand) => brand.slug === slug)?.name || slug)
    .filter(Boolean);
  const catalogTitle = selectedCategoryName
    ? selectedCategoryName
    : selectedTags.length
    ? selectedTags.map((tag) => tag.replace(/-/g, " ")).join(", ")
    : selectedBrandNames.length
    ? selectedBrandNames.join(", ")
    : searchTerm
    ? `Search results for "${searchParams.get("q") || ""}"`
    : "All Products";

  return (
    <>
      <div className="min-h-screen overflow-x-hidden bg-white">
        <Navbar />
        <div className="w-full border-b bg-white px-4 py-6 md:px-6 md:py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#C2863F]">
                Shop the catalog
              </p>
              <h1 className="mt-1 text-xl font-semibold capitalize md:text-3xl">
                {catalogTitle}
              </h1>
              <p className="mt-2 max-w-3xl text-xs text-gray-600 md:text-sm">
                Explore pens, notebooks, office supplies, art materials, and
                premium tools for every study, work, and creative routine.
              </p>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex w-full items-center justify-center gap-2 rounded bg-[#C2863F] px-4 py-2 text-sm text-white md:hidden"
            >
              {showFilters ? "Hide Filters" : "Show Filters"}
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-[#C2863F]">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 rounded-lg border border-[#C2863F] bg-[#FFF4CC] px-4 py-3 text-sm text-[#7a4d18] md:mx-6">
            {error}
          </div>
        )}

        <div className="flex flex-col md:flex-row">
          {showFilters && (
            <button
              type="button"
              aria-label="Close filters"
              onClick={() => setShowFilters(false)}
              className="fixed inset-0 z-[990] bg-black/30 md:hidden"
            />
          )}
          <aside
            className={`fixed inset-x-0 bottom-0 z-[1000] max-h-[86vh] w-full overflow-y-auto rounded-t-3xl border-r bg-white px-4 py-5 shadow-2xl transition-transform duration-200 md:sticky md:top-[72px] md:z-auto md:block md:h-[calc(100vh-72px)] md:w-72 md:translate-y-0 md:rounded-none md:shadow-none md:px-6 md:visible md:pointer-events-auto ${
              showFilters ? "block visible translate-y-0" : "hidden pointer-events-none translate-y-full md:block md:translate-y-0"
            }`}
          >
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <img
                  src={dashboard}
                  onClick={() => setActiveIcon("dashboard")}
                  className={iconStyle("dashboard")}
                />
                <h2 className="text-sm font-semibold">Filters</h2>
              </div>
              <button
                onClick={handleClear}
                disabled={activeFilterCount === 0 && sortBy === "featured"}
                className={`text-xs disabled:text-gray-300 ${
                  activeIcon === "clear" ? "text-gray-400" : "hover:text-[#C2863F]"
                }`}
              >
                Clear All
              </button>
            </div>

            <div className="mb-6 border-b pb-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Categories</h3>
                <img
                  src={down}
                  onClick={() => setActiveIcon("cat")}
                  className={iconStyle("cat")}
                />
              </div>
              {categories.map((category) => {
                const count = products.filter(
                  (product) => Number(product.categoryId) === Number(category.id)
                ).length;

                return (
                  <label key={category.id} className="mb-2 flex justify-between text-sm">
                    <div className="flex gap-2">
                      <input
                        type="radio"
                        name="category"
                        className="accent-[#C2863F]"
                        checked={Number(selectedCategory) === Number(category.id)}
                        onChange={() => {
                          setSelectedCategory(category.id);
                          setPage(1);
                          navigate(categoryHref(category));
                        }}
                      />
                      {category.name}
                    </div>
                    <span className="text-xs text-gray-400">({count})</span>
                  </label>
                );
              })}
              <label className="mt-2 flex justify-between text-sm">
                <div className="flex gap-2">
                  <input
                    type="radio"
                    name="category"
                    className="accent-[#C2863F]"
                    checked={selectedCategory == null}
                    onChange={() => {
                      setSelectedCategory(null);
                      setPage(1);
                      navigate("/writing-essentials");
                    }}
                  />
                  All Categories
                </div>
                <span className="text-xs text-gray-400">({products.length})</span>
              </label>
            </div>

            <div className="mb-6 border-b pb-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Price</h3>
                <img
                  src={down}
                  onClick={() => setActiveIcon("price")}
                  className={iconStyle("price")}
                />
              </div>
              {priceRanges.map((range) => (
                <label key={range.label} className="mb-2 flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="price"
                    className="accent-[#C2863F]"
                    checked={selectedPriceRange === range.label}
                    onChange={() => {
                      setSelectedPriceRange(range.label);
                      setPage(1);
                    }}
                  />
                  {range.label}
                </label>
              ))}
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="price"
                  className="accent-[#C2863F]"
                  checked={!selectedPriceRange}
                  onChange={() => {
                    setSelectedPriceRange("");
                    setPage(1);
                  }}
                />
                All Prices
              </label>
            </div>

            <div className="mb-6 border-b pb-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Sort</h3>
                <img
                  src={down}
                  onClick={() => setActiveIcon("sort")}
                  className={iconStyle("sort")}
                />
              </div>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="w-full rounded border p-2 text-sm"
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="name">Name: A to Z</option>
              </select>
            </div>

            <div className="mb-6 border-b pb-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Brands</h3>
                <img
                  src={down}
                  onClick={() => setActiveIcon("brand")}
                  className={iconStyle("brand")}
                />
              </div>
              {availableBrands.map((brand) => (
                <label key={brand.slug} className="mb-2 flex justify-between text-sm">
                  <div className="flex gap-2">
                    <input
                      type="checkbox"
                      className="accent-[#C2863F]"
                      checked={selectedBrands.includes(brand.slug)}
                      onChange={() => toggleBrand(brand.slug)}
                    />
                    {brand.name}
                  </div>
                  <span className="text-xs text-gray-400">({brand.count})</span>
                </label>
              ))}
            </div>

            {variantFilters.length > 0 && (
              <div className="mb-6 border-b pb-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Variants</h3>
                  <img
                    src={down}
                    onClick={() => setActiveIcon("variant")}
                    className={iconStyle("variant")}
                  />
                </div>
                {variantFilters
                  .filter((option) => ["color", "size", "material"].includes(String(option.name).toLowerCase()))
                  .map((option) => (
                    <div key={option.id || option.name} className="mb-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {option.name}
                      </p>
                      {(option.values || []).map((value) => {
                        const normalizedValue = String(value.value).toLowerCase();
                        const selected = (selectedVariantFilters[option.name] || []).includes(normalizedValue);

                        return (
                          <label key={value.id || value.value} className="mb-2 flex justify-between text-sm">
                            <div className="flex gap-2">
                              <input
                                type="checkbox"
                                className="accent-[#C2863F]"
                                checked={selected}
                                onChange={() => toggleVariantFilter(option.name, value.value)}
                              />
                              {value.value}
                            </div>
                            <span className="text-xs text-gray-400">({value.productCount || 0})</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
              </div>
            )}

            <div className="pb-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Customer Rating</h3>
                <img
                  src={down}
                  onClick={() => setActiveIcon("rating")}
                  className={iconStyle("rating")}
                />
              </div>
              {ratingOptions.map((rating, index) => (
                <div key={index} className="mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-[#C2863F]"
                    checked={selectedRatings.includes(rating)}
                    onChange={() => toggleRating(rating)}
                  />
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, starIndex) => (
                      <img
                        key={starIndex}
                        src={star}
                        className={`w-4 ${starIndex < rating ? "opacity-100" : "opacity-30"}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-600">& up</span>
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 -mx-4 mt-5 border-t bg-white px-4 py-3 md:hidden">
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="mobile-touch-target w-full rounded-full bg-[#C2863F] px-4 py-3 text-sm font-semibold text-white"
              >
                Show {filteredProducts.length} products
              </button>
            </div>
          </aside>

          <div className="w-full flex-1 p-4 md:p-6">
            <div className="rounded-lg border bg-white p-3 shadow-sm">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <p className="text-sm text-gray-700">
                  Showing <span className="font-semibold">{pagedProducts.length}</span> of{" "}
                  <span className="font-semibold">{filteredProducts.length}</span> products
                  {searchTerm ? ` for "${searchTerm}"` : ""}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    Sort
                    <select
                      value={sortBy}
                      onChange={(event) => {
                        setSortBy(event.target.value);
                        setPage(1);
                      }}
                      className="rounded border px-3 py-2 text-sm text-gray-800"
                    >
                      <option value="featured">Featured</option>
                      <option value="price-low">Price: Low to High</option>
                      <option value="price-high">Price: High to Low</option>
                      <option value="name">Name: A to Z</option>
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      className={`flex h-9 w-9 items-center justify-center rounded border ${
                        viewMode === "grid" ? "border-[#C2863F] bg-[#FFF49C]" : "bg-white"
                      }`}
                      aria-label="Grid view"
                    >
                      <img src={dashboard} className="w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className={`flex h-9 w-9 items-center justify-center rounded border ${
                        viewMode === "list" ? "border-[#C2863F] bg-[#FFF49C]" : "bg-white"
                      }`}
                      aria-label="List view"
                    >
                      <img src={menu} className="w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {activeFilterCount > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                  {searchTerm && <FilterPill label={`Search: ${searchTerm}`} />}
                  {selectedCategory != null && (
                    <FilterPill
                      label={
                        categories.find((category) => Number(category.id) === Number(selectedCategory))
                          ?.name || "Category"
                      }
                    />
                  )}
                  {selectedBrands.map((brand) => (
                    <FilterPill key={brand} label={availableBrands.find((item) => item.slug === brand)?.name || brand} />
                  ))}
                  {Object.entries(selectedVariantFilters).flatMap(([optionName, values]) =>
                    (values || []).map((value) => (
                      <FilterPill key={`${optionName}-${value}`} label={`${optionName}: ${value}`} />
                    ))
                  )}
                  {selectedPriceRange && <FilterPill label={selectedPriceRange} />}
                  {selectedRatings.map((rating) => (
                    <FilterPill key={rating} label={`${rating}+ stars`} />
                  ))}
                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-full border border-[#C2863F] px-3 py-1 text-xs text-[#C2863F]"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="mt-6">
                <ProductGridSkeleton count={6} />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
                <h2 className="text-base font-semibold text-gray-800">No products found</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Try a different category, brand, rating, or search term.
                </p>
                <button
                  type="button"
                  onClick={handleClear}
                  className="mt-4 rounded bg-[#C2863F] px-4 py-2 text-sm text-white"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div
                className={
                  viewMode === "grid"
                    ? "mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6"
                    : "mt-6 flex flex-col gap-4"
                }
              >
                {pagedProducts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(productPath(item))}
                  className={`group rounded-xl border bg-white p-2.5 text-left shadow-sm transition hover:border-[#C2863F] hover:shadow-md md:p-3 ${
                    viewMode === "list" ? "grid grid-cols-[110px_1fr] gap-4 sm:grid-cols-[160px_1fr]" : ""
                  }`}
                >
                  <div
                    className={`relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-gray-50 ${
                      viewMode === "list" ? "h-28 sm:h-36" : "aspect-square"
                    }`}
                  >
                    <img
                      src={item.img}
                      className="h-full w-full object-contain p-2 transition duration-300 group-hover:scale-105"
                      alt={item.name}
                    />
                  </div>
                  <div className={viewMode === "list" ? "flex min-w-0 flex-col justify-center" : ""}>
                    <ProductRating product={item} className="mt-2" starClassName="h-4 w-4" />
                    <p className="mt-2 line-clamp-1 text-[10px] uppercase tracking-wide text-gray-400 md:text-xs">
                      {item.categoryName}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-[#8A541E]">
                      {getProductBrand(item)}
                    </p>
                    <p className="mt-1 line-clamp-2 min-h-[38px] text-sm font-semibold leading-snug hover:text-[#C2863F]">
                      {item.name}
                    </p>
                    {viewMode === "list" && (
                      <p className="mt-2 line-clamp-2 text-xs text-gray-500">
                        {item.description || "Premium stationery selected for everyday use."}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="text-base font-bold text-[#C2863F]">{formatCurrency(item.price)}</p>
                      <span className="rounded-full bg-[#FFF49C] px-2.5 py-1 text-[11px] font-semibold text-[#8A5A22]">
                        View
                      </span>
                    </div>
                  </div>
                  </button>
                ))}
              </div>
            )}

            {!loading && filteredProducts.length > 0 && (
            <div className="mt-10">
              <div className="mb-4 flex flex-wrap items-center justify-center gap-2 md:justify-end">
                <img
                  src={leftIcon}
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                  className="w-5 cursor-pointer"
                />
                {Array.from({ length: totalPages }).slice(0, 5).map((_, index) => {
                  const pageNumber = index + 1;

                  return (
                    <span
                      key={pageNumber}
                      onClick={() => setPage(pageNumber)}
                      className={`cursor-pointer px-3 py-1 ${
                        pageNumber === currentPage ? "bg-[#C2863F] text-white" : ""
                      }`}
                    >
                      {pageNumber}
                    </span>
                  );
                })}
                <img
                  src={chevron}
                  onClick={() =>
                    setPage((previous) => Math.min(totalPages, previous + 1))
                  }
                  className="w-5 cursor-pointer"
                />
              </div>
              <p className="mb-4 text-sm text-gray-500">
                YOU'VE VIEWED {Math.min(filteredProducts.length, currentPage * itemsPerPage)} OF{" "}
                {filteredProducts.length} PRODUCTS
              </p>
              <div className="flex justify-start">
                <button
                  onClick={() =>
                    setPage((previous) => Math.min(totalPages, previous + 1))
                  }
                  disabled={currentPage >= totalPages}
                  className="w-full rounded bg-[#C2863F] px-8 py-2 text-white sm:w-auto"
                >
                  {currentPage >= totalPages ? "All Products Shown" : "Load More Products"}
                </button>
              </div>
            </div>
            )}

            <div className="mt-10 rounded-lg bg-[#FFF49CFF] p-5 md:p-8">
              <h2 className="mb-4 text-lg font-semibold text-gray-800 md:text-2xl">
                Discover Premium Writing Tools
              </h2>
              <div className="grid grid-cols-1 gap-4 text-xs leading-relaxed text-gray-700 md:grid-cols-2 md:gap-6 md:text-sm">
                <p>
                  At Golden Creation, we believe that the right writing instrument can
                  transform your work and creative process. Our collection of
                  writing essentials features world-renowned brands known for
                  their heritage, craftsmanship, and innovation.
                </p>
                <p>
                  We source our products directly from trusted manufacturers to
                  ensure authenticity and premium quality. Our range is curated
                  to suit every style and need.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

function FilterPill({ label }) {
  return (
    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
      {label}
    </span>
  );
}

export default WritingEssentials;
