import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteAdminBrand,
  getAdminBrands,
  restoreAdminBrand,
  updateAdminBrandFeatured,
  updateAdminBrandStatus,
  downloadAdminXlsx,
  runBulkAction,
} from "../lib/adminApi";
import ConfirmDialog from "../components/ConfirmDialog";

function BrandManagement() {
  const navigate = useNavigate();
  const [brands, setBrands] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0 });
  const [filters, setFilters] = useState({ q: "", status: "", deleted: "", sort: "name", page: 1 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  };

  const loadBrands = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const response = await getAdminBrands({ ...nextFilters, limit: pagination.limit });
      setBrands(response.brands || []);
      setPagination(response.pagination || pagination);
    } catch (error) {
      showToast(error.message || "Unable to load brands");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrands();
  }, []);

  const metrics = useMemo(() => {
    return {
      total: pagination.total || brands.length,
      featured: brands.filter((brand) => brand.featured).length,
      active: brands.filter((brand) => brand.status === "Active" && !brand.deleted_at).length,
    };
  }, [brands, pagination.total]);

  const updateFilter = (key, value) => {
    const next = { ...filters, [key]: value, page: 1 };
    setFilters(next);
    loadBrands(next);
  };

  const toggleStatus = async (brand) => {
    await updateAdminBrandStatus(brand.id, brand.status === "Active" ? "Inactive" : "Active");
    await loadBrands();
  };

  const toggleFeatured = async (brand) => {
    await updateAdminBrandFeatured(brand.id, !brand.featured);
    await loadBrands();
  };

  const removeBrandNow = async (brand) => {
    setConfirmAction(null);
    await deleteAdminBrand(brand.id);
    showToast("Brand deleted");
    await loadBrands();
  };

  const removeBrand = async (brand) => {
    setConfirmAction({
      title: "Delete brand?",
      message: `Soft delete "${brand.name}"? Product records remain intact.`,
      confirmLabel: "YES",
      tone: "danger",
      onConfirm: () => removeBrandNow(brand),
    });
  };

  const restoreBrand = async (brand) => {
    await restoreAdminBrand(brand.id);
    showToast("Brand restored");
    await loadBrands();
  };

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 12)));
  const bulk = async (action) => { if (!selectedIds.length) return showToast("Select brands first"); const response = await runBulkAction("brands", action, selectedIds); setSelectedIds([]); showToast(`${response.result?.[action === "archive" ? "archived" : "deleted"]?.length || 0} brand(s) updated`); await loadBrands(); };
  const allVisibleSelected = brands.length > 0 && brands.every((brand) => selectedIds.includes(brand.id));

  return (
    <div className="min-h-screen bg-[#F6F4EF] p-4 md:p-6">
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel || "YES"}
        tone={confirmAction?.tone}
        onConfirm={confirmAction?.onConfirm}
        onDiscard={() => setConfirmAction(null)}
      />
      {toast && <div className="fixed right-5 top-20 z-50 rounded-lg bg-black px-4 py-2 text-sm text-white">{toast}</div>}

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brand Management</h1>
          <p className="text-sm text-gray-500">Manage storefront brands, logos, banners, SEO details, and product relationships.</p>
        </div>
        <div className="flex flex-wrap gap-2"><button onClick={() => downloadAdminXlsx("brands", selectedIds.length ? { ids: selectedIds.join(",") } : {})} className="rounded-lg bg-black px-4 py-2 text-sm text-white">Export XLSX</button><button onClick={() => bulk("archive")} className="rounded-lg border bg-white px-4 py-2 text-sm">Archive selected</button><button onClick={() => bulk("delete")} className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white">Delete selected</button><button onClick={() => navigate("/brands/new")} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">Add Brand</button></div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Total Brands" value={metrics.total} />
        <Metric label="Featured Brands" value={metrics.featured} />
        <Metric label="Active Brands" value={metrics.active} />
      </div>

      <div className="mt-5 rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <input
            value={filters.q}
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="Search brands"
            className="rounded-lg border px-3 py-2 text-sm md:col-span-2"
          />
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <select value={filters.deleted} onChange={(event) => updateFilter("deleted", event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">Visible Brands</option>
            <option value="true">Deleted Brands</option>
          </select>
          <select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="name">Name A-Z</option>
            <option value="newest">Newest</option>
            <option value="products">Product Count</option>
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-[#FBF8F2] text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3"><input type="checkbox" aria-label="Select all brands" checked={allVisibleSelected} onChange={(event) => setSelectedIds(event.target.checked ? brands.map((brand) => brand.id) : [])} /></th>
                <th className="p-3">Brand</th>
                <th className="p-3">Slug</th>
                <th className="p-3">Products</th>
                <th className="p-3">Featured</th>
                <th className="p-3">Status</th>
                <th className="p-3">Updated</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="p-6 text-center text-gray-500">Loading brands...</td></tr>
              ) : brands.length ? (
                brands.map((brand) => (
                  <tr key={brand.id} className="border-t">
                    <td className="p-3"><input type="checkbox" checked={selectedIds.includes(brand.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, brand.id] : selectedIds.filter((id) => id !== brand.id))} /></td>
                    <td className="p-3">
                      <button onClick={() => navigate(`/brands/${brand.id}`)} className="flex items-center gap-3 text-left">
                        <BrandImage src={brand.logo} name={brand.name} />
                        <div>
                          <p className="font-semibold">{brand.name}</p>
                          <p className="line-clamp-1 max-w-xs text-xs text-gray-500">{brand.description || "No description"}</p>
                        </div>
                      </button>
                    </td>
                    <td className="p-3 text-gray-600">{brand.slug}</td>
                    <td className="p-3">{brand.product_count || 0}</td>
                    <td className="p-3">
                      <button onClick={() => toggleFeatured(brand)} className={`rounded-full px-3 py-1 text-xs ${brand.featured ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                        {brand.featured ? "Featured" : "Normal"}
                      </button>
                    </td>
                    <td className="p-3">
                      <button onClick={() => toggleStatus(brand)} className={`rounded-full px-3 py-1 text-xs ${brand.status === "Active" && !brand.deleted_at ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {brand.deleted_at ? "Deleted" : brand.status}
                      </button>
                    </td>
                    <td className="p-3 text-gray-500">{brand.updated_at ? new Date(brand.updated_at).toLocaleDateString("en-IN") : "-"}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => navigate(`/brands/${brand.id}`)} className="rounded border px-3 py-1 text-xs">Details</button>
                        {brand.deleted_at ? (
                          <button onClick={() => restoreBrand(brand)} className="rounded border px-3 py-1 text-xs text-green-700">Restore</button>
                        ) : (
                          <button onClick={() => removeBrand(brand)} className="rounded border border-red-200 px-3 py-1 text-xs text-red-600">Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="7" className="p-6 text-center text-gray-500">No brands found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span>Page {pagination.page || 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={(pagination.page || 1) <= 1}
              onClick={() => {
                const next = { ...filters, page: (pagination.page || 1) - 1 };
                setFilters(next);
                loadBrands(next);
              }}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={(pagination.page || 1) >= totalPages}
              onClick={() => {
                const next = { ...filters, page: (pagination.page || 1) + 1 };
                setFilters(next);
                loadBrands(next);
              }}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
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

function BrandImage({ src, name }) {
  if (src) {
    return <img src={src} alt={name} className="h-12 w-12 rounded-lg border object-contain p-1" />;
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-[#FBF8F2] text-sm font-semibold text-[#A68B5B]">
      {String(name || "B").charAt(0).toUpperCase()}
    </div>
  );
}

export default BrandManagement;
