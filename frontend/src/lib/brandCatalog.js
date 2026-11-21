export function brandIdentity(brand) {
  if (brand?.id) return `id:${brand.id}`;
  if (brand?.slug) return `slug:${String(brand.slug).toLowerCase()}`;
  if (brand?.name) return `name:${String(brand.name).trim().toLowerCase()}`;
  return "";
}

export function appendUniqueBrands(existing = [], incoming = []) {
  const seen = new Set(existing.map(brandIdentity).filter(Boolean));
  const brands = existing.slice();
  let added = 0;

  for (const brand of incoming) {
    const key = brandIdentity(brand);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    brands.push(brand);
    added += 1;
  }

  return { brands, added };
}

export function hasAnotherBrandPage(pagination, loadedCount) {
  const total = Number(pagination?.total || 0);
  if (!Number.isFinite(total) || total <= 0) return false;
  return loadedCount < total;
}

export function compareBrandNames(left, right) {
  return String(left || "").localeCompare(String(right || ""), "en", {
    sensitivity: "base",
    numeric: true,
  });
}

export function brandsForMenu(brands = []) {
  const visible = appendUniqueBrands([], brands).brands.filter((brand) => {
    const status = String(brand.status || "Active").trim().toLowerCase();
    return status !== "inactive" && !brand.deleted_at;
  });

  return visible.sort((left, right) => compareBrandNames(left.name, right.name));
}

export function brandMenuChildren(brands) {
  const visible = brandsForMenu(brands);

  if (!visible.length) {
    return [
      {
        id: "no-brands",
        title: "No brands available",
        url: "/brands",
        children: [],
      },
    ];
  }

  return visible.map((brand) => ({
    id: `brand-${brand.id || brand.slug || brand.name}`,
    title: brand.name,
    type: "brand",
    reference_id: brand.id,
    url: brand.slug ? `/brand/${brand.slug}` : `/writing-essentials?brands=${encodeURIComponent(brand.name)}`,
    icon: brand.logo || "",
    children: [],
  }));
}
