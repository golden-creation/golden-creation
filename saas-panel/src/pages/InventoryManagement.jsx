import React, { useEffect, useState } from "react";
import {
  downloadAdminXlsx,
  getAdminLookup,
  getCatalogInventory,
  getProductStockDetail,
  importAdminProducts,
  updateProductStock,
} from "../lib/adminApi";
import {
  groupedImportBatches,
  importErrorReportCsv,
  importResultMessage,
  mergeImportResults,
  readSpreadsheetRows,
} from "../lib/spreadsheetImport";
import { formatQuantity, quantityFieldValue } from "../lib/formatQuantity";

const catalogs = [
  { key: "website", label: "Busy" },
  { key: "warehouse", label: "Warehouse" },
  { key: "store", label: "Shop" },
];

const stockStatuses = [
  { value: "", label: "All Stock" },
  { value: "in_stock", label: "In Stock" },
  { value: "out_of_stock", label: "Out of Stock" },
  { value: "low_stock", label: "Low Stock" },
  { value: "not_recorded", label: "Not Recorded" },
  { value: "unverified", label: "Unverified" },
  { value: "balanced", label: "Balanced" },
  { value: "mismatch", label: "Mismatch" },
  { value: "zero_stock", label: "Zero Busy Stock" },
];

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bucketForCatalog(catalog) {
  if (catalog === "warehouse") return "warehouse";
  if (catalog === "store") return "shop";
  return "website";
}

function stockFor(product, bucket) {
  const value = bucket === "warehouse"
    ? product.warehouseStock ?? product.warehouse_stock
    : bucket === "shop"
      ? product.shopStock ?? product.shop_stock
      : product.busyStock ?? product.busy_stock ?? product.websiteStock ?? product.website_stock ?? product.stock_quantity;
  if (value === null || value === undefined || value === "") return null;
  return number(value);
}

function reorderFor(product, bucket) {
  const value = bucket === "warehouse"
    ? product.warehouse_reorder_level
    : bucket === "shop"
      ? product.shop_reorder_level
      : product.website_reorder_level ?? product.reorder_level;
  if (value === null || value === undefined || value === "") return null;
  return number(value);
}

export default function InventoryManagement() {
  const [catalog, setCatalog] = useState("website");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [stockStatus, setStockStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ summary: {}, products: [], pagination: {} });
  const [lookups, setLookups] = useState({ categories: [], brands: [] });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [stockModal, setStockModal] = useState(null);
  const [importRunning, setImportRunning] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const [importPreview, setImportPreview] = useState(false);
  const [importReport, setImportReport] = useState(null);

  const loadLookups = async () => {
    try {
      const [categories, brands] = await Promise.all([
        getAdminLookup("categories", { limit: 200 }),
        getAdminLookup("brands", { limit: 200 }),
      ]);
      setLookups({
        categories: categories.results || [],
        brands: brands.results || [],
      });
    } catch {
      setLookups({ categories: [], brands: [] });
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const response = await getCatalogInventory({
        catalog,
        q: debouncedQuery,
        categoryId,
        brandId,
        stockStatus,
        page,
        limit: 50,
      });
      setData(response);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Unable to load inventory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    load();
  }, [catalog, debouncedQuery, categoryId, brandId, stockStatus, page]);

  useEffect(() => {
    setPage(1);
  }, [catalog, debouncedQuery, categoryId, brandId, stockStatus]);

  const selectedBucket = bucketForCatalog(catalog);
  const pageCount = Math.max(1, Math.ceil(number(data.pagination?.total) / number(data.pagination?.limit || 50)));
  const products = data.products || [];

  const openStockModal = async (product) => {
    try {
      const detail = await getProductStockDetail(product.id);
      const nextProduct = detail.product || product;
      setStockModal({
        product: nextProduct,
        auditLogs: detail.auditLogs || [],
        bucket: selectedBucket,
        mode: "set",
        stockOnHand: stockFor(nextProduct, selectedBucket) ?? "",
        quantity: "",
        reorderLevel: reorderFor(nextProduct, selectedBucket) ?? "",
        reason: "",
        saving: false,
      });
    } catch (error) {
      setMessage(error.message || "Unable to load stock detail");
    }
  };

  const updateModalBucket = (bucket) => {
    setStockModal((current) =>
      current
        ? {
            ...current,
            bucket,
            stockOnHand: stockFor(current.product, bucket) ?? "",
            reorderLevel: reorderFor(current.product, bucket) ?? "",
          }
        : current
    );
  };

  const saveStock = async () => {
    if (!stockModal) return;
    try {
      setStockModal((current) => ({ ...current, saving: true }));
      const response = await updateProductStock(stockModal.product.id, {
        bucket: stockModal.bucket,
        mode: stockModal.mode,
        stockOnHand: stockModal.stockOnHand,
        quantity: stockModal.quantity,
        reorderLevel: stockModal.reorderLevel,
        reason: stockModal.reason,
      });
      const detail = await getProductStockDetail(stockModal.product.id);
      setStockModal((current) => ({
        ...current,
        product: detail.product || response.product || current.product,
        auditLogs: detail.auditLogs || [],
        stockOnHand: stockFor(detail.product || response.product || current.product, current.bucket),
        reorderLevel: reorderFor(detail.product || response.product || current.product, current.bucket) || 0,
        saving: false,
      }));
      setMessage(response.message || "Stock updated");
      await load();
    } catch (error) {
      setStockModal((current) => (current ? { ...current, saving: false } : current));
      setMessage(error.message || "Unable to update stock");
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportRunning(true);
      setImportProgress("Reading spreadsheet...");
      const rows = await readSpreadsheetRows(file);

      if (!rows.length) {
        setMessage("No rows found in Excel file");
        return;
      }

      const totals = { created: 0, updated: 0, skipped: 0, errors: [] };
      const batches = groupedImportBatches(rows);
      let importedRows = 0;

      for (const [index, batch] of batches.entries()) {
        setImportProgress(`${importPreview ? "Checking" : "Importing"} batch ${index + 1} of ${batches.length}: ${importedRows} of ${rows.length} rows completed...`);
        const response = await importAdminProducts(batch, { dryRun: importPreview });
        mergeImportResults(totals, response.results || {});
        importedRows += batch.length;
      }

      setImportReport(totals);
      setMessage(importResultMessage(totals, { preview: importPreview }));
      if (!importPreview) await load();
    } catch (error) {
      setMessage(error.message || "Unable to import Excel file");
    } finally {
      setImportRunning(false);
      setImportProgress("");
      event.target.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-gray-500">
            Missing Warehouse or Shop rows are Not recorded. A zero row without audit evidence is Unverified. Balanced and Mismatch are used only when both physical counts are verified.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {catalog === "website" && (
            <>
              <label className="flex items-center gap-2 rounded bg-white px-4 py-2 text-sm shadow">
                <input type="checkbox" checked={importPreview} onChange={(event) => setImportPreview(event.target.checked)} />
                Preview only
              </label>
              <label className={`cursor-pointer rounded bg-[#A68B5B] px-4 py-2 text-sm text-white ${importRunning ? "pointer-events-none opacity-60" : ""}`}>
                {importRunning ? "Importing..." : importPreview ? "Preview Excel" : "Import Excel"}
                <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" disabled={importRunning} onChange={handleImportFile} />
              </label>
            </>
          )}
          <button
            onClick={() =>
              downloadAdminXlsx(`${catalog}-products`, {
                q: query,
                categoryId,
                brandId,
                stockStatus,
              })
            }
            className="rounded bg-black px-4 py-2 text-sm text-white"
          >
            Export XLSX
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {catalogs.map((item) => (
          <button
            key={item.key}
            onClick={() => setCatalog(item.key)}
            className={`rounded px-4 py-2 text-sm ${
              catalog === item.key ? "bg-[#A68B5B] text-white" : "bg-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Listed Products" value={data.summary?.listedProducts} />
        <Metric label="Selected Stock" value={data.summary?.totalStock} />
        <Metric label="Not Recorded" value={data.summary?.notRecorded} />
        <Metric label="Unverified" value={data.summary?.unverified} />
        <Metric label="Balanced" value={data.summary?.balanced} />
        <Metric label="Mismatch" value={data.summary?.mismatched} warning />
        <Metric label="Low Stock" value={data.summary?.lowStock} warning />
        <Metric label="Zero Busy Stock" value={data.summary?.zeroStock} danger />
      </div>

      <section className="mt-5 rounded bg-white p-4 shadow">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search SKU, product, category, or brand..."
          className="rounded border px-3 py-2 text-sm"
        />
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="">All categories</option>
          {lookups.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="">All brands</option>
          {lookups.brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.label}
            </option>
          ))}
        </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {stockStatuses.map((status) => (
            <button
              key={status.value || "all"}
              type="button"
              onClick={() => setStockStatus(status.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                stockStatus === status.value
                  ? "border-[#A68B5B] bg-[#A68B5B] text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-[#A68B5B]"
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>
      </section>

      {importProgress && <p className="mt-4 rounded border border-[#D6BE8C] bg-[#FFF9E6] p-3 text-sm text-[#6E4D13]">{importProgress}</p>}
      {message && <p className="mt-4 rounded border border-[#D6BE8C] bg-[#FFF9E6] p-3 text-sm text-[#6E4D13]">{message}</p>}
      {importReport?.errors?.length > 0 && (
        <div className="mt-3 rounded border border-red-200 bg-white p-3 text-sm">
          <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5 text-red-700">
            {importReport.errors.map((error, index) => (
              <li key={`${error.row}-${index}`}>Row {error.row || "?"}: {error.message}</li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 rounded bg-white px-3 py-1 text-xs shadow"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([importErrorReportCsv(importReport.errors)], { type: "text/csv;charset=utf-8" }));
              const link = document.createElement("a");
              link.href = url;
              link.download = "product-import-errors.csv";
              document.body.appendChild(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(url);
            }}
          >
            Download error report
          </button>
        </div>
      )}

      <section className="mt-4 overflow-x-auto rounded bg-white shadow">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="p-3">Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Brand</th>
              <th>Busy</th>
              <th>Warehouse</th>
              <th>Shop</th>
              <th>Website</th>
              <th>Reconciliation</th>
              <th>Low</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const busyStock = stockFor(product, "website");
              const warehouseStock = stockFor(product, "warehouse");
              const shopStock = stockFor(product, "shop");
              const websiteStock = number(product.websiteStock ?? product.website_stock ?? busyStock);
              const isZeroStock = Boolean(product.isZeroStock ?? number(product.is_zero_stock));
              const isLowStock = Boolean(product.isLowStock ?? number(product.is_low_stock));
              const status = product.reconciliationStatus || "unverified";
              const statusLabel = {
                not_recorded: "Not recorded",
                unverified: "Unverified",
                balanced: "Balanced",
                mismatch: "Mismatch",
              }[status] || "Unverified";
              const statusClass = {
                not_recorded: "bg-gray-100 text-gray-700",
                unverified: "bg-amber-50 text-amber-800",
                balanced: "bg-green-50 text-green-700",
                mismatch: "bg-red-50 text-red-700",
              }[status] || "bg-amber-50 text-amber-800";
              const rowTone = {
                not_recorded: "border-gray-200 bg-white hover:bg-gray-50",
                unverified: "border-amber-200 bg-amber-50 hover:bg-amber-100/80",
                balanced: "border-green-300 bg-green-100 hover:bg-green-200/80",
                mismatch: "border-red-300 bg-red-100 hover:bg-red-200/80",
              }[status] || "border-gray-200 bg-white";
              return (
                <tr key={product.id} className={`border-b align-middle transition-colors ${rowTone}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {isZeroStock && <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" title="Zero Busy stock" />}
                      <span className="font-medium">{product.name}</span>
                    </div>
                    <p className="text-xs text-gray-400">ID: {product.id}</p>
                  </td>
                  <td>{product.sku || "-"}</td>
                  <td>{product.category_name || "-"}</td>
                  <td>{product.brand_name || "-"}</td>
                  <StockCell value={busyStock} active={selectedBucket === "website"} />
                  <StockCell value={warehouseStock} active={selectedBucket === "warehouse"} />
                  <StockCell value={shopStock} active={selectedBucket === "shop"} />
                  <td className="font-semibold">{formatQuantity(websiteStock) || "0"}</td>
                  <td>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </td>
                  <td>
                    {isLowStock ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
                        <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                        Low
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">OK</span>
                    )}
                  </td>
                  <td>
                    <button type="button" onClick={() => openStockModal(product)} className="rounded border px-3 py-1.5 text-xs">
                      Edit Stock
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && !products.length && <p className="p-8 text-center text-sm text-gray-500">No products found.</p>}
        {loading && <p className="p-8 text-center text-sm text-gray-500">Loading inventory...</p>}
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          Showing page {data.pagination?.page || page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded border bg-white px-3 py-1.5 disabled:opacity-40">
            Previous
          </button>
          <button disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className="rounded border bg-white px-3 py-1.5 disabled:opacity-40">
            Next
          </button>
        </div>
      </div>

      {stockModal && <StockModal state={stockModal} setState={setStockModal} onBucketChange={updateModalBucket} onSave={saveStock} />}
    </main>
  );
}

function Metric({ label, value = 0, warning = false, danger = false }) {
  const color = danger ? "text-red-700" : warning ? "text-yellow-700" : "";
  return (
    <div className="rounded bg-white p-4 shadow">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>{value || 0}</p>
    </div>
  );
}

function StockCell({ value, active }) {
  const missing = value === null || value === undefined || value === "";
  return <td className={active ? "font-bold text-[#8A541E]" : ""}>{missing ? "Not recorded" : formatQuantity(value) || "0"}</td>;
}

function StockModal({ state, setState, onBucketChange, onSave }) {
  const bucketLabel = state.bucket === "shop" ? "Shop" : state.bucket === "website" ? "Busy" : state.bucket.charAt(0).toUpperCase() + state.bucket.slice(1);
  const currentStock = stockFor(state.product, state.bucket);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{state.product.name}</h2>
            <p className="text-sm text-gray-500">{state.product.sku || "No SKU"}</p>
          </div>
          <button type="button" onClick={() => setState(null)} className="rounded border px-3 py-1 text-sm">
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {["website", "warehouse", "shop"].map((bucket) => (
            <button
              type="button"
              key={bucket}
              onClick={() => onBucketChange(bucket)}
              className={`rounded-xl border p-4 text-left ${state.bucket === bucket ? "border-[#A68B5B] bg-[#FFF8E7]" : ""}`}
            >
              <p className="text-xs uppercase text-gray-500">{bucket === "shop" ? "Shop" : bucket === "website" ? "Busy" : bucket}</p>
              <p className="mt-1 text-2xl font-semibold">{stockFor(state.product, bucket) == null ? "Not recorded" : formatQuantity(stockFor(state.product, bucket)) || "0"}</p>
              <p className="text-xs text-gray-400">Low level: {formatQuantity(reorderFor(state.product, bucket)) || "0"}</p>
            </button>
          ))}
        </div>

        <section className="mt-5 rounded-xl border p-4">
          <h3 className="font-semibold">Adjust {bucketLabel} Stock</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="text-sm">
              Mode
              <select value={state.mode} onChange={(event) => setState((current) => ({ ...current, mode: event.target.value }))} className="mt-1 w-full rounded border px-3 py-2">
                <option value="set">Set direct count</option>
                <option value="increase">Increase</option>
                <option value="decrease">Decrease</option>
              </select>
            </label>
            {state.mode === "set" ? (
              <label className="text-sm">
                New count
                <input type="number" min="0" value={quantityFieldValue(state.stockOnHand)} onChange={(event) => setState((current) => ({ ...current, stockOnHand: event.target.value }))} className="mt-1 w-full rounded border px-3 py-2" />
              </label>
            ) : (
              <label className="text-sm">
                Quantity
                <input type="number" min="1" value={quantityFieldValue(state.quantity)} onChange={(event) => setState((current) => ({ ...current, quantity: event.target.value }))} className="mt-1 w-full rounded border px-3 py-2" />
              </label>
            )}
            <label className="text-sm">
              Low-stock level
              <input type="number" min="0" value={quantityFieldValue(state.reorderLevel)} onChange={(event) => setState((current) => ({ ...current, reorderLevel: event.target.value }))} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="text-sm">
              Current count
              <input readOnly value={currentStock == null ? "Not recorded" : formatQuantity(currentStock) || "0"} className="mt-1 w-full rounded border bg-gray-50 px-3 py-2" />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            Reason
            <input value={state.reason} onChange={(event) => setState((current) => ({ ...current, reason: event.target.value }))} placeholder="Physical count, adjustment, dispatch correction..." className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <button type="button" disabled={state.saving} onClick={onSave} className="mt-4 rounded bg-[#A68B5B] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {state.saving ? "Saving..." : "Save Stock"}
          </button>
        </section>

        <section className="mt-5 rounded-xl border">
          <div className="border-b px-4 py-3 font-semibold">Recent Stock Audit</div>
          <div className="max-h-64 overflow-y-auto">
            {(state.auditLogs || []).map((log) => (
              <div key={log.id} className="grid gap-2 border-b px-4 py-3 text-sm md:grid-cols-[110px_1fr_150px_130px]">
                <span className="capitalize">{log.bucket}</span>
                <span>
                  {log.previous_stock} to {log.new_stock} ({log.adjustment_type})
                  {log.reason ? ` - ${log.reason}` : ""}
                </span>
                <span className="text-xs text-gray-600">By {log.actor || "System"}</span>
                <span className="text-xs text-gray-500">{new Date(log.created_at).toLocaleString("en-IN")}</span>
              </div>
            ))}
            {!state.auditLogs?.length && <p className="p-4 text-sm text-gray-500">No audit entries yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
