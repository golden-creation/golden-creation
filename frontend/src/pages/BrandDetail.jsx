import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import ProductRating from "../components/ProductRating";
import PriceOffer from "../components/PriceOffer";
import { getBrandBySlug, productPath } from "../lib/api";

function BrandDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [brand, setBrand] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("featured");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    getBrandBySlug(slug)
      .then((payload) => {
        if (ignore) return;
        setBrand(payload.brand);
        setProducts(payload.products);
        setError("");
        document.title = payload.brand?.meta_title || `${payload.brand?.name || "Brand"} | Golden Creation`;
        let meta = document.querySelector("meta[name='description']");
        if (!meta) {
          meta = document.createElement("meta");
          meta.setAttribute("name", "description");
          document.head.appendChild(meta);
        }
        meta.setAttribute("content", payload.brand?.meta_description || payload.brand?.description || `Shop ${payload.brand?.name || "brand"} products on Golden Creation.`);
        let canonical = document.querySelector("link[rel='canonical']");
        if (!canonical) {
          canonical = document.createElement("link");
          canonical.setAttribute("rel", "canonical");
          document.head.appendChild(canonical);
        }
        canonical.setAttribute("href", `${window.location.origin}/brand/${slug}`);
      })
      .catch((loadError) => setError(loadError.message || "Unable to load brand"))
      .finally(() => !ignore && setLoading(false));

    return () => {
      ignore = true;
    };
  }, [slug]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = products.filter((product) =>
      !query || `${product.name} ${product.description || ""} ${product.categoryName || ""}`.toLowerCase().includes(query)
    );

    if (sortBy === "price-low") return [...filtered].sort((a, b) => a.price - b.price);
    if (sortBy === "price-high") return [...filtered].sort((a, b) => b.price - a.price);
    if (sortBy === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }, [products, search, sortBy]);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      {loading ? (
        <main className="mx-auto max-w-7xl px-4 py-12 text-sm text-gray-500">Loading brand...</main>
      ) : error || !brand ? (
        <main className="mx-auto max-w-7xl px-4 py-12">
          <div className="rounded-xl border border-[#C2863F] bg-[#FFF4CC] p-5 text-sm text-[#7a4d18]">{error || "Brand not found"}</div>
        </main>
      ) : (
        <main>
          <section className="relative overflow-hidden border-b bg-[#FBF8F2]">
            {brand.banner && <img src={brand.banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />}
            <div className="relative mx-auto max-w-7xl px-4 py-12 md:px-8">
              <div className="flex flex-col gap-5 md:flex-row md:items-end">
                <div className="flex h-28 w-28 items-center justify-center rounded-2xl border bg-white p-3 shadow-sm">
                  {brand.logo ? <img src={brand.logo} alt={brand.name} className="h-full w-full object-contain" /> : <span className="text-4xl font-bold text-[#A68B5B]">{brand.name.charAt(0)}</span>}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#C2863F]">Brand Store</p>
                  <h1 className="mt-2 text-3xl font-bold text-gray-950">{brand.name}</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">{brand.description || `Shop ${brand.name} products on Golden Creation.`}</p>
                  {brand.website_url && <a href={brand.website_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-[#8A541E]">Visit official website</a>}
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-8 md:px-8">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold">{visibleProducts.length}</span> {brand.name} products
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this brand" className="rounded-lg border px-3 py-2 text-sm" />
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                  <option value="featured">Featured</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name">Name: A to Z</option>
                </select>
              </div>
            </div>

            {visibleProducts.length ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {visibleProducts.map((product) => (
                  <button key={product.id} onClick={() => navigate(productPath(product))} className="rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-[#C2863F] hover:shadow-md">
                    <div className="flex h-40 items-center justify-center rounded-lg bg-[#FBF8F2]">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-3" /> : <span className="text-xs text-gray-400">No image</span>}
                    </div>
                    <ProductRating product={product} className="mt-3" />
                    <p className="mt-2 text-xs uppercase tracking-wide text-gray-400">{product.categoryName}</p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-semibold">{product.name}</h3>
                    <PriceOffer className="mt-2" price={product.price} comparePrice={product.comparePrice} mrp={product.mrp} percent={product.discountPercent} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-500">No products matched this brand filter.</div>
            )}
          </section>
        </main>
      )}
      <Footer />
    </div>
  );
}

export default BrandDetail;
