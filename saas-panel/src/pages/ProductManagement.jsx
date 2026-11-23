import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import boxIcon from "../assets/box.png";
import clockIcon from "../assets/clock.png";
import searchIcon from "../assets/search.png";
import viewIcon from "../assets/view.png";
import editIcon from "../assets/edit.png";
import binIcon from "../assets/bin.png";
import leftIcon from "../assets/left.png";
import rightIcon from "../assets/right-arrow (3).png";
import layersIcon from "../assets/layers.png";
import arrowIcon from "../assets/right-arrow (2).png";
import addIcon from "../assets/add.png";
import o1 from "../assets/o1.jpeg";
import o2 from "../assets/o2.jpeg";
import o3 from "../assets/o3.jpeg";
import o4 from "../assets/o4.jpeg";
import o5 from "../assets/o5.jpeg";
import { apiRequest, getAssetUrl } from "../lib/api";
import {
  downloadAdminXlsx,
  getCatalogInventory,
  getAdminLookup,
  getMediaMigration,
  importAdminProducts,
  runBulkAction,
  runMediaMigration,
} from "../lib/adminApi";
import {
  PRODUCT_IMPORT_HEADERS,
  groupedImportBatches,
  importErrorReportCsv,
  importResultMessage,
  mergeImportResults,
  readSpreadsheetRows,
} from "../lib/spreadsheetImport";
import { formatQuantity } from "../lib/formatQuantity";

const fallbackImages = [o1, o2, o3, o4, o5];
const pageSize = 50;

function visiblePageNumbers(activePage, totalPages) {
  const width = Math.min(7, totalPages);
  const start = Math.max(1, Math.min(activePage - Math.floor(width / 2), totalPages - width + 1));
  return Array.from({ length: width }, (_, index) => start + index);
}

function getProductStatus(product) {
  const raw = product.stock;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const formatted = formatQuantity(raw);
    if (formatted !== "") return formatted;
    return raw;
  }

  const quantity =
    Number(
      product.stock_quantity ??
        product.variant_stock ??
        product.quantity ??
        1
    );

  return quantity > 0
    ? "In Stock"
    : "Out of Stock";
}

function productImage(product, index = 0) {
  const image =
    Array.isArray(product.images) &&
    product.images.length
      ? product.images[0]
      : product.image;

  if (
    typeof image === "string" &&
    image.includes(".")
  ) {
    return getAssetUrl(image);
  }

  return fallbackImages[
    index % fallbackImages.length
  ];
}

const ProductManagement = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const importInputRef = useRef(null);
  const [activePage, setActivePage] = useState(1);
  const [activeFilter, setActiveFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: pageSize, total: 0 });
  const [summary, setSummary] = useState({});
  const [importProgress, setImportProgress] = useState("");
  const [importRunning, setImportRunning] = useState(false);
  const [importPreview, setImportPreview] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [mediaMigration, setMediaMigration] = useState(null);
  const [mediaMigrationRunning, setMediaMigrationRunning] = useState(false);

  useEffect(() => {
    const query = searchParams.get("search");
    if (query) {
      setSearch(query);
    }
  }, [searchParams]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const [productData, categoryData, brandData] =
        await Promise.all([
          getCatalogInventory({
            catalog: "website",
            q: search,
            stockStatus: activeFilter === "In Stock" ? "in_stock" : activeFilter === "Out of Stock" ? "out_of_stock" : "",
            uncategorized: activeFilter === "No Category Set" ? "true" : "",
            categoryId: categoryFilter,
            brandId: brandFilter,
            page: activePage,
            limit: pageSize,
          }),
          apiRequest("/categories"),
          getAdminLookup("brands", { limit: 200 }),
        ]);

      setProducts(productData.products || []);
      setPagination(productData.pagination || { page: activePage, limit: pageSize, total: 0 });
      setSummary(productData.summary || {});
      setCategories(
        Array.isArray(categoryData)
          ? categoryData
          : []
      );
      setBrands(brandData.results || []);
    } catch (error) {
      showToast(
        error.message ||
          "Unable to load product data"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadProducts, 220);
    return () => clearTimeout(timer);
  }, [activeFilter, activePage, search, categoryFilter, brandFilter]);

  useEffect(() => {
    getMediaMigration()
      .then((payload) => setMediaMigration(payload.stats || null))
      .catch(() => {});
  }, []);

  const migrateMediaBatch = async () => {
    setMediaMigrationRunning(true);
    try {
      const payload = await runMediaMigration(100);
      setMediaMigration(payload.stats || null);
      showToast(`Media batch: ${payload.results?.copied || 0} copied, ${payload.results?.failed || 0} failed`);
      await loadProducts();
    } catch (error) {
      showToast(error.message || "Unable to migrate product media");
    } finally {
      setMediaMigrationRunning(false);
    }
  };

  const filteredProducts = products;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        pagination.total /
          pageSize
      )
    );

  const pagedProducts = filteredProducts;
  const pageNumbers = visiblePageNumbers(activePage, totalPages);
  const allVisibleSelected =
    pagedProducts.length > 0 && pagedProducts.every((product) => selectedIds.includes(product.id));

  useEffect(() => {
    if (activePage > totalPages) {
      setActivePage(totalPages);
    }
  }, [activePage, totalPages]);

  const viewProduct = async (product) => {
    try {
      const fullProduct =
        await apiRequest(
          `/products/${product.id}`
        );

      setSelectedProduct({
        ...product,
        ...fullProduct,
      });
    } catch (error) {
      showToast(
        error.message ||
          "Unable to open product"
      );
    }
  };

  const editProduct = async (product) => {
    try {
      const fullProduct =
        await apiRequest(
          `/products/${product.id}`
        );

      navigate("/edit-product", {
        state: {
          product: {
            ...product,
            ...fullProduct,
          },
        },
      });
    } catch {
      navigate("/edit-product", {
        state: { product },
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      const response = await apiRequest(
        `/products/${deleteTarget.id}`,
        { method: "DELETE" }
      );
      if (response?.removalRequest) {
        setDeleteTarget(null);
        showToast(response.message || "Delete request sent to admin. Please wait for approval.");
        return;
      }
      setProducts((current) =>
        current.filter(
          (product) =>
            Number(product.id) !==
            Number(deleteTarget.id)
        )
      );
      setDeleteTarget(null);
      showToast(
        "Product deleted successfully"
      );
    } catch (error) {
      showToast(
        error.message ||
          "Unable to delete product"
      );
    }
  };

  const copyProductUrl = async (product) => {
    const url = `${window.location.origin}/product/${product.id}`;

    try {
      await navigator.clipboard.writeText(
        url
      );
      showToast("Product URL copied");
    } catch {
      showToast(url);
    }
  };

  const exportCatalog = () => downloadAdminXlsx(
    "website-products",
    selectedIds.length
      ? { ids: selectedIds.join(",") }
      : {
          q: search,
          stockStatus: activeFilter === "In Stock" ? "in_stock" : activeFilter === "Out of Stock" ? "out_of_stock" : "",
          uncategorized: activeFilter === "No Category Set" ? "true" : "",
          categoryId: categoryFilter,
          brandId: brandFilter,
        }
  );
  const bulk = async (action) => {
    if (!selectedIds.length) return showToast("Select products first");
    const response = await runBulkAction("website-products", action, selectedIds);
    if (response?.removalRequest) {
      showToast(response.message || "Delete request sent to admin. Please wait for approval.");
      return;
    }
    setSelectedIds([]);
    showToast(`${response.result?.[action === "archive" ? "archived" : "deleted"]?.length || 0} product(s) updated`);
    await loadProducts();
  };

  const downloadSampleExcel = async () => {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Products");
      const rows = [
        [
          "sample-gel-pen",
          "Sample Gel Pen",
          "Smooth writing pen with blue ink.",
          "Golden Creation",
          "Parker",
          "Office Stationery > Pens",
          "Office Stationery",
          "Pens",
          "",
          "Premium Pens",
          "premium,gift-item",
          "TRUE",
          "Color",
          "Blue",
          "Size",
          "Single",
          "",
          "",
          "LM-SAMPLE-001-BLUE",
          50,
          30,
          20,
          45,
          60,
          "",
          "https://example.com/sample-gel-pen-blue.jpg",
          1,
          "Sample Gel Pen Blue",
          2,
          14,
          1,
          "https://example.com/sample-gel-pen-blue.jpg",
          "g",
          30,
          10,
          "active",
          "",
        ],
        [
          "sample-gel-pen",
          "Sample Gel Pen",
          "Smooth writing pen with red ink.",
          "Golden Creation",
          "Parker",
          "Office Stationery > Pens",
          "Office Stationery",
          "Pens",
          "",
          "Premium Pens",
          "premium,gift-item",
          "TRUE",
          "Color",
          "Red",
          "Size",
          "Single",
          "",
          "",
          "LM-SAMPLE-001-RED",
          40,
          30,
          20,
          45,
          60,
          "",
          "https://example.com/sample-gel-pen-red.jpg",
          2,
          "Sample Gel Pen Red",
          2,
          14,
          1,
          "https://example.com/sample-gel-pen-red.jpg",
          "g",
          30,
          10,
          "active",
          "",
        ],
      ];
      sheet.addRow(PRODUCT_IMPORT_HEADERS);
      rows.forEach((row) => sheet.addRow(row));
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "golden-creation-product-import-sample.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Sample Excel downloaded");
    } catch (error) {
      showToast(error.message || "Unable to download sample Excel");
    }
  };

  const downloadImportErrors = () => {
    if (!importReport?.errors?.length) return;
    const url = URL.createObjectURL(new Blob([importErrorReportCsv(importReport.errors)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "product-import-errors.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportRunning(true);
      setImportProgress("Reading spreadsheet...");
      const rows = await readSpreadsheetRows(file);

      if (!rows.length) {
        showToast("No rows found in Excel file");
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

      const message = importResultMessage(totals, { preview: importPreview });
      setImportReport(totals);
      showToast(message);
      if (!importPreview) await loadProducts();
    } catch (error) {
      showToast(error.message || "Unable to import Excel file");
    } finally {
      setImportRunning(false);
      setImportProgress("");
      event.target.value = "";
    }
  };

  const visibleCount =
    pagedProducts.length;
  const firstVisible =
    pagination.total
      ? (activePage - 1) *
          pageSize +
        1
      : 0;
  const lastVisible =
    visibleCount ? firstVisible + visibleCount - 1 : 0;
  return (
    <div className="p-4 md:p-6 bg-[#F8F6F2] min-h-screen">
      {toast && (
        <div className="fixed top-5 right-5 bg-black text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}
      {importProgress && (
        <div className="mb-4 rounded-lg border border-[#D6BE8C] bg-[#FFF9E6] px-4 py-3 text-sm text-[#6E4D13]">
          {importProgress}
        </div>
      )}
      {importReport && (
        <div className="mb-4 rounded-lg border border-[#D6BE8C] bg-white px-4 py-3 text-sm">
          <p className="font-medium">{importResultMessage(importReport, { preview: importPreview })}</p>
          {importReport.errors?.length > 0 && (
            <>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-red-700">
                {importReport.errors.map((error, index) => (
                  <li key={`${error.row}-${index}`}>Row {error.row || "?"}: {error.message}</li>
                ))}
              </ul>
              <button type="button" onClick={downloadImportErrors} className="mt-3 rounded bg-white px-3 py-1 text-xs shadow">
                Download error report
              </button>
            </>
          )}
        </div>
      )}

      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">
            Product Management
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm">
            Manage categories, catalog items, inventory visibility, and product actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() =>
              navigate("/categories")
            }
            className="bg-[#A68B5BFF] hover:opacity-90 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow transition"
          >
            <span className="text-sm font-medium">Manage Categories</span>
          </button>
          <button
            onClick={() =>
              navigate("/add-product")
            }
            className="bg-[#A68B5BFF] hover:opacity-90 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow transition"
          >
            <img src={addIcon} className="h-4 w-4" />
            <span className="text-sm font-medium">Add New Product</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Total Categories", categories.length, boxIcon],
          ["Active Categories", categories.length, boxIcon],
          ["Listed Products", pagination.total, clockIcon],
          ["Busy Units", summary.totalStock || 0, boxIcon],
        ].map(([label, value, icon]) => (
          <div key={label} className="bg-gradient-to-b from-white to-[#FFF49CFF] p-4 rounded-xl shadow flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500">{label}</p>
              <h2 className="text-xl font-semibold">{value}</h2>
            </div>
            <img src={icon} className="h-5 opacity-70" />
          </div>
        ))}
      </div>

      {Number(summary.uncategorized || 0) > 0 && (
        <button
          type="button"
          onClick={() => {
            setActiveFilter("No Category Set");
            setCategoryFilter("");
            setActivePage(1);
          }}
          className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700 shadow-sm"
        >
          <span className="font-semibold">{summary.uncategorized} product(s) have no category set.</span>{" "}
          Click to review and assign categories.
        </button>
      )}

      <div className="mt-8 space-y-3">
        <div className="inline-flex max-w-full flex-wrap rounded-full bg-gray-200 p-1 text-sm">
          {["All", "In Stock", "Out of Stock", "No Category Set"].map((filter) => (
            <button
              key={filter}
              onClick={() => {
                setActiveFilter(filter);
                if (filter === "No Category Set") {
                  setCategoryFilter("");
                }
                setActivePage(1);
              }}
              className={`px-4 py-1 rounded-full transition whitespace-nowrap ${
                activeFilter === filter
                  ? "bg-[#A68B5BFF] text-white"
                  : "text-gray-600 hover:bg-gray-300"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="flex w-full flex-wrap gap-2">
          <div className="flex min-w-[220px] flex-1 items-center rounded-full bg-white px-3 py-2 shadow sm:max-w-sm">
            <img src={searchIcon} className="h-4 mr-2 opacity-60" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setActivePage(1);
              }}
              placeholder="Search name, SKU, barcode, or serial"
              className="outline-none text-sm w-full"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              setActivePage(1);
            }}
            className="min-w-[180px] rounded-full bg-white px-3 py-2 text-sm shadow"
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.pathText || category.name}
              </option>
            ))}
          </select>
          <select
            value={brandFilter}
            onChange={(event) => {
              setBrandFilter(event.target.value);
              setActivePage(1);
            }}
            className="min-w-[180px] rounded-full bg-white px-3 py-2 text-sm shadow"
          >
            <option value="">All Brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.label || brand.name}
              </option>
            ))}
          </select>
          {(categoryFilter || brandFilter || search || activeFilter !== "All") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCategoryFilter("");
                setBrandFilter("");
                setActiveFilter("All");
                setActivePage(1);
              }}
              className="px-4 py-2 rounded-full bg-white shadow text-sm"
            >
              Clear Filters
            </button>
          )}
          <button
            onClick={loadProducts}
            className="px-4 py-2 rounded-full bg-white shadow text-sm"
          >
            Refresh
          </button>
          <button
            onClick={exportCatalog}
            className="px-4 py-2 rounded-full bg-white shadow text-sm"
          >
            Export XLSX
          </button>
          <button onClick={() => bulk("archive")} className="px-4 py-2 rounded-full bg-white shadow text-sm">Archive Selected</button>
          <button onClick={() => bulk("delete")} className="px-4 py-2 rounded-full bg-red-700 text-white shadow text-sm">Delete Selected</button>
          <button
            onClick={downloadSampleExcel}
            className="px-4 py-2 rounded-full bg-white shadow text-sm"
          >
            Sample Excel
          </button>
          <label className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm shadow">
            <input
              type="checkbox"
              checked={importPreview}
              onChange={(event) => setImportPreview(event.target.checked)}
            />
            Preview only
          </label>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importRunning}
            className="px-4 py-2 rounded-full bg-[#A68B5BFF] text-white shadow text-sm"
          >
            {importRunning ? "Importing..." : importPreview ? "Preview Excel" : "Import Excel"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            hidden
            onChange={handleImportFile}
          />
        </div>
      </div>

      {mediaMigration && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#D6BE8C] bg-[#FFF9E6] p-4 text-sm md:flex-row md:items-center md:justify-between">
          <div><p className="font-semibold">Shopify media migration</p><p className="text-xs text-gray-600">Pending {mediaMigration.pending || 0} · Copying {mediaMigration.copying || 0} · Copied {mediaMigration.copied || 0} · Failed {mediaMigration.failed || 0}</p></div>
          <button onClick={migrateMediaBatch} disabled={mediaMigrationRunning || (!mediaMigration.pending && !mediaMigration.failed)} className="rounded bg-black px-4 py-2 text-xs text-white disabled:opacity-40">{mediaMigrationRunning ? "Migrating..." : "Run next 100"}</button>
        </div>
      )}

      <div className="max-h-[720px] overflow-auto rounded-xl bg-white shadow mt-6">
        <table className="w-full min-w-[1240px] text-sm">
          <thead className="text-gray-500 border-b">
            <tr>
              <th className="p-4">
                <input
                  type="checkbox"
                  aria-label="Select all products on this page"
                  checked={allVisibleSelected}
                  onChange={(event) => {
                    const visibleIds = pagedProducts.map((product) => product.id);
                    setSelectedIds((current) =>
                      event.target.checked
                        ? [...new Set([...current, ...visibleIds])]
                        : current.filter((id) => !visibleIds.includes(id))
                    );
                  }}
                />
              </th>
              <th className="whitespace-nowrap p-4 text-left">Product Name & ID</th>
              <th className="whitespace-nowrap px-3">Category</th>
              <th className="whitespace-nowrap px-3">Brand</th>
              <th className="whitespace-nowrap px-3">Price</th>
              <th className="whitespace-nowrap px-3">URL</th>
              <th className="whitespace-nowrap px-3">Stock</th>
              <th className="whitespace-nowrap px-3">Manage</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="p-8 text-center text-gray-500">
                  Loading products...
                </td>
              </tr>
            ) : pagedProducts.length ? (
              pagedProducts.map((item, index) => {
                const stock =
                  getProductStatus(item);
                const img =
                  productImage(
                    item,
                    index
                  );
                const hasCategory =
                  Boolean(item.category_id || item.category_name || item.category);

                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="p-4"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, item.id] : selectedIds.filter((id) => id !== item.id))} /></td>
                    <td className="min-w-[360px] p-4">
                      <div className="flex items-center gap-3">
                        <img src={img} className="h-10 w-10 rounded-full object-cover" />
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-gray-400">Serial PRD-{item.id}{item.sku ? ` · SKU ${item.sku}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="min-w-[140px] whitespace-nowrap px-3 text-center">
                      {hasCategory ? (
                        <span className="inline-block rounded bg-gray-100 px-2 py-1 text-xs">
                          {item.category_name || item.category}
                        </span>
                      ) : (
                        <span className="inline-flex animate-pulse rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                          No Category Set
                        </span>
                      )}
                    </td>
                    <td className="min-w-[120px] whitespace-nowrap px-3 text-center text-gray-600">
                      {item.brand_name || item.brand || "-"}
                    </td>
                    <td className="text-center">₹{Number(item.price || 0).toLocaleString("en-IN")}</td>
                    <td className="min-w-[190px] whitespace-nowrap px-3 text-center">
                      <button
                        onClick={() => copyProductUrl(item)}
                        className="text-[#C2863FFF] text-xs underline"
                      >
                        goldencreation.in/product/{item.id}
                      </button>
                    </td>
                    <td className="min-w-[110px] whitespace-nowrap px-3 text-center">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs ${
                        stock === "In Stock" || Number(stock) > 0
                          ? "bg-green-100 text-green-600"
                          : "bg-red-100 text-red-500"
                      }`}>
                        {stock}
                      </span>
                    </td>
                    <td className="min-w-[120px] px-3 py-4">
                      <div className="flex justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => viewProduct(item)}
                          className="p-0"
                          title="View product"
                        >
                          <img src={viewIcon} className="h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => editProduct(item)}
                          className="flex items-center gap-1 cursor-pointer text-[#C2863F] hover:underline"
                        >
                          <img src={editIcon} className="h-4" />
                          <span className="text-xs">Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="p-0"
                          title="Delete product"
                        >
                          <img src={binIcon} className="h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" className="p-8 text-center text-gray-500">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center mt-6 gap-4">
        <p className="text-sm text-gray-500">
          Showing {firstVisible}-{lastVisible} of {pagination.total} products
        </p>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <button
            onClick={() => setActivePage((page) => Math.max(1, page - 1))}
            className="p-2 bg-white rounded shadow disabled:opacity-40"
            disabled={activePage === 1}
          >
            <img src={leftIcon} className="h-3" />
          </button>
          {pageNumbers[0] > 1 && <span className="px-1 text-gray-400">...</span>}
          {pageNumbers.map((page) => (
            <button
              key={page}
              onClick={() => setActivePage(page)}
              className={`w-8 h-8 rounded transition ${
                activePage === page
                  ? "bg-[#A68B5BFF] text-white"
                  : "bg-white hover:bg-gray-100"
              }`}
            >
              {page}
            </button>
          ))}
          {pageNumbers.at(-1) < totalPages && <span className="px-1 text-gray-400">...</span>}
          <button
            onClick={() => setActivePage((page) => Math.min(totalPages, page + 1))}
            className="p-2 bg-white rounded shadow disabled:opacity-40"
            disabled={activePage === totalPages}
          >
            <img src={rightIcon} className="h-3" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="bg-[linear-gradient(180deg,#FFFFFFFF_0%,#FFF49CFF_100%)] p-4 rounded-xl shadow">
          <div className="flex gap-4 items-start">
            <img src={boxIcon} className="h-6" />
            <div>
              <h3 className="font-semibold">Busy Catalog</h3>
              <p className="text-xs text-gray-500">Busy stock is the master quantity. Website stock follows Busy, while Warehouse and Shop keep physical counts.</p>
              <button onClick={() => showToast("Stock alerts use product availability from the backend")} className="text-[#C2863FFF] text-sm mt-2 cursor-pointer flex items-center gap-1">
                Configure Alerts <img src={arrowIcon} className="h-3" />
              </button>
            </div>
          </div>
        </div>
        <div className="bg-[linear-gradient(180deg,#FFFFFFFF_0%,#FFF49CFF_100%)] p-4 rounded-xl shadow">
          <div className="flex gap-4">
            <img src={layersIcon} className="h-6" />
            <div>
              <h3 className="font-semibold">Bulk Operations</h3>
              <p className="text-xs text-gray-500">Search, archive, delete, import, and XLSX export operate on the main product catalog.</p>
              <button onClick={exportCatalog} className="text-[#C2863FFF] text-sm mt-2 cursor-pointer flex items-center gap-1">
                View Channel Report <img src={arrowIcon} className="h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          image={productImage(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
          onEdit={() => editProduct(selectedProduct)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          product={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
};

function ProductModal({ product, image, onClose, onEdit }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full overflow-hidden">
        <div className="p-5 border-b flex justify-between items-start gap-4">
          <div>
            <p className="text-xs text-gray-400">PRODUCT DETAILS</p>
            <h2 className="text-xl font-semibold">{product.name}</h2>
          </div>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded bg-gray-100">
            Close
          </button>
        </div>
        <div className="p-5 grid md:grid-cols-[180px_1fr] gap-5">
          <img src={image} className="w-full h-44 rounded-lg object-cover" />
          <div className="space-y-3 text-sm">
            <Detail label="Product ID" value={`PRD-${product.id}`} />
            <Detail label="Category" value={product.category_name || product.category || "Uncategorized"} />
            <Detail label="Brand" value={product.brand_name || product.brand || "-"} />
            <Detail label="Price" value={`₹${Number(product.price || 0).toLocaleString("en-IN")}`} />
            <Detail label="Status" value={getProductStatus(product)} />
            <Detail label="Image File" value={product.image || "No image"} />
            <div>
              <p className="text-xs text-gray-400">Description</p>
              <p className="text-gray-700">{product.description || "No description available."}</p>
            </div>
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 text-sm">
            Done
          </button>
          <button onClick={onEdit} className="px-4 py-2 rounded-lg bg-[#A68B5BFF] text-white text-sm">
            Edit Product
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ product, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
        <h2 className="text-lg font-semibold">Delete product?</h2>
        <p className="text-sm text-gray-500 mt-2">
          This will remove {product.name} from the catalog. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-gray-100 text-sm">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-800">{value}</p>
    </div>
  );
}

export default ProductManagement;
