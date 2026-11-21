import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { useAppStore } from "../context/AppContext";
import { formatCurrency, getBundles, getProducts } from "../lib/api";

function BundleShopping() {
  const navigate = useNavigate();
  const { addToCart, currentUser } = useAppStore();
  const [bundles, setBundles] = useState([]);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [bundleName, setBundleName] = useState("");
  const [customItems, setCustomItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    let ignore = false;

    getBundles()
      .then((bundleRows) => {
        if (!ignore) setBundles(bundleRows);
      })
      .catch(() => {
        if (!ignore) setBundles([]);
      });

    getProducts({ limit: 120 })
      .then((productRows) => {
        if (!ignore) setProducts(productRows);
      })
      .catch(() => {
        if (!ignore) setProducts([]);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.categoryName).filter(Boolean))].sort(),
    [products]
  );
  const productMatches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products
      .filter((product) => !filter || product.categoryName === filter)
      .filter((product) =>
        !term ||
        [product.name, product.categoryName, product.brandName, product.description]
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 20);
  }, [filter, products, query]);
  const customTotal = customItems.reduce((sum, item) => sum + Number(item.price || 0), 0);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };

  const addPresetBundle = (bundle) => {
    if (!currentUser) {
      navigate("/login", { state: { from: "/bundles" } });
      return;
    }

    addToCart(
      {
        id: bundle.id,
        bundleId: bundle.id,
        name: bundle.name,
        bundleName: bundle.name,
        bundleType: "Preset",
        isBundle: true,
        itemType: "Bundle",
        description: bundle.description,
        price: bundle.price,
        imageUrl: bundle.imageUrl,
        bundleItems: bundle.items,
      },
      1
    );
    showToast("Bundle added to cart");
  };

  const toggleCustomItem = (product) => {
    setCustomItems((current) => {
      if (current.some((item) => item.id === product.id)) {
        return current.filter((item) => item.id !== product.id);
      }
      if (current.length >= 15) {
        showToast("A custom bundle can include up to 15 products");
        return current;
      }
      return [...current, product];
    });
  };

  const addCustomBundle = () => {
    if (!currentUser) {
      navigate("/login", { state: { from: "/bundles" } });
      return;
    }

    if (!customItems.length) {
      showToast("Select products for your custom bundle");
      return;
    }

    const id = window.crypto.randomUUID();
    addToCart(
      {
        id,
        bundleId: id,
        name: bundleName.trim() || "Custom Golden Creation Bundle",
        bundleName: bundleName.trim() || "Custom Golden Creation Bundle",
        bundleType: "Custom",
        isBundle: true,
        itemType: "Bundle",
        price: customTotal,
        imageUrl: customItems[0]?.imageUrl || "",
        bundleItems: customItems.map((product) => ({
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          imageUrl: product.imageUrl,
          categoryName: product.categoryName,
          brandName: product.brandName,
        })),
      },
      1
    );
    setCustomItems([]);
    setBundleName("");
    showToast("Custom bundle added to cart");
    navigate("/cart");
  };

  return (
    <div className="min-h-screen bg-[#FBF8F2]">
      <Navbar />
      {toast && <div className="fixed right-5 top-24 z-[1100] rounded-lg bg-black px-4 py-2 text-sm text-white">{toast}</div>}
      <main>
        <section className="bg-[#FFF49C] px-4 py-10 md:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8A541E]">Shop bundles</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-bold text-[#242414] md:text-5xl">Ready kits and custom bundles in one cart item</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-700">
              Pick a staff-curated bundle or build your own by selecting products. Bundles move through cart, checkout, and admin orders as one bundle line.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Curated bundle products</h2>
              <p className="text-sm text-gray-500">Admin-created bundles with included products listed inside each card.</p>
            </div>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm">
              <option value="">All Categories</option>
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {bundles.length ? bundles.map((bundle) => (
              <article key={bundle.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex h-40 items-center justify-center rounded-lg bg-[#F7F5EF]">
                  {bundle.imageUrl ? <img src={bundle.imageUrl} alt="" className="h-full w-full object-contain" /> : <span className="text-sm text-gray-400">Bundle</span>}
                </div>
                <h3 className="mt-3 text-lg font-semibold">{bundle.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{bundle.description || "A curated bundle from Golden Creation."}</p>
                <div className="mt-3 rounded-lg bg-[#FBF8F2] p-3">
                  <p className="text-xs font-semibold uppercase text-gray-500">Inside this bundle</p>
                  <ul className="mt-2 space-y-1 text-xs text-gray-600">
                    {(bundle.items || []).slice(0, 4).map((item) => <li key={`${bundle.id}-${item.productId}`}>{item.quantity} x {item.name}</li>)}
                  </ul>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    {bundle.comparePrice > bundle.price && <p className="text-xs text-gray-400 line-through">{formatCurrency(bundle.comparePrice)}</p>}
                    <p className="text-lg font-bold text-[#C2863F]">{formatCurrency(bundle.price)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/bundles/${bundle.slug}`)} className="rounded-lg border px-3 py-2 text-sm font-semibold text-[#8A541E]">Details</button>
                    <button onClick={() => addPresetBundle(bundle)} className="rounded-lg bg-[#C2863F] px-4 py-2 text-sm font-semibold text-white">Add</button>
                  </div>
                </div>
              </article>
            )) : (
              <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-gray-500 md:col-span-3">
                No curated bundles are available yet.
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-12 md:grid-cols-[1fr_380px] md:px-8">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-semibold">Create custom bundle</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products to add" className="rounded-lg border px-3 py-2 text-sm" />
              <input value={bundleName} onChange={(event) => setBundleName(event.target.value)} placeholder="Bundle name" className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {productMatches.length ? productMatches.map((product) => {
                const selected = customItems.some((item) => item.id === product.id);
                return (
                  <button key={product.id} onClick={() => toggleCustomItem(product)} className={`rounded-lg border p-3 text-left ${selected ? "border-[#C2863F] bg-[#FFF9C9]" : "bg-white hover:border-[#C2863F]"}`}>
                    <div className="flex h-28 items-center justify-center rounded bg-[#FBF8F2]">
                      {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-contain" />}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold">{product.name}</p>
                    <p className="text-xs text-gray-500">{product.categoryName}</p>
                    <p className="mt-1 text-sm font-bold text-[#C2863F]">{formatCurrency(product.price)}</p>
                  </button>
                );
              }) : (
                <div className="rounded-lg border border-dashed bg-[#FBF8F2] p-6 text-center text-sm text-gray-500 sm:col-span-2 lg:col-span-3">
                  No products available for custom bundles.
                </div>
              )}
            </div>
          </div>

          <aside className="h-fit rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Your bundle preview</h2>
            <p className="mt-1 text-xs text-gray-500">Select up to 15 products before adding the bundle to cart.</p>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {customItems.length ? customItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg bg-[#FBF8F2] p-2 text-sm">
                  <span className="line-clamp-1">{item.name}</span>
                  <button onClick={() => toggleCustomItem(item)} className="text-xs text-red-600">Remove</button>
                </div>
              )) : <p className="rounded-lg bg-[#FBF8F2] p-4 text-center text-sm text-gray-500">No products selected yet.</p>}
            </div>
            <div className="mt-4 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span>Products</span>
                <span>{customItems.length}/15</span>
              </div>
              <div className="mt-2 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{formatCurrency(customTotal)}</span>
              </div>
              <button onClick={addCustomBundle} className="mt-4 w-full rounded-lg bg-[#C2863F] px-4 py-3 text-sm font-semibold text-white">Add Custom Bundle</button>
            </div>
          </aside>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default BundleShopping;
