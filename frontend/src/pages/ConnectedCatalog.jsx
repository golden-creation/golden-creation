import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import ProductRating from "../components/ProductRating";
import PriceOffer from "../components/PriceOffer";
import { getCategories, getProducts } from "../lib/api";

function ConnectedCatalog() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [sortBy, setSortBy] = useState("featured");
  const [page, setPage] = useState(1);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const searchTerm = (searchParams.get("q") || "").trim().toLowerCase();

  useEffect(() => {
    const categoryParam = searchParams.get("category");
    const categoryFromQuery = Number(categoryParam);
    setSelectedCategory(
      categoryParam && !Number.isNaN(categoryFromQuery) ? categoryFromQuery : null
    );
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    let ignore = false;

    const loadCatalog = async () => {
      try {
        setLoading(true);
        const [categoryResponse, productResponse] = await Promise.all([
          getCategories(),
          getProducts(),
        ]);

        if (!ignore) {
          setCategories(categoryResponse);
          setProducts(productResponse);
          setError("");
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || "Unable to load products.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadCatalog();

    return () => {
      ignore = true;
    };
  }, []);

  let filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategory == null || product.categoryId === selectedCategory;
    const matchesSearch =
      !searchTerm ||
      product.name.toLowerCase().includes(searchTerm) ||
      product.categoryName.toLowerCase().includes(searchTerm);

    return matchesCategory && matchesSearch;
  });

  if (sortBy === "price-low") {
    filteredProducts = [...filteredProducts].sort((left, right) => left.price - right.price);
  }

  if (sortBy === "price-high") {
    filteredProducts = [...filteredProducts].sort((left, right) => right.price - left.price);
  }

  if (sortBy === "name") {
    filteredProducts = [...filteredProducts].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }

  const itemsPerPage = 9;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pagedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white">
        <div className="border-b bg-white px-4 py-6 md:px-6 md:py-8">
          <h1 className="text-lg font-semibold md:text-2xl">Writing Essentials</h1>
          <p className="mt-2 max-w-3xl text-xs text-gray-600 md:text-sm">
            Explore premium writing tools including fountain pens, drafting pencils,
            notebooks, and other stationery products curated for everyday use.
          </p>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="mt-4 rounded bg-[#C2863F] px-4 py-2 text-white md:hidden"
          >
            {showFilters ? "Hide Filters" : "Show Filters"}
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 rounded-lg border border-[#C2863F] bg-[#FFF4CC] px-4 py-3 text-sm text-[#7a4d18] md:mx-6">
            {error}
          </div>
        )}

        <div className="flex flex-col md:flex-row">
          <aside
            className={`border-r bg-white px-4 py-6 md:block md:w-72 md:px-6 ${
              showFilters ? "block" : "hidden"
            }`}
          >
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button
                onClick={() => setSelectedCategory(null)}
                className="text-xs text-[#C2863F]"
              >
                Clear
              </button>
            </div>

            <div className="mb-6 border-b pb-4">
              <h3 className="mb-3 text-sm font-semibold">Categories</h3>
              {categories.map((category) => (
                <label key={category.id} className="mb-2 flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="category"
                    checked={selectedCategory === category.id}
                    onChange={() => {
                      setSelectedCategory(category.id);
                      setPage(1);
                    }}
                    className="accent-[#C2863F]"
                  />
                  {category.name}
                </label>
              ))}
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="category"
                  checked={selectedCategory == null}
                  onChange={() => {
                    setSelectedCategory(null);
                    setPage(1);
                  }}
                  className="accent-[#C2863F]"
                />
                All categories
              </label>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold">Sort</h3>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="w-full rounded border p-2 text-sm"
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="name">Name</option>
              </select>
            </div>
          </aside>

          <main className="flex-1 p-4 md:p-6">
            <div className="flex flex-col gap-3 rounded bg-[#FFF49C] p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                Showing {pagedProducts.length} of {filteredProducts.length} products
                {searchTerm ? ` for "${searchTerm}"` : ""}
              </p>
              <div className="text-sm text-gray-700">
                Backend catalog status: {loading ? "Loading..." : "Connected"}
              </div>
            </div>

            {loading ? (
              <p className="mt-6 text-sm text-gray-500">Loading products...</p>
            ) : filteredProducts.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
                No products matched the current filters.
              </div>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
                  {pagedProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => navigate(`/product/${product.id}`)}
                      className="rounded bg-white p-3 text-left shadow-sm transition hover:shadow-md"
                    >
                      <div className="flex h-32 items-center justify-center overflow-hidden rounded bg-gray-50 sm:h-40 md:h-48">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-sm text-gray-400">No image</span>
                        )}
                      </div>
                      <ProductRating product={product} className="mt-2" starClassName="h-4 w-4" />
                      <p className="mt-2 text-xs uppercase tracking-wide text-gray-400">
                        {product.categoryName}
                      </p>
                      <p className="text-sm hover:text-[#C2863F]">{product.name}</p>
                      <p className="font-bold text-[#C2863F]">
                        <PriceOffer price={product.price} comparePrice={product.comparePrice} mrp={product.mrp} percent={product.discountPercent} />
                      </p>
                    </button>
                  ))}
                </div>

                <div className="mt-10">
                  <div className="mb-4 flex flex-wrap items-center justify-center gap-2 md:justify-end">
                    <button
                      onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                      className="rounded border px-3 py-1 text-sm"
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }).slice(0, 5).map((_, index) => {
                      const pageNumber = index + 1;

                      return (
                        <button
                          key={pageNumber}
                          onClick={() => setPage(pageNumber)}
                          className={`rounded px-3 py-1 text-sm ${
                            currentPage === pageNumber ? "bg-[#C2863F] text-white" : "border"
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                      className="rounded border px-3 py-1 text-sm"
                    >
                      Next
                    </button>
                  </div>
                  <p className="text-sm text-gray-500">
                    Page {currentPage} of {totalPages}
                  </p>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </>
  );
}

export default ConnectedCatalog;
