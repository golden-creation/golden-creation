import React, { useEffect, useMemo, useState } from "react";
import {
  bulkDeleteAdminTags,
  createAdminTag,
  deleteAdminTag,
  getAdminTags,
  updateAdminTag,
  updateAdminTagStatus,
} from "../lib/adminApi";
import useEditorScroll from "../hooks/useEditorScroll";

const emptyForm = { id: "", name: "", slug: "", status: "Active" };

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function TagManagement() {
  const [tags, setTags] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [filters, setFilters] = useState({ q: "", status: "", page: 1 });
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const { editorRef, scrollToEditor } = useEditorScroll();

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  };

  const loadTags = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const response = await getAdminTags({ ...nextFilters, limit: pagination.limit });
      setTags(response.tags || []);
      setPagination(response.pagination || pagination);
    } catch (error) {
      showToast(error.message || "Unable to load tags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  const metrics = useMemo(() => ({
    total: pagination.total || tags.length,
    active: tags.filter((tag) => tag.status === "Active").length,
    linked: tags.reduce((sum, tag) => sum + Number(tag.product_count || 0), 0),
  }), [tags, pagination.total]);

  const updateFilter = (key, value) => {
    const next = { ...filters, [key]: value, page: 1 };
    setFilters(next);
    loadTags(next);
  };

  const updateForm = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "name" && (!current.id || current.slug === slugify(current.name))) {
        next.slug = slugify(value);
      }
      if (field === "slug") next.slug = slugify(value);
      return next;
    });
  };

  const editTag = (tag) => {
    setForm({ id: tag.id, name: tag.name, slug: tag.slug, status: tag.status });
    scrollToEditor(true);
  };

  const saveTag = async () => {
    if (!form.name.trim()) {
      showToast("Tag name is required");
      return;
    }

    try {
      if (form.id) {
        await updateAdminTag(form.id, form);
        showToast("Tag updated");
      } else {
        await createAdminTag(form);
        showToast("Tag created");
      }
      setForm(emptyForm);
      await loadTags();
    } catch (error) {
      showToast(error.message || "Unable to save tag");
    }
  };

  const toggleStatus = async (tag) => {
    await updateAdminTagStatus(tag.id, tag.status === "Active" ? "Inactive" : "Active");
    await loadTags();
  };

  const removeTag = async (tag) => {
    if (!window.confirm(`Delete ${tag.name}? Products will keep working, but this tag will be inactive.`)) return;
    await deleteAdminTag(tag.id);
    showToast("Tag deleted");
    await loadTags();
  };

  const removeSelected = async () => {
    if (!selected.length) {
      showToast("Select tags first");
      return;
    }
    if (!window.confirm(`Delete ${selected.length} selected tags?`)) return;
    await bulkDeleteAdminTags(selected);
    setSelected([]);
    showToast("Selected tags deleted");
    await loadTags();
  };

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20)));
  const allVisibleSelected = tags.length > 0 && tags.every((tag) => selected.includes(tag.id));

  return (
    <div className="min-h-screen bg-[#F6F4EF] p-4 md:p-6">
      {toast && <div className="fixed right-5 top-20 z-50 rounded-lg bg-black px-4 py-2 text-sm text-white">{toast}</div>}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tag Management</h1>
          <p className="text-sm text-gray-500">Create product tags for search, filtering, automatic collections, and merchandising rules.</p>
        </div>
        <button onClick={removeSelected} className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-600">Bulk Delete</button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Total Tags" value={metrics.total} />
        <Metric label="Active Tags" value={metrics.active} />
        <Metric label="Product Links" value={metrics.linked} />
      </div>

      <div className="mt-5 flex flex-col gap-5">
        <section ref={editorRef} className="order-2 scroll-mt-24 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{form.id ? "Edit Tag" : "Add Tag"}</h2>
          <label className="mt-4 block">
            <span className="text-xs font-medium text-gray-500">Tag Name</span>
            <input data-editor-primary value={form.name} onChange={(event) => updateForm("name", event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Trending" />
          </label>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-gray-500">Slug</span>
            <input value={form.slug} onChange={(event) => updateForm("slug", event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="trending" />
          </label>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-gray-500">Status</span>
            <select value={form.status} onChange={(event) => updateForm("status", event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </label>
          <div className="mt-4 flex gap-2">
            <button onClick={saveTag} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">Save Tag</button>
            {form.id && <button onClick={() => setForm(emptyForm)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>}
          </div>
        </section>

        <section className="order-1 min-w-0 rounded-xl border bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search tags" className="rounded-lg border px-3 py-2 text-sm md:col-span-2" />
            <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-lg border px-3 py-2 text-sm">
              <option value="">All Status</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="bg-[#FBF8F2] text-xs uppercase text-gray-500">
                <tr>
                  <th className="p-3"><input type="checkbox" aria-label="Select all tags" checked={allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? tags.map((tag) => tag.id) : [])} /></th>
                  <th className="p-3">Tag</th>
                  <th className="p-3">Slug</th>
                  <th className="p-3">Products</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="p-6 text-center text-gray-500">Loading tags...</td></tr>
                ) : tags.length ? tags.map((tag) => (
                  <tr key={tag.id} className="border-t">
                    <td className="p-3"><input type="checkbox" checked={selected.includes(tag.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, tag.id] : current.filter((id) => id !== tag.id))} /></td>
                    <td className="p-3 font-semibold">{tag.name}</td>
                    <td className="p-3 text-gray-500">{tag.slug}</td>
                    <td className="p-3">{tag.product_count || 0}</td>
                    <td className="p-3">
                      <button onClick={() => toggleStatus(tag)} className={`rounded-full px-3 py-1 text-xs ${tag.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{tag.status}</button>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => editTag(tag)} className="rounded border px-3 py-1 text-xs">Edit</button>
                        <button onClick={() => removeTag(tag)} className="rounded border border-red-200 px-3 py-1 text-xs text-red-600">Delete</button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="6" className="p-6 text-center text-gray-500">No tags found.</td></tr>
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
                loadTags(next);
              }} className="rounded border px-3 py-1 disabled:opacity-50">Previous</button>
              <button disabled={(pagination.page || 1) >= totalPages} onClick={() => {
                const next = { ...filters, page: (pagination.page || 1) + 1 };
                setFilters(next);
                loadTags(next);
              }} className="rounded border px-3 py-1 disabled:opacity-50">Next</button>
            </div>
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

export default TagManagement;
