import { createContext, useContext, useEffect, useState } from "react";

import {
  addCustomerWishlistItem,
  clearCustomerCart,
  createCustomerAddress,
  createOrder,
  getCustomerState,
  getCustomerOrders,
  logoutCustomerSession,
  removeCustomerAddress,
  removeCustomerCartItem,
  removeCustomerWishlistItem,
  setDefaultCustomerAddress,
  updateCustomerAddress,
  upsertCustomerCartItem,
  validateCartDiscount,
  analyticsItem,
  pushDataLayer,
} from "../lib/api";

const AppContext = createContext(null);

function syncRequest(promise) {
  return promise.catch(() => undefined);
}

const STORAGE_KEYS = {
  user: "lekhanmart.user",
  cart: "lekhanmart.cart",
  orders: "lekhanmart.orders",
  discount: "lekhanmart.discount",
  wishlist: "lekhanmart.wishlist",
  addresses: "lekhanmart.addresses",
};

function readStorage(key, fallbackValue) {
  if (typeof window === "undefined") {
    return fallbackValue;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallbackValue;
  } catch (error) {
    console.error(`Unable to read ${key} from storage`, error);
    return fallbackValue;
  }
}

function writeStorage(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function normaliseStoreItem(product) {
  if (product?.isBundle || product?.itemType === "Bundle") {
    const bundleId = product.bundleId || product.id || Date.now();
    return {
      id: `bundle-${bundleId}`,
      productId: null,
      variantId: null,
      cartKey: product.cartKey || `bundle-${product.bundleType || "preset"}-${bundleId}`,
      itemType: "Bundle",
      isBundle: true,
      bundleType: product.bundleType || "Preset",
      bundleName: product.bundleName || product.name || "Custom Bundle",
      bundleItems: Array.isArray(product.bundleItems) ? product.bundleItems : [],
      variantSku: "",
      variantTitle: "",
      variantOptions: [],
      name: product.name || product.bundleName || "Custom Bundle",
      description: product.description || "",
      categoryId: 0,
      categoryName: product.categoryName || "Bundle",
      price: Number(product.price) || 0,
      imageUrl: product.imageUrl || product.image || "",
      stock: Number(product.stock || 999) || 999,
    };
  }

  const selectedVariant =
    product.selectedVariant ||
    product.variant ||
    product.defaultVariant ||
    null;
  const productId = Number(product.productId || product.product_id || product.id);
  const variantId = Number(product.variantId || product.variant_id || selectedVariant?.id) || null;
  const variantOptions =
    product.variantOptions ||
    product.variant_options ||
    selectedVariant?.options ||
    [];

  return {
    id: productId,
    productId,
    variantId,
    cartKey: variantId ? `product-${productId}-variant-${variantId}` : `product-${productId}`,
    variantSku: product.variantSku || product.variant_sku || selectedVariant?.sku || "",
    variantTitle:
      product.variantTitle ||
      product.variant_title ||
      selectedVariant?.optionSummary ||
      (Array.isArray(variantOptions)
        ? variantOptions.map((option) => `${option.optionName || option.name}: ${option.value}`).join(" / ")
        : ""),
    variantOptions,
    name: product.name,
    description: product.description || "",
    categoryId: Number(product.categoryId || product.category_id || 0),
    categoryName: product.categoryName || product.category_name || "",
    price: Number(selectedVariant?.price ?? product.price) || 0,
    comparePrice: selectedVariant?.comparePrice || product.comparePrice || null,
    mrp: product.mrp || null,
    discountPercent: product.discountPercent || 0,
    imageUrl: selectedVariant?.image || product.imageUrl || product.image || "",
    stock: Number(selectedVariant?.stock ?? product.stock ?? product.stock_quantity ?? 0) || 0,
  };
}

function toCartItem(product, quantity) {
  return {
    ...normaliseStoreItem(product),
    quantity: Math.max(1, Number(quantity) || 1),
  };
}

function hasKnownInsufficientStock(item, quantity = item?.quantity) {
  if (!item || item.isBundle) return false;
  if (item.stock === undefined || item.stock === null || item.stock === "") return false;
  return Number(item.stock || 0) <= 0 || Number(item.stock || 0) < Math.max(1, Number(quantity) || 1);
}

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() =>
    readStorage(STORAGE_KEYS.user, null)
  );
  const [cartItems, setCartItems] = useState(() =>
    readStorage(STORAGE_KEYS.cart, [])
  );
  const [orders, setOrders] = useState(() =>
    readStorage(STORAGE_KEYS.orders, [])
  );
  const [discountState, setDiscountState] = useState(() =>
    readStorage(STORAGE_KEYS.discount, {
      code: "",
      appliedDiscount: null,
      appliedDiscounts: [],
      totals: null,
      message: "",
    })
  );
  const [wishlistItems, setWishlistItems] = useState(() =>
    readStorage(STORAGE_KEYS.wishlist, [])
  );
  const [addresses, setAddresses] = useState(() =>
    readStorage(STORAGE_KEYS.addresses, [])
  );

  useEffect(() => {
    writeStorage(STORAGE_KEYS.user, currentUser);
  }, [currentUser]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.cart, cartItems);
  }, [cartItems]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.orders, orders);
  }, [orders]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.discount, discountState);
  }, [discountState]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.wishlist, wishlistItems);
  }, [wishlistItems]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.addresses, addresses);
  }, [addresses]);

  useEffect(() => {
    if (currentUser) {
      return;
    }

    setCartItems([]);
    setWishlistItems([]);
    setDiscountState({
      code: "",
      appliedDiscount: null,
      appliedDiscounts: [],
      totals: null,
      message: "",
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.email && !currentUser?.phone) {
      return;
    }

    let cancelled = false;

    getCustomerOrders({
      email: currentUser.email,
      phone: currentUser.phone,
    })
      .then((backendOrders) => {
        if (!cancelled && backendOrders.length) {
          setOrders(backendOrders);
        }
      })
      .catch((error) => {
        console.log("Unable to sync orders", error);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.email, currentUser?.phone]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;

    getCustomerState()
      .then(async (state) => {
        if (cancelled) return;

        const remoteCart = Array.isArray(state.cart) ? state.cart : [];
        const cartByKey = new Map(
          remoteCart.map((item) => [item.cartKey || `product-${item.id}`, item])
        );
        cartItems.forEach((item) => {
          const key = item.cartKey || `product-${item.id}`;
          const remote = cartByKey.get(key);
          if (!remote || Number(item.quantity) > Number(remote.quantity)) {
            cartByKey.set(key, item);
          }
        });
        const mergedCart = Array.from(cartByKey.values());
        setCartItems(mergedCart);
        await Promise.all(
          mergedCart.map((item) =>
            upsertCustomerCartItem(item.cartKey || `product-${item.id}`, item)
          )
        );

        const wishlistById = new Map(
          (Array.isArray(state.wishlist) ? state.wishlist : []).map((item) => [
            Number(item.id),
            normaliseStoreItem(item),
          ])
        );
        wishlistItems.forEach((item) => wishlistById.set(Number(item.id), item));
        const mergedWishlist = Array.from(wishlistById.values());
        setWishlistItems(mergedWishlist);
        await Promise.all(
          mergedWishlist.map((item) => addCustomerWishlistItem(item.id))
        );

        const remoteAddresses = (Array.isArray(state.addresses)
          ? state.addresses
          : []
        ).map((address) => ({
          id: Number(address.id),
          type: address.tag || "HOME",
          name: address.name,
          address: [address.line1, address.line2, address.city, address.state, address.postalCode]
            .filter(Boolean)
            .join(", "),
          line1: address.line1 || "",
          line2: address.line2 || "",
          city: address.city || "",
          state: address.state || "",
          postalCode: address.postalCode || "",
          phone: address.phone,
          isDefault: Boolean(address.isPrimary),
        }));
        if (remoteAddresses.length) {
          setAddresses(remoteAddresses);
        } else if (addresses.length) {
          const created = await Promise.all(
            addresses.map((address) =>
              createCustomerAddress({
                name: address.name,
                tag: address.type,
                line1: address.address,
                phone: address.phone,
                isPrimary: address.isDefault,
              })
            )
          );
          setAddresses(
            created.map(({ address }) => ({
              id: Number(address.id),
              type: address.tag,
              name: address.name,
              address: [address.line1, address.line2, address.city, address.state, address.postalCode]
                .filter(Boolean)
                .join(", "),
              line1: address.line1 || "",
              line2: address.line2 || "",
              city: address.city || "",
              state: address.state || "",
              postalCode: address.postalCode || "",
              phone: address.phone,
              isDefault: Boolean(address.isPrimary),
            }))
          );
        }
      })
      .catch((error) => console.log("Unable to sync customer state", error));

    return () => {
      cancelled = true;
    };
    // Run once when the authenticated customer changes; local values are migration inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const cartCount = cartItems.reduce(
    (total, item) => total + (Number(item.quantity) || 0),
    0
  );

  const cartSubtotal = cartItems.reduce(
    (total, item) =>
      total + (Number(item.price) || 0) * (Number(item.quantity) || 0),
    0
  );

  const baseShippingFee = 0;
  const discountAmount = Number(discountState.totals?.discountAmount || 0);
  const productDiscountAmount = Number(discountState.totals?.productDiscountAmount ?? discountAmount);
  const shippingDiscountAmount = Number(discountState.totals?.shippingDiscountAmount || 0);
  const discountedSubtotal = Math.max(0, cartSubtotal - productDiscountAmount);
  const shippingFee = null;
  const taxAmount = null;
  const cartGrandTotal = discountedSubtotal;

  const applyDiscountCode = async (code, extra = {}) => {
    const normalizedCode = String(code || "").trim().toUpperCase();

    if (!normalizedCode) {
      throw new Error("Enter a coupon code");
    }

    const result = await validateCartDiscount({
      code: normalizedCode,
      items: cartItems,
      subtotal: cartSubtotal,
      shippingFee: 0,
      taxAmount: 0,
      customer: currentUser || {},
      ...extra,
    });

    setDiscountState({
      code: normalizedCode,
      appliedDiscount: result.appliedDiscount || null,
      appliedDiscounts: result.appliedDiscounts || [],
      totals: result.totals || null,
      message: result.message || "Discount applied",
    });

    return result;
  };

  const removeDiscount = () => {
    setDiscountState({
      code: "",
      appliedDiscount: null,
      appliedDiscounts: [],
      totals: null,
      message: "",
    });
  };

  useEffect(() => {
    if (!cartItems.length || discountState.code) {
      return;
    }

    let cancelled = false;

    validateCartDiscount({
      code: "",
      items: cartItems,
      subtotal: cartSubtotal,
      shippingFee: 0,
      taxAmount: 0,
      customer: currentUser || {},
    })
      .then((result) => {
        if (cancelled) return;

        if (result.valid && Number(result.totals?.discountAmount || 0) > 0) {
          setDiscountState((current) => {
            const nextDiscount = result.appliedDiscount || null;
            if (
              current.appliedDiscount?.id === nextDiscount?.id &&
              Number(current.totals?.discountAmount || 0) === Number(result.totals?.discountAmount || 0)
            ) {
              return current;
            }

            return {
              code: "",
              appliedDiscount: nextDiscount,
              appliedDiscounts: result.appliedDiscounts || [],
              totals: result.totals || null,
              message: result.message || "Automatic discount applied",
            };
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [cartItems, cartSubtotal, baseShippingFee, currentUser, discountState.code]);

  const addToCart = (product, quantity = 1) => {
    if (!currentUser) {
      return false;
    }

    const nextItem = toCartItem(product, quantity);
    if (hasKnownInsufficientStock(nextItem)) {
      return false;
    }

    pushDataLayer("add_to_cart", {
      ecommerce: {
        currency: "INR",
        value: Number(nextItem.price || 0) * Number(nextItem.quantity || 1),
        items: [analyticsItem(nextItem, nextItem.quantity)],
      },
    });

    setCartItems((previousItems) => {
      const existingItem = previousItems.find(
        (item) => (item.cartKey || `product-${item.id}`) === nextItem.cartKey
      );

      if (!existingItem) {
        void syncRequest(upsertCustomerCartItem(nextItem.cartKey, nextItem));
        return [...previousItems, nextItem];
      }

      if (hasKnownInsufficientStock(existingItem, existingItem.quantity + nextItem.quantity)) {
        return previousItems;
      }

      const updated = {
        ...existingItem,
        quantity: existingItem.quantity + nextItem.quantity,
      };
      void syncRequest(upsertCustomerCartItem(nextItem.cartKey, updated));
      return previousItems.map((item) =>
        (item.cartKey || `product-${item.id}`) === nextItem.cartKey
          ? updated
          : item
      );
    });

    return true;
  };

  const updateCartQuantity = (cartKey, quantity) => {
    setCartItems((previousItems) => previousItems.map((item) => {
      if ((item.cartKey || `product-${item.id}`) !== cartKey && item.id !== cartKey) {
        return item;
      }
      const updated = { ...item, quantity: Math.max(1, Number(quantity) || 1) };
      if (hasKnownInsufficientStock(updated)) {
        return item;
      }
      void syncRequest(
        upsertCustomerCartItem(updated.cartKey || `product-${updated.id}`, updated)
      );
      return updated;
    }));
  };

  const removeFromCart = (cartKey) => {
    void syncRequest(removeCustomerCartItem(cartKey));
    setCartItems((previousItems) =>
      previousItems.filter(
        (item) => (item.cartKey || `product-${item.id}`) !== cartKey && item.id !== cartKey
      )
    );
  };

  const clearCart = () => {
    void syncRequest(clearCustomerCart());
    setCartItems([]);
    removeDiscount();
  };

  const isInWishlist = (productId) =>
    wishlistItems.some((item) => item.id === Number(productId));

  const addToWishlist = (product) => {
    if (!currentUser) {
      return false;
    }

    const nextItem = normaliseStoreItem(product);

    setWishlistItems((previousItems) => {
      if (previousItems.some((item) => item.id === nextItem.id)) {
        return previousItems;
      }

      void syncRequest(addCustomerWishlistItem(nextItem.id));
      return [nextItem, ...previousItems];
    });

    return true;
  };

  const removeFromWishlist = (productId) => {
    void syncRequest(removeCustomerWishlistItem(productId));
    setWishlistItems((previousItems) =>
      previousItems.filter((item) => item.id !== Number(productId))
    );
  };

  const toggleWishlist = (product) => {
    if (!currentUser) {
      return false;
    }

    const nextItem = normaliseStoreItem(product);
    let added = false;

    setWishlistItems((previousItems) => {
      if (previousItems.some((item) => item.id === nextItem.id)) {
        void syncRequest(removeCustomerWishlistItem(nextItem.id));
        return previousItems.filter((item) => item.id !== nextItem.id);
      }

      added = true;
      void syncRequest(addCustomerWishlistItem(nextItem.id));
      return [nextItem, ...previousItems];
    });

    return added;
  };

  const clearWishlist = () => {
    wishlistItems.forEach((item) => {
      void syncRequest(removeCustomerWishlistItem(item.id));
    });
    setWishlistItems([]);
  };

  const addAddress = (address) => {
    setAddresses((previousAddresses) => {
      const nextAddress = {
        id: Date.now(),
        ...address,
        line1: address.line1 || address.address || "",
        line2: address.line2 || "",
        city: address.city || "",
        state: address.state || "",
        postalCode: address.postalCode || address.zipCode || "",
        address:
          address.address ||
          [address.line1, address.line2, address.city, address.state, address.postalCode || address.zipCode]
            .filter(Boolean)
            .join(", "),
        isDefault: previousAddresses.length === 0,
      };
      void syncRequest(
        createCustomerAddress({
          name: nextAddress.name,
          tag: nextAddress.type,
          line1: nextAddress.line1 || nextAddress.address,
          line2: nextAddress.line2,
          city: nextAddress.city,
          state: nextAddress.state,
          postalCode: nextAddress.postalCode,
          phone: nextAddress.phone,
          isPrimary: nextAddress.isDefault,
        }).then(({ address: saved }) => {
          setAddresses((current) =>
            current.map((item) =>
              item.id === nextAddress.id
                ? {
                    ...item,
                    id: Number(saved.id),
                    line1: saved.line1 || item.line1 || "",
                    line2: saved.line2 || item.line2 || "",
                    city: saved.city || item.city || "",
                    state: saved.state || item.state || "",
                    postalCode: saved.postalCode || item.postalCode || "",
                    address: [saved.line1, saved.line2, saved.city, saved.state, saved.postalCode]
                      .filter(Boolean)
                      .join(", "),
                  }
                : item
            )
          );
        })
      );

      if (nextAddress.isDefault) {
        return [{ ...nextAddress, isDefault: true }];
      }

      return [...previousAddresses, nextAddress];
    });
  };

  const updateAddress = (addressId, changes) => {
    const current = addresses.find((address) => address.id === addressId);
    if (current) {
      const updated = { ...current, ...changes };
      void syncRequest(
        updateCustomerAddress(addressId, {
          name: updated.name,
          tag: updated.type,
          line1: updated.address,
          phone: updated.phone,
        })
      );
    }
    setAddresses((previousAddresses) =>
      previousAddresses.map((address) =>
        address.id === addressId ? { ...address, ...changes } : address
      )
    );
  };

  const deleteAddress = (addressId) => {
    void syncRequest(removeCustomerAddress(addressId));
    setAddresses((previousAddresses) => {
      const remainingAddresses = previousAddresses.filter(
        (address) => address.id !== addressId
      );

      if (remainingAddresses.length && !remainingAddresses.some((address) => address.isDefault)) {
        remainingAddresses[0] = {
          ...remainingAddresses[0],
          isDefault: true,
        };
      }

      return remainingAddresses;
    });
  };

  const setDefaultAddress = (addressId) => {
    void syncRequest(setDefaultCustomerAddress(addressId));
    setAddresses((previousAddresses) =>
      previousAddresses.map((address) => ({
        ...address,
        isDefault: address.id === addressId,
      }))
    );
  };

  const logout = () => {
    void syncRequest(logoutCustomerSession());
    setCurrentUser(null);
    setCartItems([]);
    setWishlistItems([]);
    removeDiscount();
  };

  const placeOrder = async (checkoutDetails, totals = {}) => {
    if (!cartItems.length) {
      return null;
    }

    const orderSubtotal = Number(totals.subtotal ?? cartSubtotal);
    const orderShippingFee = Number(totals.shippingFee ?? 0);
    const orderTaxAmount = Number(totals.taxAmount ?? 0);
    const orderTotal = Number(totals.totalAmount ?? orderSubtotal + orderShippingFee + orderTaxAmount);

    const backendOrder = await createOrder({
      userId: currentUser?.id,
      customer: {
        ...checkoutDetails,
        userId: currentUser?.id,
      },
      items: cartItems,
      subtotal: orderSubtotal,
      shippingFee: orderShippingFee,
      taxAmount: orderTaxAmount,
      discountCode:
        totals.discountCode ?? discountState.appliedDiscount?.code ?? "",
      discountAmount: Number(totals.discountAmount ?? discountAmount),
      totalAmount: orderTotal,
      idempotencyKey: checkoutDetails.idempotencyKey,
    });

    if (!backendOrder) {
      throw new Error("The order could not be created");
    }

    setOrders((previousOrders) => [backendOrder, ...previousOrders]);
    setCartItems([]);
    removeDiscount();

    return backendOrder;
  };

  const acceptCompletedOrder = (order) => {
    if (!order) return;
    setOrders((previousOrders) => [order, ...previousOrders]);
    setCartItems([]);
    removeDiscount();
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        logout,
        cartItems,
        cartCount,
        cartSubtotal,
        shippingFee,
        taxAmount,
        discountState,
        discountAmount,
        productDiscountAmount,
        shippingDiscountAmount,
        discountedSubtotal,
        cartGrandTotal,
        applyDiscountCode,
        removeDiscount,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        wishlistItems,
        addToWishlist,
        removeFromWishlist,
        toggleWishlist,
        clearWishlist,
        isInWishlist,
        addresses,
        addAddress,
        updateAddress,
        deleteAddress,
        setDefaultAddress,
        orders,
        placeOrder,
        acceptCompletedOrder,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useAppStore must be used inside AppProvider");
  }

  return context;
}
