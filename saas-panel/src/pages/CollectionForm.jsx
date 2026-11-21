import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest, getAssetUrl } from "../lib/api";
import RemoteLookup from "../components/RemoteLookup";
import {
  createAdminCollection,
  getAdminBrands,
  getAdminCollectionDetail,
  getAdminTags,
  previewAdminCollection,
  updateAdminCollection,
  uploadAdminMedia,
} from "../lib/adminApi";

const emptyForm = {
  name: "",
  slug: "",
  type: "automatic",
  description: "",
  banner: "",
  status: "Active",
  seoTitle: "",
  seoDescription: "",
  conditions: {
    match: "all",
    tags: [],
    brands: [],
    categories: [],
    priceMin: "",
    priceMax: "",
    stockStatus: "",
    featured: false,
  },
  products: [],
};

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function CollectionForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new" || !id;
  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [tags, setTags] = useState([]);
  const [previewProducts, setPreviewProducts] = useState([]);
  const [manualProduct, setManualProduct] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  };

  useEffect(() => {
    Promise.all([
      apiRequest("/categories"),
      getAdminBrands({ status: "Active", limit: 100 }),
      getAdminTags({ status: "Active", limit: 100 }),
    ])
      .then(([categoryRows, brandRows, tagRows]) => {
        setCategories(Array.isArray(categoryRows) ? categoryRows : []);
        setBrands(brandRows.brands || []);
        setTags(tagRows.tags || []);
      })
      .catch(() => {
        setCategories([]);
        setBrands([]);
        setTags([]);
      });
  }, []);

  useEffect(() => {
    if (isNew) return;

    getAdminCollectionDetail(id)
      .then((payload) => {
        const collection = payload.collection || {};
        setForm({
          ...emptyForm,
          name: collection.name || "",
          slug: collection.slug || "",
          type: collection.type || "automatic",
          description: collection.description || "",
          banner: collection.banner || "",
          status: collection.status || "Active",
          seoTitle: collection.seo_title || "",
          seoDescription: collection.seo_description || "",
          conditions: { ...emptyForm.conditions, ...(collection.conditions || {}) },
          products: (payload.manualProducts || []).map((item, index) => ({
            id: item.product_id,
            product_id: item.product_id,
            name: item.name,
            sku: item.sku,
            price: item.price,
            image: item.image,
            sort_order: item.sort_order || index + 1,
            pinned: Boolean(item.pinned),
          })),
        });
        setPreviewProducts(payload.previewProducts || []);
      })
      .catch((error) => showToast(error.message || "Unable to load collection"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "name" && current.slug === slugify(current.name)) {
        next.slug = slugify(value);
      }
      if (field === "slug") next.slug = slugify(value);
      return next;
    });
  };

  const updateCondition = (field, value) => {
    setForm((current) => ({
      ...current,
      conditions: { ...current.conditions, [field]: value },
    }));
  };

  const toggleArrayCondition = (field, value) => {
    setForm((current) => {
      const currentValues = Array.isArray(current.conditions[field]) ? current.conditions[field] : [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];
      return {
        ...current,
        conditions: { ...current.conditions, [field]: nextValues },
      };
    });
  };

  const addManualProduct = (product) => {
    setForm((current) => ({
      ...current,
      products: [
        ...current.products,
        {
          id: product.id,
          product_id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          image: product.image,
          sort_order: current.products.length + 1,
          pinned: false,
        },
      ],
    }));
  };

  const moveManualProduct = (index, direction) => {
    setForm((current) => {
      const next = [...current.products];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return current;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return {
        ...current,
        products: next.map((item, itemIndex) => ({ ...item, sort_order: itemIndex + 1 })),
      };
    });
  };

  const togglePinned = (index) => {
    setForm((current) => ({
      ...current,
      products: current.products.map((item, itemIndex) => itemIndex === index ? { ...item, pinned: !item.pinned } : item),
    }));
  };

  const removeManualProduct = (index) => {
    setForm((current) => ({
      ...current,
      products: current.products
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sort_order: itemIndex + 1 })),
    }));
  };

  const readBanner = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      showToast("Only PNG, JPG, WEBP, or GIF images are allowed");
      return;
    }

    try {
      showToast("Uploading banner...");
      const media = await uploadAdminMedia(file, "collections/banner");
      updateField("banner", media.url);
      showToast("Banner uploaded");
    } catch (error) {
      showToast(error.message || "Unable to upload banner");
    }
  };

  const runPreview = async () => {
    try {
      const response = await previewAdminCollection(form);
      setPreviewProducts(response.products || []);
    } catch (error) {
      showToast(error.message || "Unable to preview collection");
    }
  };

  useEffect(() => {
    if (form.type !== "automatic") {
      setPreviewProducts(form.products);
      return;
    }

    const timeout = window.setTimeout(runPreview, 350);
    return () => window.clearTimeout(timeout);
  }, [JSON.stringify(form.conditions), form.type, form.products.length]);

  const saveCollection = async () => {
    if (!form.name.trim()) {
      showToast("Collection name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        seoTitle: form.seoTitle,
        seoDescription: form.seoDescription,
      };

      if (isNew) {
        const response = await createAdminCollection(payload);
        showToast("Collection created");
        setTimeout(() => navigate(`/collections/${response.collection?.id || ""}`), 700);
      } else {
        await updateAdminCollection(id, payload);
        showToast("Collection updated");
      }
    } catch (error) {
      showToast(error.message || "Unable to save collection");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#F6F4EF] p-6 text-sm text-gray-500">Loading collection...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F6F4EF] p-4 md:p-6">
      {toast && <div className="fixed right-5 top-20 z-50 rounded-lg bg-black px-4 py-2 text-sm text-white">{toast}</div>}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{isNew ? "Add Collection" : "Collection Details"}</h1>
          <p className="text-sm text-gray-500">Create manual product groups or automatic merchandising rules.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/collections")} className="rounded-lg border bg-white px-4 py-2 text-sm">Back</button>
          <button onClick={saveCollection} disabled={saving} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white disabled:opacity-60">{saving ? "Saving..." : "Save Collection"}</button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Section title="General Information">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Collection Name" value={form.name} onChange={(value) => updateField("name", value)} required />
              <Field label="Slug" value={form.slug} onChange={(value) => updateField("slug", value)} required />
              <Select label="Type" value={form.type} onChange={(value) => updateField("type", value)} options={[["automatic", "Automatic"], ["manual", "Manual"]]} />
              <Select label="Status" value={form.status} onChange={(value) => updateField("status", value)} options={[["Active", "Active"], ["Inactive", "Inactive"]]} />
              <TextArea label="Description" value={form.description} onChange={(value) => updateField("description", value)} className="md:col-span-2" />
            </div>
          </Section>

          <Section title="Banner">
            <div className="rounded-xl border-2 border-dashed border-[#E4D2B1] bg-[#FBF8F2] p-4 text-center">
              {form.banner ? <img src={form.banner} alt="" className="mx-auto h-36 w-full rounded-lg object-cover" /> : <div className="flex h-36 items-center justify-center text-sm text-gray-500">Drop or choose a collection banner</div>}
              <label className="mt-3 inline-flex cursor-pointer rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                Choose Banner
                <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => readBanner(event.target.files?.[0])} />
              </label>
              {form.banner && <button onClick={() => updateField("banner", "")} className="ml-2 rounded-lg border px-3 py-2 text-sm">Clear</button>}
            </div>
          </Section>

          {form.type === "automatic" ? (
            <Section title="Automatic Rules">
              <div className="grid gap-4 md:grid-cols-2">
                <Select label="Match Mode" value={form.conditions.match} onChange={(value) => updateCondition("match", value)} options={[["all", "Match all rules"], ["any", "Match any rule"]]} />
                <Select label="Stock Status" value={form.conditions.stockStatus || ""} onChange={(value) => updateCondition("stockStatus", value)} options={[["", "Any stock"], ["in_stock", "In stock"], ["out_of_stock", "Out of stock"]]} />
                <Field label="Minimum Price" value={form.conditions.priceMin || ""} onChange={(value) => updateCondition("priceMin", value)} />
                <Field label="Maximum Price" value={form.conditions.priceMax || ""} onChange={(value) => updateCondition("priceMax", value)} />
              </div>
              <RuleChips title="Tags" items={tags.map((tag) => ({ label: tag.name, value: tag.slug }))} selected={form.conditions.tags || []} onToggle={(value) => toggleArrayCondition("tags", value)} />
              <RuleChips title="Brands" items={brands.map((brand) => ({ label: brand.name, value: brand.slug }))} selected={form.conditions.brands || []} onToggle={(value) => toggleArrayCondition("brands", value)} />
              <RuleChips title="Categories" items={categories.map((category) => ({ label: category.name, value: category.name }))} selected={form.conditions.categories || []} onToggle={(value) => toggleArrayCondition("categories", value)} />
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(form.conditions.featured)} onChange={(event) => updateCondition("featured", event.target.checked)} />
                Featured products only
              </label>
            </Section>
          ) : (
            <Section title="Manual Products">
              <div className="mb-4">
                <RemoteLookup
                  type="products"
                  catalog="website"
                  value={manualProduct}
                  onChange={(option) => {
                    setManualProduct(option);
                    if (!option || form.products.some((item) => Number(item.product_id || item.id) === Number(option.id))) return;
                    addManualProduct({ id: option.id, name: option.label, sku: option.sku, price: option.price });
                    setManualProduct(null);
                  }}
                  placeholder="Search product to add..."
                />
              </div>
              <div className="space-y-2">
                {form.products.map((product, index) => (
                  <div key={`${product.product_id}-${index}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                    <span className="font-semibold">{index + 1}. {product.name}</span>
                    <button onClick={() => moveManualProduct(index, -1)} className="ml-auto rounded border px-2 py-1 text-xs">Up</button>
                    <button onClick={() => moveManualProduct(index, 1)} className="rounded border px-2 py-1 text-xs">Down</button>
                    <button onClick={() => togglePinned(index)} className={`rounded border px-2 py-1 text-xs ${product.pinned ? "bg-yellow-100 text-yellow-700" : ""}`}>{product.pinned ? "Pinned" : "Pin"}</button>
                    <button onClick={() => removeManualProduct(index)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600">Remove</button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="SEO Settings">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SEO Title" value={form.seoTitle} onChange={(value) => updateField("seoTitle", value)} />
              <Field label="Canonical URL" value={`/collections/${form.slug || "collection-slug"}`} onChange={() => {}} disabled />
              <TextArea label="SEO Description" value={form.seoDescription} onChange={(value) => updateField("seoDescription", value)} className="md:col-span-2" />
            </div>
          </Section>
        </div>

        <aside className="space-y-5">
          <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
            {form.banner ? <img src={form.banner} alt="" className="h-32 w-full object-cover" /> : <div className="h-32 bg-[#FBF8F2]" />}
            <div className="p-4">
              <p className="text-xs uppercase tracking-wide text-[#A68B5B]">{form.type} collection</p>
              <h2 className="mt-1 text-xl font-semibold">{form.name || "Collection Name"}</h2>
              <p className="mt-2 text-sm text-gray-500">{form.description || "Collection description preview."}</p>
              <p className="mt-3 text-xs text-gray-400">/collections/{form.slug || "collection-slug"}</p>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Live Preview</h3>
              <button onClick={runPreview} className="rounded border px-3 py-1 text-xs">Refresh</button>
            </div>
            <div className="space-y-3">
              {previewProducts.slice(0, 8).map((product) => (
                <div key={product.id || product.product_id} className="flex items-center gap-3 rounded-lg border p-2">
                  <img src={getAssetUrl(product.image || "product-placeholder.png")} alt="" className="h-10 w-10 rounded object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-gray-500">Rs. {Number(product.price || 0).toLocaleString("en-IN")}</p>
                  </div>
                </div>
              ))}
              {!previewProducts.length && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-gray-500">No products matched yet.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, placeholder = "", required = false, disabled = false }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label} {required && <span className="text-red-500">*</span>}</span>
      <input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-100" />
    </label>
  );
}

function TextArea({ label, value, onChange, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-24 w-full rounded-lg border px-3 py-2 text-sm" />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">
        {options.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}
      </select>
    </label>
  );
}

function RuleChips({ title, items, selected, onToggle }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button key={item.value} onClick={() => onToggle(item.value)} className={`rounded-full border px-3 py-1 text-xs ${selected.includes(item.value) ? "border-[#A68B5B] bg-[#FFF4DC] text-[#7A4D18]" : "bg-white text-gray-600"}`}>
            {item.label}
          </button>
        ))}
        {!items.length && <span className="text-xs text-gray-400">No options available</span>}
      </div>
    </div>
  );
}

export default CollectionForm;
