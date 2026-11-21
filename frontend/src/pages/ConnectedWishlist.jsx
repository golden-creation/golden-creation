import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import cartIcon from "../assets/shopping-cart.png";
import { useAppStore } from "../context/AppContext";
import { formatCurrency, getProducts, productPath } from "../lib/api";

function ConnectedWishlist() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { addToCart, wishlistItems, removeFromWishlist, clearWishlist } = useAppStore();

  useEffect(() => {
    let ignore = false;

    const loadSuggestions = async () => {
      try {
        const response = await getProducts();

        if (!ignore) {
          setProducts(response.slice(0, 6));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadSuggestions();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#f7f7f7] px-4 py-6 md:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Your Wishlist</h2>
              <p className="text-xs text-gray-500">
                Saved products stay in sync across the storefront using local app state.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {wishlistItems.length > 0 && (
                <button
                  onClick={clearWishlist}
                  className="rounded-lg border border-[#404C31] px-4 py-2 text-[#404C31]"
                >
                  Clear Wishlist
                </button>
              )}
              <button
                onClick={() => navigate("/writing-essentials")}
                className="rounded-lg bg-[#C2863F] px-4 py-2 text-white"
              >
                Continue Shopping
              </button>
            </div>
          </div>

          {wishlistItems.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {wishlistItems.map((product) => (
                <div key={product.id} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex h-40 items-center justify-center rounded-lg bg-gray-50">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-sm text-gray-400">No image</span>
                    )}
                  </div>
                  <p className="mt-3 text-[10px] uppercase text-gray-400">
                    {product.categoryName}
                  </p>
                  <h3 className="text-sm font-semibold">{product.name}</h3>
                  <p className="mt-1 font-semibold text-[#C2863F]">
                    {formatCurrency(product.price)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        addToCart(product, 1);
                        navigate("/cart");
                      }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#C2863F] py-2 text-xs text-white"
                    >
                      <img src={cartIcon} className="w-4" />
                      Move to Cart
                    </button>
                    <button
                      onClick={() => removeFromWishlist(product.id)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : loading ? (
            <p className="text-sm text-gray-500">Loading suggestions...</p>
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-gray-500">
                Your wishlist is empty. Save items from any product page to see them here.
              </div>
              <div>
                <h3 className="mb-4 text-sm font-semibold text-gray-700">
                  Suggested products for you
                </h3>
                <div className="grid gap-4 md:grid-cols-3">
                  {products.map((product) => (
                    <div key={product.id} className="rounded-xl bg-white p-4 shadow-sm">
                      <div className="flex h-40 items-center justify-center rounded-lg bg-gray-50">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-sm text-gray-400">No image</span>
                        )}
                      </div>
                      <p className="mt-3 text-[10px] uppercase text-gray-400">
                        {product.categoryName}
                      </p>
                      <h3 className="text-sm font-semibold">{product.name}</h3>
                      <p className="mt-1 font-semibold text-[#C2863F]">
                        {formatCurrency(product.price)}
                      </p>
                      <button
                        onClick={() => navigate(productPath(product))}
                        className="mt-3 w-full rounded-lg border border-[#C2863F] py-2 text-xs text-[#C2863F]"
                      >
                        View Product
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}

export default ConnectedWishlist;
