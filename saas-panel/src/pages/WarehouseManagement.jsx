import React, { useEffect, useMemo, useState } from "react";
import {
  approveWarehouseMovement,
  createWarehouseMovement,
  createWarehouseProduct,
  createWarehouseStock,
  getAdminWarehouse,
  syncWarehouseProducts,
  syncWarehouseSheet,
  updateWarehouseSheet,
} from "../lib/adminApi";
import { apiRequest } from "../lib/api";

const stockDraftInitial = {
  productRef: "",
  stockOnHand: 0,
  reservedStock: 0,
  reorderLevel: 10,
};

const movementDraftInitial = {
  productRef: "",
  movementType: "Inward",
  quantity: 1,
  reference: "",
};

const warehouseProductDraftInitial = {
  sku: "",
  name: "",
  category: "",
  unit: "pcs",
  purchasePrice: 0,
  mrp: 0,
  description: "",
};

function WarehouseManagement() {
  const [data, setData] = useState({
    summary: {},
    sheetConnection: {},
    facilities: [],
    stock: [],
    movements: [],
    warehouseProducts: [],
  });
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("stock");
  const [stockDraft, setStockDraft] = useState(stockDraftInitial);
  const [movementDraft, setMovementDraft] = useState(movementDraftInitial);
  const [warehouseProductDraft, setWarehouseProductDraft] = useState(warehouseProductDraftInitial);
  const [sheetUrl, setSheetUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const warehouse = data.facilities?.[0] || null;
  const warehouseId = warehouse?.id;

  const loadWarehouse = async () => {
    try {
      setLoading(true);
      setMessage("");
      const response = await getAdminWarehouse();
      setData(response);
      setSheetUrl(response.sheetConnection?.sheetUrl || "");
    } catch (error) {
      setMessage(error.message || "Unable to load warehouse data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWarehouse();
    apiRequest("/products")
      .then((payload) => setProducts(Array.isArray(payload) ? payload : []))
      .catch(() => setProducts([]));
  }, []);

  const filteredStock = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value) return data.stock || [];

    return (data.stock || []).filter((item) =>
      [
        item.product_name,
        item.sku,
        item.warehouse_name,
        item.warehouse_code,
        item.google_sheet_row_id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [data.stock, query]);

  const inwardEntries = useMemo(
    () => (data.movements || []).filter((entry) => entry.movement_type === "Inward"),
    [data.movements]
  );
  const productOptions = useMemo(() => {
    const websiteProducts = products.map((product) => ({
      ref: `website:${product.id}`,
      id: product.id,
      name: product.name,
      sku: product.sku || "",
      source: "Website",
    }));
    const warehouseOnlyProducts = (data.warehouseProducts || []).map((product) => ({
      ref: `warehouse:${product.id}`,
      id: product.id,
      name: product.name,
      sku: product.sku || "",
      source: "Warehouse",
    }));

    return [...websiteProducts, ...warehouseOnlyProducts];
  }, [products, data.warehouseProducts]);
  const outwardEntries = useMemo(
    () => (data.movements || []).filter((entry) => entry.movement_type === "Outward"),
    [data.movements]
  );

  const approveMovement = async (id, status) => {
    try {
      await approveWarehouseMovement(id, status);
      setMessage(`Movement ${status.toLowerCase()}.`);
      await loadWarehouse();
    } catch (error) {
      setMessage(error.message || "Unable to update movement");
    }
  };

  const saveStock = async () => {
    if (!warehouseId || !stockDraft.productRef) {
      setMessage("Select a product for the Gurugram warehouse stock record.");
      return;
    }

    const product = productOptions.find((item) => item.ref === stockDraft.productRef);

    try {
      await createWarehouseStock({
        warehouseId,
        productRef: stockDraft.productRef,
        sku: product?.sku || "",
        stockOnHand: Number(stockDraft.stockOnHand || 0),
        reservedStock: Number(stockDraft.reservedStock || 0),
        reorderLevel: Number(stockDraft.reorderLevel || 10),
      });
      setStockDraft(stockDraftInitial);
      setMessage("Warehouse product record saved.");
      await loadWarehouse();
    } catch (error) {
      setMessage(error.message || "Unable to save warehouse stock");
    }
  };

  const saveWarehouseProduct = async () => {
    if (!warehouseProductDraft.sku.trim() || !warehouseProductDraft.name.trim()) {
      setMessage("SKU and product name are required for warehouse-only products.");
      return;
    }

    try {
      await createWarehouseProduct({
        sku: warehouseProductDraft.sku,
        name: warehouseProductDraft.name,
        category: warehouseProductDraft.category,
        unit: warehouseProductDraft.unit,
        purchasePrice: Number(warehouseProductDraft.purchasePrice || 0),
        mrp: Number(warehouseProductDraft.mrp || 0),
        description: warehouseProductDraft.description,
      });
      setWarehouseProductDraft(warehouseProductDraftInitial);
      setMessage("Warehouse-only product saved.");
      await loadWarehouse();
    } catch (error) {
      setMessage(error.message || "Unable to save warehouse-only product");
    }
  };

  const syncProducts = async () => {
    if (!warehouseId) return;

    try {
      const response = await syncWarehouseProducts(warehouseId);
      setMessage(response.message || "Website products synced.");
      await loadWarehouse();
    } catch (error) {
      setMessage(error.message || "Unable to sync website products");
    }
  };

  const saveMovement = async () => {
    if (!warehouseId || !movementDraft.productRef) {
      setMessage("Select a product for the stock entry.");
      return;
    }

    try {
      await createWarehouseMovement({
        warehouseId,
        productRef: movementDraft.productRef,
        movementType: movementDraft.movementType,
        quantity: Number(movementDraft.quantity || 1),
        reference: movementDraft.reference,
      });
      setMovementDraft(movementDraftInitial);
      setMessage(`${movementDraft.movementType} entry submitted for admin approval.`);
      await loadWarehouse();
    } catch (error) {
      setMessage(error.message || "Unable to submit stock entry");
    }
  };

  const saveSheet = async () => {
    if (!warehouseId) return;

    try {
      await updateWarehouseSheet(warehouseId, { sheetUrl });
      setMessage("Google Sheet connection saved.");
      await loadWarehouse();
    } catch (error) {
      setMessage(error.message || "Unable to save Google Sheet connection");
    }
  };

  const syncSheet = async () => {
    if (!warehouseId) return;

    try {
      const response = await syncWarehouseSheet(warehouseId);
      setMessage(`${response.message || "Google Sheet synced"}: ${response.synced || 0} rows.`);
      await loadWarehouse();
    } catch (error) {
      setMessage(error.message || "Unable to sync Google Sheet");
    }
  };

  const exportEntries = (entries, filename) => {
    const headers = ["ID", "Product", "Type", "Quantity", "Reference", "Status", "Requested By", "Created At"];
    const rows = entries.map((entry) => [
      entry.id,
      entry.product_name,
      entry.movement_type,
      entry.quantity,
      entry.reference || "",
      entry.status,
      entry.requested_by || "",
      entry.created_at || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const movementEntries = activeTab === "inward" ? inwardEntries : outwardEntries;

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Warehouse Management</h1>
          <p className="text-sm text-gray-500">
            Gurugram warehouse stock, warehouse-only products, inward/outward approvals, product sync, and Google Sheet sync.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search stock..."
            className="rounded-lg border bg-white px-3 py-2 text-sm sm:w-72"
          />
          <button onClick={loadWarehouse} className="rounded-lg bg-white px-4 py-2 text-sm shadow">
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-[#D6BE8C] bg-[#FFF9E6] px-3 py-2 text-sm text-[#6E4D13]">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Metric label="Warehouse" value={warehouse?.location || "Gurugram"} />
        <Metric label="Listed Products" value={data.summary?.listedProducts || 0} />
        <Metric label="Warehouse-only" value={data.warehouseProducts?.length || 0} />
        <Metric label="Used Units" value={data.summary?.usedUnits || 0} />
        <Metric label="Pending Approvals" value={data.summary?.pendingApprovals || 0} tone="warn" />
      </div>

      <section className="mt-6 rounded-xl bg-white p-4 shadow">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <label className="text-sm">
            <span className="text-xs text-gray-500">Public Google Sheet URL or Sheet ID</span>
            <input
              value={sheetUrl}
              onChange={(event) => setSheetUrl(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <button onClick={saveSheet} className="rounded-lg border px-4 py-2 text-sm">
            Save Sheet
          </button>
          <button onClick={syncSheet} className="rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
            Sync Sheet
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Sheet columns supported: sku, product_name, description, category, unit, purchase_price, mrp, stock_on_hand, reserved_stock, reorder_level, row_id.
        </p>
      </section>

      <div className="mt-6 space-y-6">
        <section className="rounded-xl bg-white p-4 shadow">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2">
              {["stock", "inward", "outward"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-3 py-2 text-sm capitalize ${
                    activeTab === tab ? "bg-[#A68B5B] text-white" : "border bg-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            {activeTab === "stock" ? (
              <button onClick={syncProducts} className="rounded-lg border px-3 py-2 text-sm">
                Sync Website Products
              </button>
            ) : (
              <button
                onClick={() => exportEntries(movementEntries, `${activeTab}-entries.csv`)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Export to Excel
              </button>
            )}
          </div>

          {activeTab === "stock" && (
            <StockTable loading={loading} stock={filteredStock} />
          )}
          {activeTab !== "stock" && (
            <MovementTable
              entries={movementEntries}
              onApprove={approveMovement}
            />
          )}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-xl bg-white p-4 shadow xl:col-span-2">
            <h2 className="mb-4 text-lg font-semibold">Add Warehouse-only Product</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="SKU" value={warehouseProductDraft.sku} onChange={(value) => setWarehouseProductDraft({ ...warehouseProductDraft, sku: value })} />
              <Field label="Product Name" value={warehouseProductDraft.name} onChange={(value) => setWarehouseProductDraft({ ...warehouseProductDraft, name: value })} />
              <Field label="Category" value={warehouseProductDraft.category} onChange={(value) => setWarehouseProductDraft({ ...warehouseProductDraft, category: value })} />
              <Field label="Unit" value={warehouseProductDraft.unit} onChange={(value) => setWarehouseProductDraft({ ...warehouseProductDraft, unit: value })} />
              <Field label="Purchase Price" type="number" value={warehouseProductDraft.purchasePrice} onChange={(value) => setWarehouseProductDraft({ ...warehouseProductDraft, purchasePrice: value })} />
              <Field label="MRP" type="number" value={warehouseProductDraft.mrp} onChange={(value) => setWarehouseProductDraft({ ...warehouseProductDraft, mrp: value })} />
            </div>
            <label className="mt-3 block text-sm">
              <span className="text-xs text-gray-500">Description</span>
              <textarea
                value={warehouseProductDraft.description}
                onChange={(event) => setWarehouseProductDraft({ ...warehouseProductDraft, description: event.target.value })}
                className="mt-1 min-h-20 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <button onClick={saveWarehouseProduct} className="mt-4 rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
              Save Warehouse Product
            </button>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="mb-4 text-lg font-semibold">Add Warehouse Product Record</h2>
            <SelectProduct value={stockDraft.productRef} products={productOptions} onChange={(value) => setStockDraft({ ...stockDraft, productRef: value })} />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="On Hand" type="number" value={stockDraft.stockOnHand} onChange={(value) => setStockDraft({ ...stockDraft, stockOnHand: value })} />
              <Field label="Reserved" type="number" value={stockDraft.reservedStock} onChange={(value) => setStockDraft({ ...stockDraft, reservedStock: value })} />
              <Field label="Reorder" type="number" value={stockDraft.reorderLevel} onChange={(value) => setStockDraft({ ...stockDraft, reorderLevel: value })} />
            </div>
            <button onClick={saveStock} className="mt-4 rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
              Save Stock Record
            </button>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="mb-4 text-lg font-semibold">Create Inward/Outward Entry</h2>
            <div className="space-y-3">
              <SelectProduct value={movementDraft.productRef} products={productOptions} onChange={(value) => setMovementDraft({ ...movementDraft, productRef: value })} />
              <label className="text-sm">
                <span className="text-xs text-gray-500">Entry Type</span>
                <select
                  value={movementDraft.movementType}
                  onChange={(event) => setMovementDraft({ ...movementDraft, movementType: event.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                >
                  <option>Inward</option>
                  <option>Outward</option>
                </select>
              </label>
              <Field label="Quantity" type="number" value={movementDraft.quantity} onChange={(value) => setMovementDraft({ ...movementDraft, quantity: value })} />
              <Field label="Reference" value={movementDraft.reference} onChange={(value) => setMovementDraft({ ...movementDraft, reference: value })} />
            </div>
            <button onClick={saveMovement} className="mt-4 rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">
              Submit for Approval
            </button>
          </div>

          <div className="rounded-xl bg-white p-4 shadow">
            <h2 className="mb-3 text-lg font-semibold">Warehouse Directory</h2>
            {warehouse ? (
              <div className="rounded-lg border p-3">
                <p className="font-medium">{warehouse.name}</p>
                <p className="text-xs text-gray-500">{warehouse.code} - {warehouse.location}</p>
                <p className="mt-2 text-xs text-gray-500">
                  {Number(warehouse.used_units || 0)} / {Number(warehouse.capacity_units || 0)} units used
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Gurugram warehouse is not configured.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StockTable({ loading, stock }) {
  if (loading) {
    return <div className="py-10 text-center text-gray-500">Loading warehouse data...</div>;
  }

  return (
    <div className="max-h-[560px] overflow-auto">
      <table className="w-full min-w-[900px] text-[13px]">
        <thead className="border-b text-left text-gray-500">
          <tr>
            <th className="p-3">Product</th>
            <th>Source</th>
            <th>Category</th>
            <th>Warehouse</th>
            <th>SKU</th>
            <th>Sheet Row</th>
            <th>On Hand</th>
            <th>Reserved</th>
            <th>Approval</th>
            <th>Last Sync</th>
          </tr>
        </thead>
        <tbody>
          {stock.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="p-3 font-medium">{item.product_name}</td>
              <td>
                <span className={`rounded-full px-2 py-1 text-xs ${item.product_source === "Warehouse" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
                  {item.product_source}
                </span>
              </td>
              <td>{item.category_name || "-"}</td>
              <td>{item.warehouse_name}</td>
              <td>{item.sku || "-"}</td>
              <td>{item.google_sheet_row_id || "-"}</td>
              <td>{item.stock_on_hand}</td>
              <td>{item.reserved_stock}</td>
              <td>
                <span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">
                  {item.approval_status}
                </span>
              </td>
              <td>{item.last_synced_at ? new Date(item.last_synced_at).toLocaleString("en-IN") : "-"}</td>
            </tr>
          ))}
          {!stock.length && (
            <tr>
              <td colSpan="10" className="p-8 text-center text-gray-500">
                No warehouse stock records found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MovementTable({ entries, onApprove }) {
  return (
    <div className="max-h-[560px] overflow-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead className="border-b text-left text-gray-500">
          <tr>
            <th className="p-3">Product</th>
            <th>Source</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Reference</th>
            <th>Status</th>
            <th>Requested By</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b">
              <td className="p-3 font-medium">{entry.product_name}</td>
              <td>{entry.product_source}</td>
              <td>{entry.movement_type}</td>
              <td>{entry.quantity}</td>
              <td>{entry.reference || "-"}</td>
              <td>
                <span className={`rounded-full px-2 py-1 text-xs ${entry.status === "Pending" ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700"}`}>
                  {entry.status}
                </span>
              </td>
              <td>{entry.requested_by || "-"}</td>
              <td>
                {entry.status === "Pending" ? (
                  <div className="flex gap-2">
                    <button onClick={() => onApprove(entry.id, "Approved")} className="rounded-lg bg-[#A68B5B] px-3 py-1.5 text-xs text-white">
                      Approve
                    </button>
                    <button onClick={() => onApprove(entry.id, "Rejected")} className="rounded-lg border px-3 py-1.5 text-xs">
                      Reject
                    </button>
                  </div>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
          {!entries.length && (
            <tr>
              <td colSpan="8" className="p-8 text-center text-gray-500">
                No entries found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SelectProduct({ value, products, onChange }) {
  return (
    <label className="text-sm">
      <span className="text-xs text-gray-500">Product</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2"
      >
        <option value="">Select product</option>
        {products.map((product) => (
          <option key={product.ref} value={product.ref}>
            {product.name} ({product.source}{product.sku ? ` - ${product.sku}` : ""})
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border px-3 py-2"
      />
    </label>
  );
}

function Metric({ label, value, tone = "normal" }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${tone === "warn" ? "text-orange-700" : ""}`}>{value}</p>
    </div>
  );
}

export default WarehouseManagement;
