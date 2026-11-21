import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { getBrands, getFeaturedBrands } from "../lib/api";

function Brands() {
  const navigate = useNavigate();
  const [brands, setBrands] = useState([]);
  const [featuredBrands, setFeaturedBrands] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Shop By Brand | Golden Creation";
    let meta = document.querySelector("meta[name='description']");
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "Browse stationery brands available on Golden Creation.");
  }, []);

  useEffect(() => {
    Promise.all([getBrands({ sort: "name" }), getFeaturedBrands(8)])
      .then(([brandData, featuredData]) => {
        setBrands(brandData);
        setFeaturedBrands(featuredData);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredBrands = useMemo(() => {
    const query = search.trim().toLowerCase();
    return brands.filter((brand) =>
      !query || `${brand.name} ${brand.description || ""}`.toLowerCase().includes(query)
    );
  }, [brands, search]);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main>
        <section className="border-b bg-[#FBF8F2] px-4 py-10 md:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#C2863F]">Shop by brand</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-950">All Brands</h1>
            <p className="mt-3 max-w-2xl text-sm text-gray-600">
              Explore official stationery, office, school, and creative supply brands available at Golden Creation.
            </p>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search brands"
              className="mt-6 w-full max-w-xl rounded-full border bg-white px-5 py-3 text-sm outline-none focus:border-[#C2863F]"
            />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          {featuredBrands.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xl font-semibold">Featured Brands</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                {featuredBrands.map((brand) => (
                  <BrandCard key={brand.id} brand={brand} onClick={() => navigate(`/brand/${brand.slug}`)} featured />
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : filteredBrands.length ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {filteredBrands.map((brand) => (
                <BrandCard key={brand.id} brand={brand} onClick={() => navigate(`/brand/${brand.slug}`)} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-500">
              No brands matched your search.
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

function BrandCard({ brand, onClick, featured = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#C2863F] hover:shadow-md"
    >
      <div className="flex h-20 items-center justify-center rounded-lg bg-[#FBF8F2]">
        {brand.logo ? (
          <img src={brand.logo} alt={brand.name} className="h-14 w-full object-contain" />
        ) : (
          <span className="text-2xl font-bold text-[#A68B5B]">{brand.name?.charAt(0)}</span>
        )}
      </div>
      <h3 className="mt-4 font-semibold text-gray-950">{brand.name}</h3>
      <p className="mt-1 text-xs text-gray-500">{brand.product_count || 0} products</p>
      {featured && <span className="mt-3 inline-flex rounded-full bg-[#FFF4CC] px-3 py-1 text-xs text-[#8A541E]">Featured</span>}
    </button>
  );
}

export default Brands;
