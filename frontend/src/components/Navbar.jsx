import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import logo from "../assets/golden-creation-official-logo.png";
import searchIcon from "../assets/search.png";
import heartIcon from "../assets/heart.png";
import cartIcon from "../assets/shopping-cart.png";
import menuIcon from "../assets/menu.png";
import caretDown from "../assets/caret-down.png";

import { useAppStore } from "../context/AppContext";
import {
  buildImageUrl,
  formatCurrency,
  getBrands,
  getCollections,
  getNavbarMenu,
  getProducts,
  productPath,
  pushDataLayer,
} from "../lib/api";
import { brandMenuChildren } from "../lib/brandCatalog";

const fallbackMenuItems = [
  { id: "art", title: "Art & Craft", url: "/writing-essentials?q=Art%20%26%20Craft", children: [] },
  { id: "computer", title: "Computer & Electronics Accessories", url: "/writing-essentials?category=479", children: [] },
  { id: "office", title: "Office Stationery", url: "/collections/office-essentials", children: [] },
  { id: "school", title: "School Stationery", url: "/writing-essentials?q=School%20Stationery", children: [] },
  { id: "all", title: "All Products", url: "/writing-essentials", children: [] },
  { id: "bundles", title: "Shop Bundles", url: "/bundles", children: [] },
  { id: "corporate", title: "Corporate Orders", url: "/corporate-orders", children: [] },
  { id: "brands", title: "Shop By Brand", url: "/brands", mega_menu: true, children: [] },
];

function removeBrandPenMenuItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => {
      const title = String(item?.title || "").trim().toLowerCase();
      const url = String(item?.url || "").toLowerCase();
      return title !== "brand pen" && !url.includes("category=440");
    })
    .map((item) => ({
      ...item,
      children: Array.isArray(item.children)
        ? removeBrandPenMenuItems(item.children)
        : [],
    }));
}

function isBrandMenuItem(item) {
  return (
    String(item?.title || "").toLowerCase().includes("brand") ||
    String(item?.url || "").replace(/\/$/, "") === "/brands"
  );
}

function hydrateBrandMenus(items, brands) {
  const children = brandMenuChildren(brands);

  return items.map((item) => ({
    ...item,
    children: isBrandMenuItem(item)
      ? children
      : Array.isArray(item.children)
      ? hydrateBrandMenus(item.children, brands)
      : [],
  }));
}

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuItems, setMenuItems] = useState(fallbackMenuItems);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] =
    useState(false);
  const [showSearchResults, setShowSearchResults] =
    useState(false);
  const [activeHeaderPopup, setActiveHeaderPopup] = useState(null);
  const navRef = useRef(null);
  const closePopupTimerRef = useRef(null);

  const {
    cartCount,
    cartItems,
    currentUser,
    logout,
    wishlistItems,
  } = useAppStore();

  const navigate = useNavigate();

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (navRef.current?.contains(event.target)) return;
      setActiveMenuId(null);
      setActiveHeaderPopup(null);
      setShowSearchResults(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick, { passive: true });

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
      window.clearTimeout(closePopupTimerRef.current);
    };
  }, []);

  const openHeaderPopup = (popupId) => {
    window.clearTimeout(closePopupTimerRef.current);
    setActiveHeaderPopup(popupId);
  };

  const closeHeaderPopup = () => {
    window.clearTimeout(closePopupTimerRef.current);
    closePopupTimerRef.current = window.setTimeout(() => {
      setActiveHeaderPopup(null);
    }, 220);
  };

  useEffect(() => {
    let ignore = false;

    Promise.all([
      getNavbarMenu().catch(() => []),
      getBrands({ sort: "name" })
        .then((brands) => ({ ok: true, brands }))
        .catch(() => ({ ok: false, brands: [] })),
    ])
      .then(([items, brandResult]) => {
        if (!ignore) {
          const filteredItems = removeBrandPenMenuItems(items);
          const sourceItems = filteredItems.length ? filteredItems : fallbackMenuItems;
          const brandChildren = brandResult.ok
            ? null
            : [{ id: "brand-error", title: "Brands could not be loaded", url: "/brands", children: [] }];
          setMenuItems(
            brandResult.ok
              ? hydrateBrandMenus(sourceItems, brandResult.brands)
              : sourceItems.map((item) => ({
                  ...item,
                  children: isBrandMenuItem(item) ? brandChildren : item.children || [],
                }))
          );
        }
      })
      .catch(() => {
        if (!ignore) {
          setMenuItems(fallbackMenuItems);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const term = search.trim().toLowerCase();

    if (term.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }

    let ignore = false;

    setSearchLoading(true);

    const timeoutId = window.setTimeout(() => {
      Promise.all([getProducts(), getBrands({ sort: "name" }), getCollections({ limit: 100 })])
        .then(([items, brands, collections]) => {
          if (ignore) return;

          const brandMatches = brands
            .filter((brand) => `${brand.name} ${brand.description || ""}`.toLowerCase().includes(term))
            .slice(0, 3)
            .map((brand) => ({ ...brand, type: "brand" }));

          const productMatches = items
            .filter((product) => {
              const searchableText = [
                product.name,
                product.categoryName,
                product.brand,
                product.brandName,
                product.description,
              ]
                .join(" ")
                .toLowerCase();

              return searchableText.includes(term);
            })
            .slice(0, 6)
            .map((product) => ({ ...product, type: "product" }));

          const collectionMatches = collections
            .filter((collection) => `${collection.name} ${collection.description || ""}`.toLowerCase().includes(term))
            .slice(0, 3)
            .map((collection) => ({ ...collection, type: "collection" }));

          setSearchResults([...brandMatches, ...collectionMatches, ...productMatches].slice(0, 7));
        })
        .catch(() => {
          if (!ignore) {
            setSearchResults([]);
          }
        })
        .finally(() => {
          if (!ignore) {
            setSearchLoading(false);
          }
        });
    }, 250);

    return () => {
      ignore = true;
      window.clearTimeout(timeoutId);
    };
  }, [search]);

  const handleSearch = () => {
    const term = search.trim();

    if (!term) {
      navigate("/writing-essentials");
      return;
    }

    navigate(
      `/writing-essentials?q=${encodeURIComponent(
        term
      )}`
    );

    pushDataLayer("search", { search_term: term });

    setOpen(false);
    setShowSearchResults(false);
  };

  const handleSearchSelect = (item) => {
    navigate(
      item.type === "brand"
        ? `/brand/${item.slug}`
        : item.type === "collection"
        ? `/collections/${item.slug}`
        : productPath(item)
    );

    setSearch("");
    setOpen(false);
    setShowSearchResults(false);
  };

  const userLabel =
    currentUser?.name
      ?.trim()
      ?.charAt(0)
      ?.toUpperCase() ||
    currentUser?.email
      ?.trim()
      ?.charAt(0)
      ?.toUpperCase();
  const profileImageUrl = currentUser?.profileImage || currentUser?.profile_image || currentUser?.image;

  const navItemClass =
    "w-full max-w-full rounded-full px-2 py-1.5 text-center text-[10px] font-semibold leading-tight tracking-wide text-white transition-all duration-200 hover:bg-white hover:text-[#A06422] border border-transparent hover:border-white/40 lg:text-[11px] xl:px-2.5";

  const handleMenuNavigate = (item) => {
    if (!item?.url) return;

    if (/^https?:\/\//i.test(item.url)) {
      window.open(item.url, "_blank", "noopener,noreferrer");
    } else {
      navigate(item.url);
    }

    setOpen(false);
    setActiveMenuId(null);
  };

  return (
    <nav ref={navRef} className="sticky top-0 z-[1000] border-b border-[#E8DDBF] bg-white/95 shadow-sm backdrop-blur">
      <div className="relative z-[1100] px-3 py-3 md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <img
            src={logo}
            alt="Golden Creation"
            onClick={() => navigate("/")}
            className="h-9 max-w-[210px] cursor-pointer object-contain md:h-14 md:max-w-none"
          />

          <div className="relative hidden min-w-[320px] max-w-xl flex-1 md:block">
            <SearchBox
              value={search}
              placeholder="Search pens, notebooks, art supplies..."
              onChange={(value) => {
                setSearch(value);
                setShowSearchResults(true);
              }}
              onSubmit={handleSearch}
              onFocus={() =>
                setShowSearchResults(true)
              }
              onBlur={() =>
                window.setTimeout(
                  () => setShowSearchResults(false),
                  120
                )
              }
            />

            <SearchResults
              visible={showSearchResults}
              query={search}
              loading={searchLoading}
              results={searchResults}
              onSelect={handleSearchSelect}
              onViewAll={handleSearch}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            <HeaderHoverAction
              id="wishlist"
              icon={heartIcon}
              count={wishlistItems.length}
              onClick={() => navigate("/wishlist")}
              label="Wishlist"
              countClass="bg-[#404C31]"
              activePopup={activeHeaderPopup}
              onOpen={openHeaderPopup}
              onClose={closeHeaderPopup}
            >
              <PopupTitle title="Wishlist" meta={`${wishlistItems.length} product${wishlistItems.length === 1 ? "" : "s"}`} />
              <MiniItemList items={wishlistItems} emptyText="Your wishlist is empty." />
              <PopupButton onClick={() => navigate("/wishlist")}>View Wishlist</PopupButton>
            </HeaderHoverAction>

            <HeaderHoverAction
              id="cart"
              icon={cartIcon}
              count={cartCount}
              onClick={() => navigate("/cart")}
              label="Cart"
              countClass="bg-[#C2863F]"
              activePopup={activeHeaderPopup}
              onOpen={openHeaderPopup}
              onClose={closeHeaderPopup}
            >
              <PopupTitle title="Cart" meta={`${cartCount} item${cartCount === 1 ? "" : "s"}`} />
              <MiniItemList items={cartItems} emptyText="Your cart is empty." showQuantity />
              {!!cartItems.length && (
                <p className="mt-2 border-t pt-2 text-right text-sm font-semibold text-[#8A541E]">
                  {formatCurrency(cartItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0))}
                </p>
              )}
              <PopupButton onClick={() => navigate("/cart")}>View Cart</PopupButton>
            </HeaderHoverAction>

            {currentUser ? (
              <div
                className="relative hidden md:block"
                onMouseEnter={() => openHeaderPopup("account")}
                onMouseLeave={closeHeaderPopup}
                onFocus={() => openHeaderPopup("account")}
                onBlur={closeHeaderPopup}
              >
                <button
                  type="button"
                  onClick={() => navigate("/profile")}
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#C2863F] text-xs font-semibold text-white shadow-sm transition hover:bg-[#A06422]"
                  aria-label="Account"
                >
                  {profileImageUrl ? (
                    <img
                      src={buildImageUrl(profileImageUrl)}
                      alt={currentUser?.name || "Profile"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    userLabel || "U"
                  )}
                </button>
                <div
                  className={`absolute right-0 top-full z-[1010] w-52 pt-2 text-sm transition ${
                    activeHeaderPopup === "account"
                      ? "visible opacity-100"
                      : "invisible opacity-0"
                  }`}
                >
                  <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-xl">
                  <button onClick={() => navigate("/profile")} className="w-full rounded-lg px-3 py-2 text-left font-medium hover:bg-[#FBF8F2]">
                    Profile Dashboard
                  </button>
                  <button
                    onClick={() => {
                      logout();
                      navigate("/");
                    }}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left font-medium text-red-600 hover:bg-red-50"
                  >
                    Logout
                  </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="hidden rounded-full border border-[#C2863F] px-4 py-2 text-sm font-semibold text-[#8A541E] transition hover:bg-[#FFF4E6] md:flex"
              >
                Sign In
              </button>
            )}

            <img
              src={menuIcon}
              onClick={() => setOpen(!open)}
              className="h-7 w-7 cursor-pointer md:hidden"
              alt="Menu"
            />
          </div>
        </div>

        <div className="mx-auto mt-3 max-w-7xl md:hidden">
          <div className="relative">
            <SearchBox
              value={search}
              placeholder="Search products..."
              onChange={(value) => {
                setSearch(value);
                setShowSearchResults(true);
              }}
              onSubmit={handleSearch}
              onFocus={() =>
                setShowSearchResults(true)
              }
              onBlur={() =>
                window.setTimeout(
                  () => setShowSearchResults(false),
                  120
                )
              }
            />

            <SearchResults
              visible={showSearchResults}
              query={search}
              loading={searchLoading}
             results={searchResults}
              onSelect={handleSearchSelect}
              onViewAll={handleSearch}
            />
          </div>
        </div>

        {open && (
          <div className="mx-auto mt-3 flex max-w-7xl flex-col gap-2 rounded-2xl border border-gray-100 bg-[#FBF8F2] p-3 md:hidden">
            {menuItems.map((item) => (
              <MobileMenuItem
                key={item.id}
                item={item}
                onNavigate={handleMenuNavigate}
              />
            ))}
            {[
              [
                currentUser ? "Profile" : "Sign In",
                currentUser ? "/profile" : "/login",
              ],
              ["Orders", "/orders"],
            ].map(([label, path]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  navigate(path);
                  setOpen(false);
                }}
                className="rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-white"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SECONDARY MENU */}

      <div className="relative z-[1001] hidden border-t border-[#d39a4a] bg-[#1B332F] px-2 shadow-sm md:block lg:px-4">
        <div className="grid w-full grid-cols-5 items-center gap-1 overflow-visible px-1 py-2 xl:grid-cols-10 xl:gap-1.5">
          {menuItems.map((item) => (
            <DesktopMenuItem
              key={item.id}
              item={item}
              activeMenuId={activeMenuId}
              navItemClass={navItemClass}
              onActivate={setActiveMenuId}
              onNavigate={handleMenuNavigate}
            />
          ))}
        </div>
      </div>
    </nav>
  );
};

function DesktopMenuItem({
  item,
  activeMenuId,
  navItemClass,
  onActivate,
  onNavigate,
}) {
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  const isOpen = activeMenuId === item.id;
  const scrollableMenu = item.mega_menu || isBrandMenuItem(item) || item.children?.length > 12;

  return (
    <div
      className="relative min-w-0"
      onMouseEnter={() => hasChildren && onActivate(item.id)}
      onMouseLeave={() => hasChildren && onActivate(null)}
    >
      <button
        type="button"
        onClick={() => (hasChildren ? onActivate(isOpen ? null : item.id) : onNavigate(item))}
        className={`${navItemClass} flex items-center justify-center gap-1`}
        title={item.title}
        aria-expanded={hasChildren ? isOpen : undefined}
      >
        {item.icon && <img src={item.icon} alt="" className="h-4 w-4 object-contain" />}
        <span className="min-w-0 truncate">{item.title}</span>
        {hasChildren && <img src={caretDown} className="h-3 w-3 object-contain brightness-0 invert" />}
      </button>

      {hasChildren && isOpen && (
        <div className={`absolute top-full z-[1002] rounded-xl bg-white p-4 text-[#242414] shadow-2xl ring-1 ring-black/5 ${item.mega_menu ? "right-0 grid max-h-[72vh] w-[80vw] max-w-[1100px] grid-cols-[1fr_210px] gap-4 overflow-y-auto overscroll-contain" : scrollableMenu ? "left-0 max-h-[72vh] w-64 overflow-y-auto overscroll-contain" : "left-0 w-56"}`}>
          <div className={item.mega_menu ? "grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4" : "space-y-1"}>
            {item.children.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onNavigate(child)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-[#FBF8F2]"
              >
                {child.icon && <img src={child.icon} alt="" className="h-5 w-5 rounded object-contain" />}
                <span>{child.title}</span>
              </button>
            ))}
          </div>
          {item.mega_menu && (
            <div className="rounded-lg bg-[#FBF8F2] p-3">
              {item.image ? (
                <img src={item.image} alt="" className="h-24 w-full rounded-md object-cover" />
              ) : (
                <div className="flex h-24 items-center justify-center rounded-md bg-[#FFF4CC] text-sm font-semibold text-[#8A541E]">
                  {item.title}
                </div>
              )}
              <button type="button" onClick={() => onNavigate(item)} className="mt-3 text-sm font-semibold text-[#8A541E]">
                View all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MobileMenuItem({ item, onNavigate, depth = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => (hasChildren ? setExpanded((current) => !current) : onNavigate(item))}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-white"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <span>{item.title}</span>
        {hasChildren && <span>{expanded ? "-" : "+"}</span>}
      </button>
      {expanded && hasChildren && (
        <div className={`mt-1 space-y-1 ${isBrandMenuItem(item) || item.children.length > 12 ? "max-h-[50vh] overflow-y-auto overscroll-contain" : ""}`}>
          {item.children.map((child) => (
            <MobileMenuItem key={child.id} item={child} onNavigate={onNavigate} depth={depth + 1} />
          ))}
          {item.url && (
            <button
              type="button"
              onClick={() => onNavigate(item)}
              className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#8A541E] hover:bg-white"
              style={{ paddingLeft: `${28 + depth * 16}px` }}
            >
              View all {item.title}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SearchBox({
  value,
  placeholder,
  onChange,
  onSubmit,
  onFocus,
  onBlur,
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-[#F7F5EF] px-4 py-2.5 focus-within:border-[#C2863F] focus-within:bg-white">
      <button
        type="button"
        onClick={onSubmit}
        aria-label="Search products"
      >
        <img
          src={searchIcon}
          className="w-4 opacity-60"
        />
      </button>

      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onSubmit();
          }
        }}
        className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
      />
    </div>
  );
}

function SearchResults({
  visible,
  query,
  loading,
  results,
  onSelect,
  onViewAll,
}) {
  const term = query.trim();

  if (!visible || term.length < 2) {
    return null;
  }

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
      <div className="max-h-[360px] overflow-y-auto p-2">
        {loading && (
          <p className="px-3 py-3 text-sm text-gray-500">
            Searching catalog...
          </p>
        )}

        {!loading &&
          results.length === 0 && (
            <div className="px-3 py-4">
              <p className="text-sm font-semibold text-[#242414]">
                No results found
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Try another keyword or browse all products.
              </p>
            </div>
          )}

        {!loading &&
          results.map((product) => (
            <button
              key={product.id}
              type="button"
              onMouseDown={(event) =>
                event.preventDefault()
              }
              onClick={() => onSelect(product)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[#FBF8F2]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F7F5EF]">
                {product.type === "brand" && product.logo ? (
                  <img
                    src={product.logo}
                    alt={product.name}
                    className="h-full w-full rounded-lg object-contain p-1"
                  />
                ) : product.type === "collection" && product.banner ? (
                  <img
                    src={product.banner}
                    alt={product.name}
                    className="h-full w-full rounded-lg object-cover"
                  />
                ) : product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full rounded-lg object-contain p-1"
                  />
                ) : (
                  <img
                    src={searchIcon}
                    alt=""
                    className="h-5 w-5 opacity-40"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#242414]">
                  {product.name}
                </p>

                <p className="truncate text-xs text-gray-500">
                  {product.type === "brand"
                    ? `${product.product_count || 0} products`
                    : product.type === "collection"
                    ? `${product.product_count || 0} products - Collection`
                    : `${product.brand} - ${product.categoryName}`}
                </p>
              </div>

              {product.type === "brand" ? (
                <span className="shrink-0 rounded-full bg-[#FFF4CC] px-2 py-1 text-xs font-semibold text-[#8A541E]">
                  Brand
                </span>
              ) : product.type === "collection" ? (
                <span className="shrink-0 rounded-full bg-[#EEF6FF] px-2 py-1 text-xs font-semibold text-[#1F5D8A]">
                  Collection
                </span>
              ) : (
                <span className="shrink-0 text-xs font-semibold text-[#C2863F]">
                  {formatCurrency(product.price)}
                </span>
              )}
            </button>
          ))}
      </div>

      <button
        type="button"
        onMouseDown={(event) =>
          event.preventDefault()
        }
        onClick={onViewAll}
        className="flex w-full items-center justify-between border-t border-gray-100 px-4 py-3 text-sm font-semibold text-[#8A5A22] transition hover:bg-[#FFF9C9]"
      >
        View all results for "{term}"

        <span aria-hidden="true">-&gt;</span>
      </button>
    </div>
  );
}

function IconButton({
  icon,
  count,
  onClick,
  label,
  countClass,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white transition hover:border-[#C2863F] hover:bg-[#FFF9C9]"
      aria-label={label}
    >
      <img src={icon} className="h-5 w-5" />

      {count > 0 && (
        <span
          className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] text-white ${countClass}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function HeaderHoverAction({
  id,
  icon,
  count,
  onClick,
  label,
  countClass,
  activePopup,
  onOpen,
  onClose,
  children,
}) {
  const isOpen = activePopup === id;

  return (
    <div
      className="relative"
      onMouseEnter={() => onOpen(id)}
      onMouseLeave={onClose}
      onFocus={() => onOpen(id)}
      onBlur={onClose}
    >
      <IconButton icon={icon} count={count} onClick={onClick} label={label} countClass={countClass} />
      <div
        className={`absolute right-0 top-full z-[1010] hidden w-72 pt-2 transition md:block ${
          isOpen ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}

function PopupTitle({ title, meta }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <p className="font-semibold text-[#242414]">{title}</p>
      <span className="rounded-full bg-[#FBF8F2] px-2 py-1 text-xs text-gray-500">{meta}</span>
    </div>
  );
}

function MiniItemList({ items = [], emptyText, showQuantity = false }) {
  if (!items.length) {
    return <p className="rounded-lg bg-[#FBF8F2] px-3 py-4 text-center text-xs text-gray-500">{emptyText}</p>;
  }

  return (
    <div className="max-h-56 space-y-2 overflow-y-auto">
      {items.slice(0, 4).map((item) => (
        <div key={item.cartKey || item.id} className="flex gap-2 rounded-lg p-2 hover:bg-[#FBF8F2]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F7F5EF]">
            {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full rounded-md object-contain" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#242414]">{item.name}</p>
            <p className="text-[11px] text-gray-500">
              {showQuantity ? `Qty ${item.quantity || 1} - ` : ""}
              {formatCurrency(item.price)}
            </p>
          </div>
        </div>
      ))}
      {items.length > 4 && <p className="px-2 text-[11px] text-gray-500">+{items.length - 4} more</p>}
    </div>
  );
}

function PopupButton({ children, onClick }) {
  return (
    <button onClick={onClick} className="mt-3 w-full rounded-lg bg-[#C2863F] px-3 py-2 text-sm font-semibold text-white hover:bg-[#A06422]">
      {children}
    </button>
  );
}

export default Navbar;
