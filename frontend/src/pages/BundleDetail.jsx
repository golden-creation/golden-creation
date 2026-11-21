import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { useAppStore } from "../context/AppContext";
import { formatCurrency, getBundleBySlug } from "../lib/api";

function BundleDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart, currentUser } = useAppStore();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    setLoading(true);

    getBundleBySlug(slug)
      .then((payload) => {
        if (!ignore) {
          setBundle(payload);
          setError("");
        }
      })
      .catch((loadError) => {
        if (!ignore) setError(loadError.message || "Unable to load bundle");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [slug]);

  const addBundle = () => {
    if (!bundle) return;

    if (!currentUser) {
      navigate("/login", { state: { from: `/bundles/${slug}` } });
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
        bundleItems: bundle.items || [],
      },
      1
    );
    navigate("/cart");
  };

  return (
    <div className="min-h-screen bg-[#FBF8F2]">
      <Navbar />
      {loading ? (
        <main className="mx-auto max-w-7xl px-4 py-12 text-sm text-gray-500">Loading bundle...</main>
      ) : error || !bundle ? (
        <main className="mx-auto max-w-7xl px-4 py-12">
          <div className="rounded-xl border border-[#C2863F] bg-[#FFF4CC] p-5 text-sm text-[#7A4D18]">{error || "Bundle not found"}</div>
        </main>
      ) : (
        <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:grid-cols-[1fr_420px] md:px-8">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex min-h-[280px] items-center justify-center rounded-xl bg-[#F7F5EF]">
              {bundle.imageUrl ? <img src={bundle.imageUrl} alt={bundle.name} className="max-h-[320px] w-full object-contain" /> : <span className="text-gray-400">Bundle</span>}
            </div>
            <h1 className="mt-6 text-3xl font-bold">{bundle.name}</h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">{bundle.description || "A curated Golden Creation bundle."}</p>
          </section>

          <aside className="h-fit rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8A541E]">Bundle product</p>
            <div className="mt-3">
              {bundle.comparePrice > bundle.price && <p className="text-sm text-gray-400 line-through">{formatCurrency(bundle.comparePrice)}</p>}
              <p className="text-3xl font-bold text-[#C2863F]">{formatCurrency(bundle.price)}</p>
            </div>
            <button onClick={addBundle} className="mt-5 w-full rounded-lg bg-[#C2863F] px-5 py-3 text-sm font-semibold text-white">Add Bundle to Cart</button>

            <div className="mt-6">
              <h2 className="font-semibold">Included products</h2>
              <div className="mt-3 space-y-3">
                {(bundle.items || []).map((item) => (
                  <div key={`${item.productId}-${item.variantId || "default"}`} className="flex gap-3 rounded-lg border p-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-[#FBF8F2]">
                      {item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-contain" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-semibold">{item.name}</p>
                      <p className="text-xs text-gray-500">Qty {item.quantity || 1} - {item.categoryName || item.brandName || "Product"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </main>
      )}
      <Footer />
    </div>
  );
}

export default BundleDetail;
