import React, { useEffect, useMemo, useState } from "react";
import {
  createAdminSupplier,
  deleteAdminSupplier,
  getAdminSuppliers,
  updateAdminSupplier,
  downloadAdminXlsx,
  runBulkAction,
} from "../lib/adminApi";
import RemoteLookup from "../components/RemoteLookup";
import useEditorScroll from "../hooks/useEditorScroll";

const emptySupplier = {
  name: "",
  company: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  status: "Active",
  notes: "",
  productRefs: [],
  brandIds: [],
};

function Supplier() {
  const [data, setData] = useState({
    suppliers: [],
    websiteProducts: [],
    warehouseProducts: [],
    storeProducts: [],
    brands: [],
    summary: {},
  });
  const [draft, setDraft] = useState(emptySupplier);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [productLookup, setProductLookup] = useState(null);
  const [brandLookup, setBrandLookup] = useState(null);
  const { editorRef, scrollToEditor } = useEditorScroll();

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      setMessage("");
      setData(await getAdminSuppliers());
    } catch (error) {
      setMessage(error.message || "Unable to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data.suppliers || [];

    return (data.suppliers || []).filter((supplier) =>
      `${supplier.name} ${supplier.company} ${supplier.email} ${supplier.phone} ${supplier.status}`
        .toLowerCase()
        .includes(query)
    );
  }, [data.suppliers, search]);

  const updateDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const toggleProduct = (ref) => {
    setDraft((current) => ({
      ...current,
      productRefs: current.productRefs.includes(ref)
        ? current.productRefs.filter((item) => item !== ref)
        : [...current.productRefs, ref],
    }));
  };

  const resetDraft = () => {
    setDraft(emptySupplier);
    setEditingId(null);
  };

  const submitSupplier = async () => {
    if (!draft.name.trim()) {
      setMessage("Supplier name is required.");
      return;
    }

    try {
      if (editingId) {
        await updateAdminSupplier(editingId, draft);
        setMessage("Supplier updated.");
      } else {
        await createAdminSupplier(draft);
        setMessage("Supplier created.");
      }

      resetDraft();
      await loadSuppliers();
    } catch (error) {
      setMessage(error.message || "Unable to save supplier");
    }
  };

  const editSupplier = (supplier) => {
    setEditingId(supplier.id);
    setDraft({
      name: supplier.name || "",
      company: supplier.company || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      whatsapp: supplier.whatsapp || supplier.phone || "",
      address: supplier.address || "",
      status: supplier.status || "Active",
      notes: supplier.notes || "",
      productRefs: (supplier.products || []).map((product) =>
        product.store_product_id
          ? `store:${product.store_product_id}`
          : product.warehouse_product_id
          ? `warehouse:${product.warehouse_product_id}`
          : `website:${product.product_id}`
      ),
      brandIds: (supplier.brands || []).map((brand) => brand.id),
    });
    scrollToEditor();
  };

  const removeSupplier = async (id) => {
    try {
      await deleteAdminSupplier(id);
      setMessage("Supplier deleted.");
      await loadSuppliers();
    } catch (error) {
      setMessage(error.message || "Unable to delete supplier");
    }
  };

  const openLowStockWhatsapp = (supplier) => {
    const lowStock = supplier.lowStockProducts || [];
    const productText = lowStock.length
      ? lowStock.map((item) => `${item.product_name} (${item.stock_on_hand}/${item.reorder_level})`).join(", ")
      : "assigned products";
    const text = `Hello ${supplier.name}, Golden Creation needs stock support for: ${productText}. Please share availability and pricing.`;
    const phone = String(supplier.whatsapp || supplier.phone || "").replace(/\D/g, "");

    if (!phone) {
      setMessage("Supplier WhatsApp number is missing.");
      return;
    }

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };
  const bulk = async (action) => { if (!selectedIds.length) return setMessage("Select suppliers first."); const response = await runBulkAction("suppliers", action, selectedIds); setSelectedIds([]); setMessage(`${response.result?.[action === "archive" ? "archived" : "deleted"]?.length || 0} supplier(s) updated.`); await loadSuppliers(); };
  const allVisibleSelected = filteredSuppliers.length > 0 && filteredSuppliers.every((supplier) => selectedIds.includes(supplier.id));

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Supplier Management</h1>
          <p className="text-sm text-gray-500">
            Manage suppliers, assign website or warehouse products, and contact suppliers for low stock.
          </p>
        </div>
        <div className="flex flex-wrap gap-2"><button onClick={() => downloadAdminXlsx("suppliers", selectedIds.length ? { ids: selectedIds.join(",") } : {})} className="rounded-lg bg-black px-4 py-2 text-sm text-white">Export XLSX</button><button onClick={() => bulk("archive")} className="rounded-lg bg-white px-4 py-2 text-sm shadow">Archive selected</button><button onClick={() => bulk("delete")} className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white">Delete selected</button><button onClick={resetDraft} className="rounded-lg bg-white px-4 py-2 text-sm shadow">New Supplier</button></div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-[#D6BE8C] bg-[#FFF9E6] px-3 py-2 text-sm text-[#6E4D13]">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric label="Total Suppliers" value={data.summary?.total || 0} />
        <Metric label="Active" value={data.summary?.active || 0} />
        <Metric label="Pending" value={data.summary?.pending || 0} />
        <Metric label="Blocked" value={data.summary?.blocked || 0} />
      </div>

      <div className="mt-6 space-y-6">
        <section ref={editorRef} className="scroll-mt-24 rounded-xl bg-white p-4 shadow">
          <h2 className="mb-4 text-lg font-semibold">
            {editingId ? "Edit Supplier" : "Add Supplier"}
          </h2>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Supplier Name" value={draft.name} onChange={(value) => updateDraft("name", value)} />
              <Field label="Company" value={draft.company} onChange={(value) => updateDraft("company", value)} />
              <Field label="Email" value={draft.email} onChange={(value) => updateDraft("email", value)} />
              <Field label="Phone" value={draft.phone} onChange={(value) => updateDraft("phone", value)} />
              <Field label="WhatsApp" value={draft.whatsapp} onChange={(value) => updateDraft("whatsapp", value)} />
              <Field label="Address" value={draft.address} onChange={(value) => updateDraft("address", value)} />
            </div>
            <label className="text-sm">
              <span className="text-xs text-gray-500">Brands Supplied</span>
              <div className="mt-1 space-y-2 rounded-lg border p-3">
                <RemoteLookup type="brands" value={brandLookup} onChange={(option) => { if (option && !draft.brandIds.includes(option.id)) updateDraft("brandIds", [...draft.brandIds, option.id]); setBrandLookup(null); }} placeholder="Search brands to assign..." />
                <div className="flex flex-wrap gap-1">{draft.brandIds.map((id) => <button key={id} type="button" onClick={() => updateDraft("brandIds", draft.brandIds.filter((brandId) => brandId !== id))} className="rounded bg-gray-100 px-2 py-1 text-xs">Brand #{id} x</button>)}</div>
              </div>
            </label>
            <label className="text-sm">
              <span className="text-xs text-gray-500">Status</span>
              <select
                value={draft.status}
                onChange={(event) => updateDraft("status", event.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option>Active</option>
                <option>Pending</option>
                <option>Blocked</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs text-gray-500">Products Supplied</span>
              <div className="mt-1 space-y-2 rounded-lg border p-3"><RemoteLookup type="products" catalog="website" value={productLookup} onChange={(option) => { if (option && !draft.productRefs.includes(option.value)) toggleProduct(option.value); setProductLookup(null); }} placeholder="Search unified inventory products..." /><div className="flex flex-wrap gap-1">{draft.productRefs.map((ref) => <button key={ref} type="button" onClick={() => toggleProduct(ref)} className="rounded bg-gray-100 px-2 py-1 text-xs">{ref} x</button>)}</div></div>
            </label>
            <label className="text-sm">
              <span className="text-xs text-gray-500">Notes</span>
              <textarea
                value={draft.notes}
                onChange={(event) => updateDraft("notes", event.target.value)}
                className="mt-1 min-h-20 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <div className="flex gap-2">
              <button onClick={submitSupplier} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
                {editingId ? "Update Supplier" : "Save Supplier"}
              </button>
              {editingId && (
                <button onClick={resetDraft} className="rounded-lg border px-4 py-2 text-sm">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold">Suppliers</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search suppliers..."
              className="rounded-lg border px-3 py-2 text-sm md:w-72"
            />
          </div>

          {loading ? (
            <div className="py-10 text-center text-gray-500">Loading suppliers...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr>
                    <th className="p-3">
                      <input
                        type="checkbox"
                        aria-label="Select all suppliers"
                        checked={allVisibleSelected}
                        onChange={(event) => setSelectedIds(event.target.checked ? filteredSuppliers.map((supplier) => supplier.id) : [])}
                      />
                    </th>
                    <th className="p-3">Supplier</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Brands</th>
                    <th>Products</th>
                    <th>Low Stock</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSuppliers.map((supplier) => (
                    <tr key={supplier.id} className="border-b">
                      <td className="p-3"><input type="checkbox" checked={selectedIds.includes(supplier.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, supplier.id] : selectedIds.filter((id) => id !== supplier.id))} /></td>
                      <td className="p-3">
                        <p className="font-medium">{supplier.name}</p>
                        <p className="text-xs text-gray-500">{supplier.company || "-"}</p>
                      </td>
                      <td>
                        <p>{supplier.email || "-"}</p>
                        <p className="text-xs text-gray-500">{supplier.phone || "-"}</p>
                      </td>
                      <td>
                        <span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">
                          {supplier.status}
                        </span>
                      </td>
                      <td>{(supplier.brands || []).map((brand) => brand.name).join(", ") || "-"}</td>
                      <td>
                        {(supplier.products || []).slice(0, 3).map((product) => (
                          <p key={product.id} className="text-xs">
                            {product.product_name} <span className="text-gray-400">({product.product_source})</span>
                          </p>
                        ))}
                        {(supplier.products || []).length > 3 && (
                          <p className="text-xs text-gray-500">+{supplier.products.length - 3} more</p>
                        )}
                      </td>
                      <td>
                        <span className="font-medium text-orange-700">
                          {(supplier.lowStockProducts || []).length}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => editSupplier(supplier)} className="rounded-lg border px-3 py-1.5 text-xs">
                            Edit
                          </button>
                          <button onClick={() => removeSupplier(supplier.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600">
                            Delete
                          </button>
                          <button onClick={() => openLowStockWhatsapp(supplier)} className="rounded-lg bg-[#A68B5B] px-3 py-1.5 text-xs text-white">
                            WhatsApp Low Stock
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredSuppliers.length && (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-gray-500">
                        No suppliers found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2"
      />
    </label>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default Supplier;
