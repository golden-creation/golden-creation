import React, { useEffect, useState } from "react";
import {
  createAdminBundle,
  deleteAdminBundle,
  getAdminBundleDetail,
  getAdminBundles,
  updateAdminBundle,
  uploadAdminMedia,
} from "../lib/adminApi";
import RemoteLookup from "../components/RemoteLookup";
import useEditorScroll from "../hooks/useEditorScroll";

const emptyForm = {
  id: "",
  name: "",
  slug: "",
  description: "",
  image: "",
  price: "",
  comparePrice: "",
  status: "Active",
  featured: false,
  minItems: 1,
  maxItems: 15,
  items: [],
};

function BundleManagement() {
  const [bundles, setBundles] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [productSearch, setProductSearch] = useState(null);
  const [toast, setToast] = useState("");
  const { editorRef, scrollToEditor } = useEditorScroll();

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };

  const load = async () => {
    const bundleData = await getAdminBundles();
    setBundles(bundleData.bundles || []);
    setMetrics(bundleData.metrics || {});
  };

  useEffect(() => {
    load().catch((error) => showToast(error.message || "Unable to load bundles"));
  }, []);

  const updateField = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      slug: key === "name" && !current.id ? value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : current.slug,
    }));
  };

  const readImage = async (file) => {
    if (!file) return;
    if (!/^image\//i.test(file.type)) {
      showToast("Only image files are allowed");
      return;
    }

    try {
      showToast("Uploading bundle image...");
      const media = await uploadAdminMedia(file, "bundles");
      updateField("image", media.url);
      showToast("Bundle image uploaded");
    } catch (error) {
      showToast(error.message || "Unable to upload image");
    }
  };

  const toggleProduct = (product) => {
    const normalized = { ...product, name: product.name || product.label, price: product.price || 0 };
    setForm((current) => {
      const exists = current.items.some((item) => Number(item.productId) === Number(normalized.id));
      return {
        ...current,
        items: exists
          ? current.items.filter((item) => Number(item.productId) !== Number(normalized.id))
          : [
              ...current.items,
              {
                productId: normalized.id,
                name: normalized.name,
                quantity: 1,
                price: normalized.price,
                imageUrl: normalized.image_url || normalized.image,
              },
            ],
      };
    });
  };

  const editBundle = async (bundle) => {
    const response = await getAdminBundleDetail(bundle.id);
    const detail = response.bundle;
    setForm({
      id: detail.id,
      name: detail.name || "",
      slug: detail.slug || "",
      description: detail.description || "",
      image: detail.image || "",
      price: detail.price || "",
      comparePrice: detail.comparePrice || "",
      status: detail.status || "Active",
      featured: Boolean(detail.featured),
      minItems: detail.minItems || 1,
      maxItems: detail.maxItems || 15,
      items: (detail.items || []).map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        name: item.name,
        quantity: item.quantity || 1,
      })),
    });
    scrollToEditor();
  };

  const saveBundle = async () => {
    if (!form.name.trim() || !form.items.length) {
      showToast("Bundle name and products are required");
      return;
    }

    try {
      if (form.id) {
        await updateAdminBundle(form.id, form);
        showToast("Bundle updated");
      } else {
        await createAdminBundle(form);
        showToast("Bundle created");
      }

      setForm(emptyForm);
      await load();
    } catch (error) {
      showToast(error.message || "Unable to save bundle");
    }
  };

  const removeBundle = async (bundle) => {
    if (!window.confirm(`Delete ${bundle.name}?`)) return;
    await deleteAdminBundle(bundle.id);
    showToast("Bundle deleted");
    await load();
  };

  return (
    <div className="min-h-screen bg-[#F6F4EF] p-4 md:p-6">
      {toast && <div className="fixed right-5 top-20 z-50 rounded-lg bg-black px-4 py-2 text-sm text-white">{toast}</div>}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Bundle Management</h1>
        <p className="text-sm text-gray-500">Create staff-provided bundle products from existing website products.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Total Bundles" value={metrics.total || bundles.length || 0} />
        <Metric label="Active" value={metrics.active || 0} />
        <Metric label="Featured" value={metrics.featured || 0} />
      </div>

      <div className="mt-5 flex flex-col gap-5">
        <section ref={editorRef} className="order-first min-w-0 scroll-mt-24 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{form.id ? "Edit Bundle" : "Create Bundle"}</h2>
          <div className="mt-4 space-y-3">
            <Field label="Name" value={form.name} onChange={(value) => updateField("name", value)} />
            <Field label="Slug" value={form.slug} onChange={(value) => updateField("slug", value)} />
            <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} rows={3} placeholder="Description" className="w-full rounded-lg border px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bundle Price" value={form.price} onChange={(value) => updateField("price", value)} />
              <Field label="Compare Price" value={form.comparePrice} onChange={(value) => updateField("comparePrice", value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Status" value={form.status} onChange={(value) => updateField("status", value)} options={["Active", "Inactive"]} />
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.featured} onChange={(event) => updateField("featured", event.target.checked)} />
                Featured
              </label>
            </div>
            {form.image && <img src={form.image} alt="" className="h-24 w-full rounded-lg border object-contain" />}
            <label className="inline-flex cursor-pointer rounded border bg-white px-3 py-2 text-sm">
              Upload Image
              <input type="file" hidden accept="image/*" onChange={(event) => readImage(event.target.files?.[0])} />
            </label>
            {form.image && <button type="button" onClick={() => updateField("image", "")} className="ml-2 rounded border border-red-200 px-3 py-2 text-sm text-red-600">Remove Image</button>}
            <RemoteLookup type="products" catalog="website" value={productSearch} onChange={(product) => { if (product) toggleProduct(product); setProductSearch(null); }} placeholder="Search products to add..." />
            <div className="max-h-60 space-y-2 overflow-y-auto">{form.items.map((item) => <button key={item.productId} onClick={() => toggleProduct({ id: item.productId })} className="flex w-full items-center justify-between rounded border p-2 text-left text-sm"><span>{item.name}</span><span className="text-red-600">Remove</span></button>)}</div>
            <p className="text-xs text-gray-500">{form.items.length} products selected</p>
            <div className="flex gap-2">
              <button onClick={saveBundle} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">Save Bundle</button>
              {form.id && <button onClick={() => setForm(emptyForm)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>}
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[850px] w-full text-left text-sm">
              <thead className="bg-[#FBF8F2] text-xs uppercase text-gray-500">
                <tr>
                  <th className="p-3">Bundle</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Featured</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bundles.length ? bundles.map((bundle) => (
                  <tr key={bundle.id} className="border-t">
                    <td className="p-3">
                      <p className="font-semibold">{bundle.name}</p>
                      <p className="text-xs text-gray-500">{bundle.slug}</p>
                    </td>
                    <td className="p-3">{bundle.itemCount || bundle.items?.length || 0}</td>
                    <td className="p-3">Rs. {Number(bundle.price || 0).toFixed(2)}</td>
                    <td className="p-3">{bundle.status}</td>
                    <td className="p-3">{bundle.featured ? "Yes" : "No"}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => editBundle(bundle)} className="rounded border px-3 py-1 text-xs">Edit</button>
                      <button onClick={() => removeBundle(bundle)} className="ml-2 rounded border border-red-200 px-3 py-1 text-xs text-red-600">Delete</button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-sm text-gray-500">
                      No bundles created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
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

export default BundleManagement;
