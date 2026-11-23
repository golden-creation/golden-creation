import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createAdminBrand,
  getAdminBrandDetail,
  updateAdminBrand,
  uploadAdminMedia,
} from "../lib/adminApi";
import ConfirmDialog from "../components/ConfirmDialog";
import { formatQuantity } from "../lib/formatQuantity";

const emptyForm = {
  name: "",
  slug: "",
  logo: "",
  banner: "",
  description: "",
  metaTitle: "",
  metaDescription: "",
  websiteUrl: "",
  featured: false,
  status: "Active",
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

function BrandForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new" || !id;
  const [form, setForm] = useState(emptyForm);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  };

  useEffect(() => {
    if (isNew) return;

    getAdminBrandDetail(id)
      .then((payload) => {
        const brand = payload.brand || {};
        setForm({
          name: brand.name || "",
          slug: brand.slug || "",
          logo: brand.logo || "",
          banner: brand.banner || "",
          description: brand.description || "",
          metaTitle: brand.meta_title || "",
          metaDescription: brand.meta_description || "",
          websiteUrl: brand.website_url || "",
          featured: Boolean(brand.featured),
          status: brand.status || "Active",
        });
        setProducts(payload.products || []);
      })
      .catch((error) => showToast(error.message || "Unable to load brand"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "name" && !slugEdited) {
        next.slug = slugify(value);
      }
      return next;
    });
  };

  const readImage = async (field, file) => {
    if (!file) return;

    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      showToast("Only PNG, JPG, WEBP, or GIF images are allowed");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast("Image must be below 2MB");
      return;
    }

    try {
      showToast(`Uploading ${field}...`);
      const media = await uploadAdminMedia(file, `brands/${field}`);
      updateField(field, media.url);
      showToast(`${field === "logo" ? "Logo" : "Banner"} uploaded`);
    } catch (error) {
      showToast(error.message || "Unable to upload image");
    }
  };

  const saveBrand = async () => {
    setConfirmSave(false);
    if (!form.name.trim()) {
      showToast("Brand name is required");
      return;
    }

    if (!form.slug.trim()) {
      showToast("Brand slug is required");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        logo: form.logo,
        banner: form.banner,
        description: form.description,
        metaTitle: form.metaTitle,
        metaDescription: form.metaDescription,
        websiteUrl: form.websiteUrl,
        featured: form.featured,
        status: form.status,
      };

      if (isNew) {
        const response = await createAdminBrand(payload);
        showToast("Brand created");
        setTimeout(() => navigate(`/brands/${response.brand?.id || ""}`), 700);
      } else {
        await updateAdminBrand(id, payload);
        showToast("Brand updated");
      }
    } catch (error) {
      showToast(error.message || "Unable to save brand");
    } finally {
      setSaving(false);
    }
  };

  const seoPreview = useMemo(() => ({
    title: form.metaTitle || `${form.name || "Brand"} | Golden Creation`,
    description: form.metaDescription || form.description || "Shop brand products on Golden Creation.",
  }), [form]);

  if (loading) {
    return <div className="min-h-screen bg-[#F6F4EF] p-6 text-sm text-gray-500">Loading brand...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F6F4EF] p-4 md:p-6">
      <ConfirmDialog
        open={confirmSave}
        title={isNew ? "Create brand?" : "Save brand changes?"}
        message={`${isNew ? "Create" : "Update"} "${form.name || "this brand"}" in Brand Management?`}
        confirmLabel="YES"
        onConfirm={saveBrand}
        onDiscard={() => setConfirmSave(false)}
      />
      {toast && <div className="fixed right-5 top-20 z-50 rounded-lg bg-black px-4 py-2 text-sm text-white">{toast}</div>}

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{isNew ? "Add Brand" : "Brand Details"}</h1>
          <p className="text-sm text-gray-500">Create and maintain brand identity, SEO, and storefront visuals.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/brands")} className="rounded-lg border bg-white px-4 py-2 text-sm">Back</button>
          <button disabled={saving} onClick={() => setConfirmSave(true)} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white disabled:opacity-60">
            {saving ? "Saving..." : "Save Brand"}
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Section title="Brand Information">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Brand Name" value={form.name} onChange={(value) => updateField("name", value)} required />
              <Field
                label="Slug"
                value={form.slug}
                onChange={(value) => {
                  setSlugEdited(true);
                  updateField("slug", slugify(value));
                }}
                required
              />
              <Field label="Website URL" value={form.websiteUrl} onChange={(value) => updateField("websiteUrl", value)} placeholder="https://brand.com" />
              <Select label="Status" value={form.status} onChange={(value) => updateField("status", value)} options={["Active", "Inactive"]} />
              <TextArea label="Description" value={form.description} onChange={(value) => updateField("description", value)} className="md:col-span-2" />
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <Check label="Feature this brand on storefront" checked={form.featured} onChange={(checked) => updateField("featured", checked)} />
            </div>
          </Section>

          <Section title="Brand Media">
            <div className="grid gap-4 md:grid-cols-2">
              <UploadBox label="Logo" value={form.logo} onDrop={(file) => readImage("logo", file)} onClear={() => updateField("logo", "")} />
              <UploadBox label="Banner" value={form.banner} onDrop={(file) => readImage("banner", file)} onClear={() => updateField("banner", "")} wide />
            </div>
          </Section>

          <Section title="SEO Settings">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Meta Title" value={form.metaTitle} onChange={(value) => updateField("metaTitle", value)} />
              <Field label="Canonical URL" value={`/brand/${form.slug || "brand-slug"}`} onChange={() => {}} disabled />
              <TextArea label="Meta Description" value={form.metaDescription} onChange={(value) => updateField("metaDescription", value)} className="md:col-span-2" />
            </div>
          </Section>

          {!isNew && (
            <Section title="Brand Products">
              <div className="overflow-x-auto">
                <table className="min-w-[620px] w-full text-left text-sm">
                  <thead className="bg-[#FBF8F2] text-xs uppercase text-gray-500">
                    <tr>
                      <th className="p-3">Product</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Price</th>
                      <th className="p-3">Stock</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length ? products.map((product) => (
                      <tr key={product.id} className="border-t">
                        <td className="p-3 font-medium">{product.name}</td>
                        <td className="p-3 text-gray-500">{product.sku || "-"}</td>
                        <td className="p-3">₹{Number(product.price || 0).toLocaleString("en-IN")}</td>
                        <td className="p-3">{formatQuantity(product.stock_quantity) || "0"}</td>
                        <td className="p-3">{product.status}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="5" className="p-5 text-center text-gray-500">No products assigned to this brand.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>

        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            {form.banner ? (
              <img src={form.banner} alt="" className="h-36 w-full object-cover" />
            ) : (
              <div className="h-36 bg-[#FBF8F2]" />
            )}
            <div className="p-4">
              <div className="-mt-12 mb-3 flex h-20 w-20 items-center justify-center rounded-xl border bg-white p-2 shadow-sm">
                {form.logo ? <img src={form.logo} alt="" className="h-full w-full object-contain" /> : <span className="text-2xl font-semibold text-[#A68B5B]">{(form.name || "B").charAt(0)}</span>}
              </div>
              <h2 className="text-xl font-semibold">{form.name || "Brand Name"}</h2>
              <p className="mt-1 text-sm text-gray-500">{form.description || "Brand description preview will appear here."}</p>
              <p className="mt-3 text-xs text-gray-400">/brand/{form.slug || "brand-slug"}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="font-semibold">SEO Preview</h3>
            <p className="mt-3 text-sm text-blue-700">{seoPreview.title}</p>
            <p className="text-xs text-green-700">https://goldencreation.in/brand/{form.slug || "brand-slug"}</p>
            <p className="mt-1 text-xs text-gray-600">{seoPreview.description}</p>
          </div>
        </div>
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
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function UploadBox({ label, value, onDrop, onClear }) {
  return (
    <div>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onDrop(event.dataTransfer.files?.[0]);
        }}
        className="rounded-xl border-2 border-dashed border-[#E4D2B1] bg-[#FBF8F2] p-4 text-center"
      >
        {value ? (
          <img src={value} alt={label} className="mx-auto h-28 w-full object-contain" />
        ) : (
          <div className="flex h-28 items-center justify-center text-sm text-gray-500">Drop {label.toLowerCase()} image here</div>
        )}
        <label className="mt-3 inline-flex cursor-pointer rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
          Choose {label}
          <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => onDrop(event.target.files?.[0])} />
        </label>
        {value && <button onClick={onClear} className="ml-2 rounded-lg border px-3 py-2 text-sm">Clear</button>}
      </div>
    </div>
  );
}

export default BrandForm;
