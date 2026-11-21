import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteAdminCollection,
  getAdminCollections,
  updateAdminCollectionStatus,
} from "../lib/adminApi";

function CollectionManagement() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0 });
  const [filters, setFilters] = useState({ q: "", type: "", status: "", page: 1 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  };

  const loadCollections = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const response = await getAdminCollections({ ...nextFilters, limit: pagination.limit });
      setCollections(response.collections || []);
      setPagination(response.pagination || pagination);
    } catch (error) {
      showToast(error.message || "Unable to load collections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []);

  const metrics = useMemo(() => ({
    total: pagination.total || collections.length,
    automatic: collections.filter((item) => item.type === "automatic").length,
    manual: collections.filter((item) => item.type === "manual").length,
  }), [collections, pagination.total]);

  const updateFilter = (key, value) => {
    const next = { ...filters, [key]: value, page: 1 };
    setFilters(next);
    loadCollections(next);
  };

  const toggleStatus = async (collection) => {
    await updateAdminCollectionStatus(collection.id, collection.status === "Active" ? "Inactive" : "Active");
    await loadCollections();
  };

  const removeCollection = async (collection) => {
    if (!window.confirm(`Delete ${collection.name}?`)) return;
    await deleteAdminCollection(collection.id);
    showToast("Collection deleted");
    await loadCollections();
  };

  const openStorefrontCollection = (collection) => {
    const origin = window.location.origin.includes("localhost:5174")
      ? "http://localhost:5173"
      : window.location.origin;
    window.open(`${origin}/collections/${collection.slug}`, "_blank");
  };

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 12)));

  return (
    <div className="min-h-screen bg-[#F6F4EF] p-4 md:p-6">
      {toast && <div className="fixed right-5 top-20 z-50 rounded-lg bg-black px-4 py-2 text-sm text-white">{toast}</div>}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Collection Management</h1>
          <p className="text-sm text-gray-500">Build manual and automatic product groups for storefront merchandising.</p>
        </div>
        <button onClick={() => navigate("/collections/new")} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">Add Collection</button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Total Collections" value={metrics.total} />
        <Metric label="Automatic" value={metrics.automatic} />
        <Metric label="Manual" value={metrics.manual} />
      </div>

      <section className="mt-5 rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search collections" className="rounded-lg border px-3 py-2 text-sm md:col-span-2" />
          <select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">All Types</option>
            <option value="automatic">Automatic</option>
            <option value="manual">Manual</option>
          </select>
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">All Status</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-[#FBF8F2] text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">Collection</th>
                <th className="p-3">Type</th>
                <th className="p-3">Slug</th>
                <th className="p-3">Products</th>
                <th className="p-3">Status</th>
                <th className="p-3">Updated</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="p-6 text-center text-gray-500">Loading collections...</td></tr>
              ) : collections.length ? collections.map((collection) => (
                <tr key={collection.id} className="border-t">
                  <td className="p-3">
                    <button onClick={() => navigate(`/collections/${collection.id}`)} className="text-left">
                      <p className="font-semibold">{collection.name}</p>
                      <p className="line-clamp-1 max-w-md text-xs text-gray-500">{collection.description || "No description"}</p>
                    </button>
                  </td>
                  <td className="p-3 capitalize">{collection.type}</td>
                  <td className="p-3 text-gray-500">{collection.slug}</td>
                  <td className="p-3">{collection.product_count || 0}</td>
                  <td className="p-3">
                    <button onClick={() => toggleStatus(collection)} className={`rounded-full px-3 py-1 text-xs ${collection.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{collection.status}</button>
                  </td>
                  <td className="p-3 text-gray-500">{collection.updated_at ? new Date(collection.updated_at).toLocaleDateString("en-IN") : "-"}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => navigate(`/collections/${collection.id}`)} className="rounded border px-3 py-1 text-xs">Details</button>
                      <button onClick={() => openStorefrontCollection(collection)} className="rounded border px-3 py-1 text-xs">Preview</button>
                      <button onClick={() => removeCollection(collection)} className="rounded border border-red-200 px-3 py-1 text-xs text-red-600">Delete</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="7" className="p-6 text-center text-gray-500">No collections found.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span>Page {pagination.page || 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={(pagination.page || 1) <= 1} onClick={() => {
              const next = { ...filters, page: (pagination.page || 1) - 1 };
              setFilters(next);
              loadCollections(next);
            }} className="rounded border px-3 py-1 disabled:opacity-50">Previous</button>
            <button disabled={(pagination.page || 1) >= totalPages} onClick={() => {
              const next = { ...filters, page: (pagination.page || 1) + 1 };
              setFilters(next);
              loadCollections(next);
            }} className="rounded border px-3 py-1 disabled:opacity-50">Next</button>
          </div>
        </div>
      </section>
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

export default CollectionManagement;
