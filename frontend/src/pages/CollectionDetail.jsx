import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import ProductRating from "../components/ProductRating";
import PriceOffer from "../components/PriceOffer";
import { getCollectionBySlug, getVariantFilters, productPath } from "../lib/api";

function CollectionDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [sortBy, setSortBy] = useState("featured");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [variantFilters, setVariantFilters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    setLoading(true);

    getCollectionBySlug(slug)
      .then((payload) => {
        if (ignore) return;
        setCollection(payload.collection);
        setProducts(payload.products);
        setError("");
        document.title = payload.collection?.seo_title || `${payload.collection?.name || "Collection"} | Golden Creation`;
        let meta = document.querySelector("meta[name='description']");
        if (!meta) {
          meta = document.createElement("meta");
          meta.setAttribute("name", "description");
          document.head.appendChild(meta);
        }
        meta.setAttribute("content", payload.collection?.seo_description || payload.collection?.description || `Shop ${payload.collection?.name || "collection"} products on Golden Creation.`);
        let canonical = document.querySelector("link[rel='canonical']");
        if (!canonical) {
          canonical = document.createElement("link");
          canonical.setAttribute("rel", "canonical");
          document.head.appendChild(canonical);
        }
        canonical.setAttribute("href", `${window.location.origin}/collections/${slug}`);
      })
      .catch((loadError) => setError(loadError.message || "Unable to load collection"))
      .finally(() => !ignore && setLoading(false));

    return () => {
      ignore = true;
    };
  }, [slug]);

  useEffect(() => {
    let ignore = false;
    getVariantFilters()
      .then((filters) => {
        if (!ignore) setVariantFilters(filters);
      })
      .catch(() => {
        if (!ignore) setVariantFilters([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.categoryName).filter(Boolean))].sort(),
    [products]
  );
  const brands = useMemo(
    () => [...new Set(products.map((product) => product.brandName || product.brand).filter(Boolean))].sort(),
    [products]
  );
  const availableVariantFilters = useMemo(() => {
    const valuesInCollection = new Map();

    products.forEach((product) => {
      (product.variants || []).forEach((variant) => {
        (variant.options || []).forEach((option) => {
          const key = String(option.optionName || option.name || "").toLowerCase();
          const values = valuesInCollection.get(key) || new Set();
          values.add(String(option.value || ""));
          valuesInCollection.set(key, values);
        });
      });
    });

    return variantFilters
      .map((filter) => ({
        ...filter,
        values: (filter.values || []).filter((value) =>
          valuesInCollection.get(String(filter.name || "").toLowerCase())?.has(String(value.value || ""))
        ),
      }))
      .filter((filter) => filter.values.length);
  }, [products, variantFilters]);

  const toggleArrayFilter = (setter, value) => {
    setter((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  };

  const toggleVariantFilter = (optionName, value) => {
    setSelectedVariants((current) => {
      const values = current[optionName] || [];
      return {
        ...current,
        [optionName]: values.includes(value)
          ? values.filter((item) => item !== value)
          : [...values, value],
      };
    });
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedCategories([]);
    setSelectedBrands([]);
    setSelectedVariants({});
  };

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = products.filter((product) => {
      const searchable = [
        product.name,
        product.description,
        product.categoryName,
        product.brandName,
        ...(product.tags || []),
      ].join(" ").toLowerCase();

      const matchesSearch = !query || searchable.includes(query);
      const matchesCategory =
        !selectedCategories.length || selectedCategories.includes(product.categoryName);
      const matchesBrand =
        !selectedBrands.length || selectedBrands.includes(product.brandName || product.brand);
      const matchesVariants = Object.entries(selectedVariants).every(([optionName, values]) => {
        if (!values.length) return true;
        return (product.variants || []).some((variant) =>
          (variant.options || []).some(
            (option) =>
              String(option.optionName || option.name || "").toLowerCase() === optionName.toLowerCase() &&
              values.includes(String(option.value || ""))
          )
        );
      });

      return matchesSearch && matchesCategory && matchesBrand && matchesVariants;
    });

    if (sortBy === "price-low") return [...filtered].sort((a, b) => a.price - b.price);
    if (sortBy === "price-high") return [...filtered].sort((a, b) => b.price - a.price);
    if (sortBy === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }, [products, search, selectedBrands, selectedCategories, selectedVariants, sortBy]);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      {loading ? (
        <main className="mx-auto max-w-7xl px-4 py-12 text-sm text-gray-500">Loading collection...</main>
      ) : error || !collection ? (
        <main className="mx-auto max-w-7xl px-4 py-12">
          <div className="rounded-xl border border-[#C2863F] bg-[#FFF4CC] p-5 text-sm text-[#7a4d18]">{error || "Collection not found"}</div>
        </main>
      ) : (
        <main>
          <section className="relative overflow-hidden border-b bg-[#FBF8F2]">
            {collection.banner && <img src={collection.banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
            <div className="relative mx-auto max-w-7xl px-4 py-14 md:px-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#C2863F]">{collection.type} collection</p>
              <h1 className="mt-2 max-w-3xl text-3xl font-bold text-gray-950 md:text-4xl">{collection.name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">{collection.description || `Shop ${collection.name} products on Golden Creation.`}</p>
            </div>
          </section>

          <section className="mx-auto max-w-7xl px-4 py-8 md:px-8">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold">{visibleProducts.length}</span> products
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={() => setMobileFiltersOpen((current) => !current)} className="rounded-lg border px-3 py-2 text-sm md:hidden">
                  Filters
                </button>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this collection" className="rounded-lg border px-3 py-2 text-sm" />
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                  <option value="featured">Featured</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name">Name: A to Z</option>
                </select>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
              <aside className={`${mobileFiltersOpen ? "block" : "hidden"} h-fit rounded-xl border bg-white p-4 shadow-sm lg:block`}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Filters</h2>
                  <button onClick={clearFilters} className="text-xs font-semibold text-[#8A541E]">Clear</button>
                </div>
                <FilterGroup title="Categories" options={categories} selected={selectedCategories} onToggle={(value) => toggleArrayFilter(setSelectedCategories, value)} />
                <FilterGroup title="Brands" options={brands} selected={selectedBrands} onToggle={(value) => toggleArrayFilter(setSelectedBrands, value)} />
                {availableVariantFilters.map((filter) => (
                  <FilterGroup
                    key={filter.id || filter.name}
                    title={filter.name}
                    options={filter.values.map((value) => value.value)}
                    selected={selectedVariants[filter.name] || []}
                    onToggle={(value) => toggleVariantFilter(filter.name, value)}
                  />
                ))}
                {!categories.length && !brands.length && !availableVariantFilters.length && (
                  <p className="text-sm text-gray-500">Filters will appear as products get categories, brands, or variants.</p>
                )}
              </aside>

              {visibleProducts.length ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {visibleProducts.map((product) => (
                  <button key={product.id} onClick={() => navigate(productPath(product))} className="rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-[#C2863F] hover:shadow-md">
                    <div className="flex h-40 items-center justify-center rounded-lg bg-[#FBF8F2]">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-3" /> : <span className="text-xs text-gray-400">No image</span>}
                    </div>
                    <ProductRating product={product} className="mt-3" />
                    <p className="mt-2 text-xs uppercase tracking-wide text-gray-400">{product.brandName || product.categoryName}</p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-semibold">{product.name}</h3>
                    <PriceOffer className="mt-2" price={product.price} comparePrice={product.comparePrice} mrp={product.mrp} percent={product.discountPercent} />
                    {!!product.tags?.length && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {product.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-[#FFF4DC] px-2 py-0.5 text-[10px] text-[#7A4D18]">{tag}</span>)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-500">No products matched this collection filter.</div>
            )}
            </div>
          </section>
        </main>
      )}
      <Footer />
    </div>
  );
}

function FilterGroup({ title, options, selected, onToggle }) {
  if (!options.length) return null;

  return (
    <div className="border-t py-4 first:border-t-0 first:pt-0">
      <p className="mb-3 text-sm font-semibold text-[#242414]">{title}</p>
      <div className="space-y-2">
        {options.map((option) => (
          <label key={option} className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
              className="h-4 w-4 rounded border-gray-300 accent-[#C2863F]"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default CollectionDetail;
