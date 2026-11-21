import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Clipboard,
  Copy,
  ExternalLink,
  FilePlus2,
  Download,
  LoaderCircle,
  Mail,
  MessageCircle,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import RemoteLookup from "../components/RemoteLookup";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  archiveSalesCatalog,
  createSalesCatalog,
  deleteSalesCatalog,
  duplicateSalesCatalog,
  downloadSalesCatalog,
  generateSalesCatalog,
  getSalesCatalog,
  getSalesCatalogs,
  getSalesLeads,
  recordSalesCatalogShare,
  searchSalesCatalogProducts,
  updateSalesCatalog,
} from "../lib/adminApi";

const emptyFilters = {
  q: "",
  categoryIds: [],
  brandIds: [],
  tagIds: [],
  collectionIds: [],
  minPrice: "",
  maxPrice: "",
  inStock: true,
  sort: "name_asc",
};

export default function SalesCatalogManagement() {
  const [catalogs, setCatalogs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [listFilters, setListFilters] = useState({ q: "", status: "", page: 1 });
  const [draftId, setDraftId] = useState(null);
  const [name, setName] = useState("");
  const [leadId, setLeadId] = useState("");
  const [layout, setLayout] = useState("2x2");
  const [filters, setFilters] = useState(emptyFilters);
  const [filterLabels, setFilterLabels] = useState({ categories: {}, brands: {}, tags: {}, collections: {} });
  const [results, setResults] = useState([]);
  const [resultPagination, setResultPagination] = useState({ page: 1, limit: 24, total: 0 });
  const [selected, setSelected] = useState([]);
  const [lookups, setLookups] = useState({ category: null, brand: null, tag: null, collection: null });
  const [loadingResults, setLoadingResults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const builderRef = useRef(null);

  const loadCatalogs = async (next = listFilters) => {
    try {
      const payload = await getSalesCatalogs(next);
      setCatalogs(payload.catalogs || []);
      setPagination(payload.pagination || pagination);
    } catch (error) {
      setMessage(error.message || "Unable to load catalogs");
    }
  };

  const loadLeads = async () => {
    try {
      const payload = await getSalesLeads({ limit: 100 });
      setLeads(payload.leads || []);
    } catch {
      setLeads([]);
    }
  };

  useEffect(() => {
    loadCatalogs();
    loadLeads();
  }, []);

  useEffect(() => {
    if (!catalogs.some((catalog) => catalog.status === "Generating")) return undefined;
    const timer = window.setInterval(() => loadCatalogs(), 4000);
    return () => window.clearInterval(timer);
  }, [catalogs, listFilters]);

  const selectedIds = useMemo(() => selected.map((product) => Number(product.id || product.productId)), [selected]);
  const totalPages = Math.max(1, Math.ceil(Number(pagination.total || 0) / Number(pagination.limit || 20)));
  const resultPages = Math.max(1, Math.ceil(Number(resultPagination.total || 0) / Number(resultPagination.limit || 24)));

  const resetBuilder = () => {
    setDraftId(null);
    setName("");
    setLeadId("");
    setLayout("2x2");
    setFilters(emptyFilters);
    setFilterLabels({ categories: {}, brands: {}, tags: {}, collections: {} });
    setResults([]);
    setSelected([]);
  };

  const searchProducts = async (page = 1, limit = 24) => {
    setLoadingResults(true);
    try {
      const payload = await searchSalesCatalogProducts({ ...filters, page, limit });
      setResults(payload.products || []);
      setResultPagination(payload.pagination || { page, limit, total: 0 });
    } catch (error) {
      setMessage(error.message || "Unable to search products");
    } finally {
      setLoadingResults(false);
    }
  };

  const selectAllMatching = async () => {
    setLoadingResults(true);
    try {
      const payload = await searchSalesCatalogProducts({ ...filters, page: 1, limit: 200 });
      setSelected((payload.products || []).slice(0, 200));
      setMessage(`${Math.min(payload.products?.length || 0, 200)} matching products selected.`);
    } catch (error) {
      setMessage(error.message || "Unable to select matching products");
    } finally {
      setLoadingResults(false);
    }
  };

  const toggleProduct = (product) => {
    const id = Number(product.id || product.productId);
    setSelected((current) =>
      current.some((item) => Number(item.id || item.productId) === id)
        ? current.filter((item) => Number(item.id || item.productId) !== id)
        : current.length >= 200
          ? current
          : [...current, product]
    );
  };

  const moveProduct = (index, direction) => {
    setSelected((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const saveDraft = async (generateAfter = false) => {
    if (!name.trim() || !selected.length) {
      setMessage("Catalog name and at least one product are required.");
      return;
    }
    setSaving(true);
    try {
      const savedFilters = {
        ...filters,
        categoryLabels: filters.categoryIds.map((id) => ({ id, label: filterLabels.categories[id] || `#${id}` })),
        brandLabels: filters.brandIds.map((id) => ({ id, label: filterLabels.brands[id] || `#${id}` })),
        tagLabels: filters.tagIds.map((id) => ({ id, label: filterLabels.tags[id] || `#${id}` })),
        collectionLabels: filters.collectionIds.map((id) => ({ id, label: filterLabels.collections[id] || `#${id}` })),
      };
      const payload = { name, leadId: leadId || null, layout, filters: savedFilters, productIds: selectedIds };
      const response = draftId
        ? await updateSalesCatalog(draftId, payload)
        : await createSalesCatalog(payload);
      const id = response.id || draftId;
      setDraftId(id);
      setMessage("Catalog draft saved.");
      if (generateAfter) {
        await generateSalesCatalog(id);
        setMessage("Catalog generation started. Its status will refresh automatically.");
        resetBuilder();
      }
      await loadCatalogs();
    } catch (error) {
      setMessage(error.message || "Unable to save catalog");
    } finally {
      setSaving(false);
    }
  };

  const editDraft = async (catalog) => {
    try {
      const payload = await getSalesCatalog(catalog.id);
      const detail = payload.catalog;
      setDraftId(detail.id);
      setName(detail.name || "");
      setLeadId(detail.lead_id || "");
      setLayout(detail.layout || "2x2");
      setFilters({ ...emptyFilters, ...(detail.filters || {}) });
      setSelected(detail.products || []);
      setFilterLabels({
        categories: Object.fromEntries((detail.filters?.categoryLabels || []).map((item) => [Number(item.id), item.label])),
        brands: Object.fromEntries((detail.filters?.brandLabels || []).map((item) => [Number(item.id), item.label])),
        tags: Object.fromEntries((detail.filters?.tagLabels || []).map((item) => [Number(item.id), item.label])),
        collections: Object.fromEntries((detail.filters?.collectionLabels || []).map((item) => [Number(item.id), item.label])),
      });
      requestAnimationFrame(() => builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setMessage(error.message || "Unable to open catalog draft");
    }
  };

  const duplicate = async (catalog) => {
    try {
      const response = await duplicateSalesCatalog(catalog.id);
      setMessage("Catalog duplicated as an editable draft.");
      await loadCatalogs();
      const payload = await getSalesCatalog(response.id);
      await editDraft(payload.catalog);
    } catch (error) {
      setMessage(error.message || "Unable to duplicate catalog");
    }
  };

  const archiveNow = async (catalog) => {
    setConfirmAction(null);
    try {
      await archiveSalesCatalog(catalog.id);
      setMessage("Catalog archived and its public link revoked.");
      await loadCatalogs();
    } catch (error) {
      setMessage(error.message || "Unable to archive catalog");
    }
  };

  const archive = async (catalog) => {
    setConfirmAction({
      title: "Archive catalog?",
      message: `Archive "${catalog.name}" and revoke its public link?`,
      confirmLabel: "YES",
      tone: "danger",
      onConfirm: () => archiveNow(catalog),
    });
  };

  const deleteCatalogNow = async (catalog) => {
    setConfirmAction(null);
    try {
      await deleteSalesCatalog(catalog.id);
      setMessage("Catalog deleted.");
      if (draftId === catalog.id) resetBuilder();
      await loadCatalogs();
    } catch (error) {
      setMessage(error.message || "Unable to delete catalog");
    }
  };

  const deleteCatalog = async (catalog) => {
    setConfirmAction({
      title: "Delete catalog?",
      message: `Permanently delete "${catalog.name}"? Ready catalog links and stored PDFs will be removed.`,
      confirmLabel: "YES",
      tone: "danger",
      onConfirm: () => deleteCatalogNow(catalog),
    });
  };

  const share = async (catalog, channel) => {
    const url = catalog.publicUrl;
    if (!url) return;
    const messageText = `Golden Creation has prepared "${catalog.name}" for you. View or download the catalog: ${url}`;
    const phone = String(catalog.lead_whatsapp || catalog.lead_phone || "").replace(/\D/g, "");
    const email = catalog.lead_email || "";
    await recordSalesCatalogShare(catalog.id, { channel, recipient: channel === "WhatsApp" ? phone : email }).catch(() => {});
    if (channel === "WhatsApp") {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`, "_blank", "noopener,noreferrer");
    } else if (channel === "Email") {
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(catalog.name)}&body=${encodeURIComponent(messageText)}`;
    } else {
      await navigator.clipboard.writeText(url);
      setMessage("Catalog link copied.");
    }
  };

  const download = async (catalog) => {
    try {
      await downloadSalesCatalog(catalog.id, catalog.name);
    } catch (error) {
      setMessage(error.message || "Unable to download catalog");
    }
  };

  const addFilter = (type, option) => {
    if (!option) return;
    const config = {
      category: ["categoryIds", "categories"],
      brand: ["brandIds", "brands"],
      tag: ["tagIds", "tags"],
      collection: ["collectionIds", "collections"],
    }[type];
    const [key, labelKey] = config;
    if (!filters[key].includes(Number(option.id))) {
      setFilters({ ...filters, [key]: [...filters[key], Number(option.id)] });
      setFilterLabels({ ...filterLabels, [labelKey]: { ...filterLabels[labelKey], [Number(option.id)]: option.label } });
    }
    setLookups({ ...lookups, [type]: null });
  };

  const removeFilter = (key, labelKey, id) => {
    const nextLabels = { ...filterLabels[labelKey] };
    delete nextLabels[id];
    setFilters({ ...filters, [key]: filters[key].filter((value) => Number(value) !== Number(id)) });
    setFilterLabels({ ...filterLabels, [labelKey]: nextLabels });
  };

  const updateListFilter = (key, value) => {
    const next = { ...listFilters, [key]: value, page: 1 };
    setListFilters(next);
    loadCatalogs(next);
  };

  const setListPage = (page) => {
    const next = { ...listFilters, page };
    setListFilters(next);
    loadCatalogs(next);
  };

  return (
    <main className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel || "YES"}
        tone={confirmAction?.tone}
        onConfirm={confirmAction?.onConfirm}
        onDiscard={() => setConfirmAction(null)}
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Catalog Sharing</h1>
          <p className="text-sm text-gray-500">Build branded, clickable PDF catalogs and share secure links with corporate leads.</p>
        </div>
        <button type="button" onClick={() => { resetBuilder(); requestAnimationFrame(() => builderRef.current?.scrollIntoView({ behavior: "smooth" })); }} className="inline-flex items-center gap-2 rounded bg-[#A68B5B] px-4 py-2 text-sm text-white">
          <FilePlus2 size={16} /> New Catalog
        </button>
      </div>

      {message && <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}

      <section ref={builderRef} className="mt-5 scroll-mt-24 rounded border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold">{draftId ? `Edit Catalog Draft #${draftId}` : "Build a Catalog"}</h2><p className="text-xs text-gray-500">Maximum 200 products. In-stock products are enabled by default.</p></div>
          {draftId && <button type="button" onClick={resetBuilder} className="rounded border px-3 py-1.5 text-xs">Close draft</button>}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Field label="Catalog Name" value={name} onChange={setName} placeholder="Parker Pens Under Rs. 2,000" />
          <label className="text-sm"><span className="font-medium">Linked Lead (optional)</span><select value={leadId} onChange={(event) => setLeadId(event.target.value)} className="mt-1 w-full rounded border px-3 py-2"><option value="">No linked lead</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.lead_name} - {lead.company_name || lead.contact_person || `#${lead.id}`}</option>)}</select></label>
          <label className="text-sm"><span className="font-medium">PDF Layout</span><select value={layout} onChange={(event) => setLayout(event.target.value)} className="mt-1 w-full rounded border px-3 py-2"><option value="2x2">2 x 2 - Detailed (4/page)</option><option value="2x4">2 x 4 - Compact (8/page)</option></select></label>
        </div>

        <div className="mt-5 rounded border bg-[#FBF8F2] p-4">
          <h3 className="font-medium">Product Filters</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Keyword" value={filters.q} onChange={(q) => setFilters({ ...filters, q })} placeholder="Product, SKU or description" />
            <MultiFilter label="Categories" type="categories" value={lookups.category} onChange={(option) => addFilter("category", option)} ids={filters.categoryIds} labels={filterLabels.categories} onRemove={(id) => removeFilter("categoryIds", "categories", id)} />
            <MultiFilter label="Brands" type="brands" value={lookups.brand} onChange={(option) => addFilter("brand", option)} ids={filters.brandIds} labels={filterLabels.brands} onRemove={(id) => removeFilter("brandIds", "brands", id)} />
            <MultiFilter label="Tags" type="tags" value={lookups.tag} onChange={(option) => addFilter("tag", option)} ids={filters.tagIds} labels={filterLabels.tags} onRemove={(id) => removeFilter("tagIds", "tags", id)} />
            <MultiFilter label="Collections" type="collections" value={lookups.collection} onChange={(option) => addFilter("collection", option)} ids={filters.collectionIds} labels={filterLabels.collections} onRemove={(id) => removeFilter("collectionIds", "collections", id)} />
            <Field label="Minimum Price" type="number" value={filters.minPrice} onChange={(minPrice) => setFilters({ ...filters, minPrice })} />
            <Field label="Maximum Price" type="number" value={filters.maxPrice} onChange={(maxPrice) => setFilters({ ...filters, maxPrice })} />
            <label className="text-sm"><span className="font-medium">Sort</span><select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })} className="mt-1 w-full rounded border bg-white px-3 py-2"><option value="name_asc">Name A-Z</option><option value="name_desc">Name Z-A</option><option value="price_asc">Price low-high</option><option value="price_desc">Price high-low</option><option value="newest">Newest</option></select></label>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.inStock} onChange={(event) => setFilters({ ...filters, inStock: event.target.checked })} /> Only products currently in stock</label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => searchProducts(1)} className="inline-flex items-center gap-2 rounded bg-black px-4 py-2 text-sm text-white"><Search size={15} /> Apply Filters</button>
            <button type="button" onClick={selectAllMatching} className="rounded border bg-white px-4 py-2 text-sm">Select all matching (max 200)</button>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="min-w-0 rounded border">
            <div className="flex items-center justify-between border-b px-4 py-3"><h3 className="font-medium">Search Results</h3><span className="text-xs text-gray-500">{resultPagination.total || 0} matches</span></div>
            {loadingResults ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500"><LoaderCircle className="animate-spin" size={17} /> Searching...</div> : (
              <div className="grid max-h-[620px] gap-3 overflow-y-auto p-3 sm:grid-cols-2">
                {results.map((product) => {
                  const active = selectedIds.includes(Number(product.id));
                  return <button key={product.id} type="button" onClick={() => toggleProduct(product)} className={`flex min-w-0 gap-3 rounded border p-3 text-left ${active ? "border-[#A68B5B] bg-amber-50" : "bg-white"}`}>
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-gray-100">{product.image_url ? <img src={product.image_url} alt="" className="h-full w-full rounded object-contain" /> : <span className="text-[10px] text-gray-400">No image</span>}</div>
                    <div className="min-w-0"><p className="line-clamp-2 text-sm font-medium">{product.name}</p><p className="mt-1 text-xs text-gray-500">{product.brand_name || "-"} | {product.category_name || "-"}</p><p className="mt-1 text-sm font-semibold text-[#A06422]">Rs. {Number(product.price || 0).toLocaleString("en-IN")}</p></div>
                  </button>;
                })}
                {!results.length && <div className="col-span-full p-8 text-center text-sm text-gray-500">Apply filters to find products.</div>}
              </div>
            )}
            {resultPagination.total > 0 && <div className="flex items-center justify-between border-t p-3 text-xs"><span>Page {resultPagination.page} of {resultPages}</span><div className="flex gap-2"><button disabled={resultPagination.page <= 1} onClick={() => searchProducts(resultPagination.page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><button disabled={resultPagination.page >= resultPages} onClick={() => searchProducts(resultPagination.page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div></div>}
          </section>

          <section className="rounded border">
            <div className="flex items-center justify-between border-b px-4 py-3"><h3 className="font-medium">Selected Products</h3><span className="text-xs font-semibold">{selected.length}/200</span></div>
            <div className="max-h-[620px] space-y-2 overflow-y-auto p-3">
              {selected.map((product, index) => <div key={product.id || product.productId} className="flex items-center gap-2 rounded border p-2">
                <span className="w-6 text-center text-xs text-gray-400">{index + 1}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{product.name}</p><p className="text-[10px] text-gray-400">{product.sku || "-"}</p></div>
                <button type="button" disabled={index === 0} onClick={() => moveProduct(index, -1)} title="Move up" className="p-1 disabled:opacity-30"><ArrowUp size={14} /></button>
                <button type="button" disabled={index === selected.length - 1} onClick={() => moveProduct(index, 1)} title="Move down" className="p-1 disabled:opacity-30"><ArrowDown size={14} /></button>
                <button type="button" onClick={() => toggleProduct(product)} title="Remove" className="p-1 text-red-600"><Trash2 size={14} /></button>
              </div>)}
              {!selected.length && <p className="p-6 text-center text-sm text-gray-500">No products selected.</p>}
            </div>
          </section>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={saving} onClick={() => saveDraft(false)} className="rounded border px-5 py-2 text-sm disabled:opacity-50">{saving ? "Saving..." : "Save Draft"}</button>
          <button type="button" disabled={saving} onClick={() => saveDraft(true)} className="inline-flex items-center gap-2 rounded bg-[#A68B5B] px-5 py-2 text-sm text-white disabled:opacity-50"><Play size={15} /> Save and Generate PDF</button>
        </div>
      </section>

      <section className="mt-6 rounded border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="font-semibold">Catalog History</h2>
          <div className="flex flex-wrap gap-2">
            <input value={listFilters.q} onChange={(event) => updateListFilter("q", event.target.value)} placeholder="Search catalogs..." className="rounded border px-3 py-2 text-sm" />
            <select value={listFilters.status} onChange={(event) => updateListFilter("status", event.target.value)} className="rounded border px-3 py-2 text-sm"><option value="">All statuses</option>{["Draft", "Generating", "Ready", "Failed", "Archived"].map((status) => <option key={status}>{status}</option>)}</select>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b bg-[#FBF8F2] text-xs uppercase text-gray-500"><tr><th className="p-3">Catalog</th><th>Lead</th><th>Products</th><th>Layout</th><th>Status</th><th>Created By</th><th>Updated</th><th>Actions</th></tr></thead>
            <tbody>
              {catalogs.map((catalog) => <tr key={catalog.id} className="border-b">
                <td className="p-3"><p className="font-semibold">{catalog.name}</p><p className="text-xs text-gray-400">#{catalog.id}</p></td>
                <td>{catalog.lead_name || "-"}</td><td>{catalog.product_count || 0}</td><td>{catalog.layout}</td>
                <td><span className={`rounded-full px-2 py-1 text-xs ${catalog.status === "Ready" ? "bg-green-100 text-green-700" : catalog.status === "Failed" ? "bg-red-100 text-red-700" : catalog.status === "Generating" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{catalog.status}</span>{catalog.error_message && <p className="mt-1 max-w-52 text-xs text-red-600">{catalog.error_message}</p>}</td>
                <td>{catalog.creator_name}</td><td>{new Date(catalog.updated_at).toLocaleString()}</td>
                <td><div className="flex flex-wrap gap-1.5">
                  {["Draft", "Failed"].includes(catalog.status) && <button type="button" onClick={() => editDraft(catalog)} className="rounded border px-2 py-1 text-xs">Edit</button>}
                  {catalog.status !== "Archived" && <button type="button" onClick={() => duplicate(catalog)} title="Duplicate" className="rounded border p-1.5"><Copy size={13} /></button>}
                  {catalog.status === "Ready" && <>
                    <a href={catalog.publicUrl} target="_blank" rel="noreferrer" title="Open PDF" className="rounded border p-1.5"><ExternalLink size={13} /></a>
                    <button type="button" onClick={() => download(catalog)} title="Download PDF" className="rounded border p-1.5"><Download size={13} /></button>
                    <button type="button" onClick={() => share(catalog, "WhatsApp")} title="Share to WhatsApp" className="rounded border p-1.5 text-green-700"><MessageCircle size={13} /></button>
                    <button type="button" onClick={() => share(catalog, "Email")} title="Share by email" className="rounded border p-1.5"><Mail size={13} /></button>
                    <button type="button" onClick={() => share(catalog, "Copy Link")} title="Copy link" className="rounded border p-1.5"><Clipboard size={13} /></button>
                  </>}
                  {!["Generating", "Archived"].includes(catalog.status) && <button type="button" onClick={() => archive(catalog)} title="Archive" className="rounded border border-red-200 p-1.5 text-red-600"><Archive size={13} /></button>}
                  {catalog.status !== "Generating" && <button type="button" onClick={() => deleteCatalog(catalog)} title="Delete" className="rounded border border-red-200 p-1.5 text-red-700"><Trash2 size={13} /></button>}
                </div></td>
              </tr>)}
              {!catalogs.length && <tr><td colSpan="8" className="p-8 text-center text-gray-500">No catalogs found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm"><span>Page {pagination.page || 1} of {totalPages}</span><div className="flex gap-2"><button disabled={(pagination.page || 1) <= 1} onClick={() => setListPage((pagination.page || 1) - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><button disabled={(pagination.page || 1) >= totalPages} onClick={() => setListPage((pagination.page || 1) + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div></div>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return <label className="text-sm"><span className="font-medium">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 w-full rounded border bg-white px-3 py-2" /></label>;
}

function MultiFilter({ label, type, value, onChange, ids, labels, onRemove }) {
  return <label className="text-sm"><span className="font-medium">{label}</span><div className="mt-1"><RemoteLookup type={type} value={value} onChange={onChange} placeholder={`Search ${label.toLowerCase()}...`} /></div>{ids.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{ids.map((id) => <button key={id} type="button" onClick={() => onRemove(id)} className="rounded bg-white px-2 py-1 text-[10px] shadow-sm">{labels[id] || `#${id}`} x</button>)}</div>}</label>;
}
