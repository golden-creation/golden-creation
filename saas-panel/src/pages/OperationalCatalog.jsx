import React, { useEffect, useState } from "react";
import RemoteLookup from "../components/RemoteLookup";
import {
  approveOperationalMovement,
  downloadAdminXlsx,
  getOperationalCatalog,
  importStoreProducts,
  runBulkAction,
  saveOperationalProduct,
  saveOperationalStock,
  submitOperationalMovement,
} from "../lib/adminApi";
import { readSpreadsheetRows } from "../lib/spreadsheetImport";

const productInitial = { sku: "", barcode: "", name: "", unit: "pcs", purchasePrice: 0, mrp: 0, reorderLevel: 10, status: "Active" };
const stockInitial = { stockOnHand: 0, reservedStock: 0, reorderLevel: 10 };
const movementInitial = { movementType: "Inward", quantity: 1, reference: "" };

export default function OperationalCatalog({ catalog }) {
  const label = catalog === "warehouse" ? "Warehouse" : "Shop";
  const [data, setData] = useState({ products: [], movements: [], pagination: {} });
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("products");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState([]);
  const [product, setProduct] = useState(productInitial);
  const [category, setCategory] = useState(null);
  const [brand, setBrand] = useState(null);
  const [stock, setStock] = useState(stockInitial);
  const [stockProduct, setStockProduct] = useState(null);
  const [movement, setMovement] = useState(movementInitial);
  const [movementProduct, setMovementProduct] = useState(null);

  const load = async () => {
    try {
      setData(await getOperationalCatalog(catalog, { q: query, limit: 50 }));
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, 220);
    return () => clearTimeout(timer);
  }, [catalog, query]);

  const saveProduct = async () => {
    await saveOperationalProduct(catalog, { ...product, categoryId: category?.id, brandId: brand?.id });
    setProduct(productInitial); setCategory(null); setBrand(null); setMessage(`${label} product saved.`); await load();
  };
  const saveStock = async () => {
    await saveOperationalStock(catalog, { ...stock, productId: stockProduct?.id });
    setStock(stockInitial); setStockProduct(null); setMessage("Stock saved."); await load();
  };
  const saveMovement = async () => {
    await submitOperationalMovement(catalog, { ...movement, productId: movementProduct?.id });
    setMovement(movementInitial); setMovementProduct(null); setMessage("Request sent for Super Admin approval."); await load();
  };
  const approve = async (id, status) => {
    await approveOperationalMovement(catalog, id, status); setMessage(`Request ${status.toLowerCase()}.`); await load();
  };
  const bulk = async (action) => {
    if (!selected.length) return;
    const response = await runBulkAction(`${catalog}-products`, action, selected);
    setSelected([]); setMessage(`${response.result?.[action === "archive" ? "archived" : "deleted"]?.length || 0} product(s) updated.`); await load();
  };
  const importSpreadsheet = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      setMessage("Reading spreadsheet...");
      const rows = await readSpreadsheetRows(file);
      const response = await importStoreProducts(rows); setMessage(`${response.saved || 0} Shop product(s) imported.`); await load();
    } catch (error) {
      setMessage(error.message || "Unable to import spreadsheet.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">{label} Products</h1><p className="text-sm text-gray-500">Unified website inventory with {label.toLowerCase()} stock workflow and approval history.</p></div><div className="flex flex-wrap gap-2">{catalog === "store" && <label className="cursor-pointer whitespace-nowrap rounded bg-white px-3 py-2 text-sm shadow">Import XLSX<input type="file" accept=".xlsx" className="hidden" onChange={importSpreadsheet} /></label>}<button onClick={() => downloadAdminXlsx(`${catalog}-products`, selected.length ? { ids: selected.join(",") } : {})} className="rounded bg-black px-3 py-2 text-sm text-white">Export XLSX</button></div></div>
      {message && <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm">{message}</p>}
      <div className="mt-5 flex gap-2">{["products", "stock", "requests"].map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded px-4 py-2 text-sm capitalize ${tab === item ? "bg-[#A68B5B] text-white" : "bg-white"}`}>{item}</button>)}</div>
      {tab === "products" && <><Panel title={`Add or update ${label} product`}><div className="grid gap-3 md:grid-cols-4"><Input label="SKU" value={product.sku} onChange={(sku) => setProduct({ ...product, sku })} /><Input label="Name" value={product.name} onChange={(name) => setProduct({ ...product, name })} /><Input label="Barcode" value={product.barcode} onChange={(barcode) => setProduct({ ...product, barcode })} /><Input label="MRP" type="number" value={product.mrp} onChange={(mrp) => setProduct({ ...product, mrp })} /><Labeled label="Category"><RemoteLookup type="categories" value={category} onChange={setCategory} /></Labeled><Labeled label="Brand"><RemoteLookup type="brands" value={brand} onChange={setBrand} /></Labeled><Input label="Reorder level" type="number" value={product.reorderLevel} onChange={(reorderLevel) => setProduct({ ...product, reorderLevel })} /><button onClick={saveProduct} className="self-end rounded bg-black px-4 py-2 text-sm text-white">Save product</button></div></Panel><List products={data.products} selected={selected} setSelected={setSelected} query={query} setQuery={setQuery} bulk={bulk} /></>}
      {tab === "stock" && <Panel title="Set current stock"><div className="grid gap-3 md:grid-cols-4"><Labeled label="Product"><RemoteLookup type="products" catalog={catalog} value={stockProduct} onChange={setStockProduct} /></Labeled><Input label="Stock on hand" type="number" value={stock.stockOnHand} onChange={(stockOnHand) => setStock({ ...stock, stockOnHand })} /><Input label="Reserved stock" type="number" value={stock.reservedStock} onChange={(reservedStock) => setStock({ ...stock, reservedStock })} /><button onClick={saveStock} className="self-end rounded bg-black px-4 py-2 text-sm text-white">Save stock</button></div></Panel>}
      {tab === "requests" && <><Panel title="Submit inward or outward request"><div className="grid gap-3 md:grid-cols-4"><Labeled label="Product"><RemoteLookup type="products" catalog={catalog} value={movementProduct} onChange={setMovementProduct} /></Labeled><Labeled label="Type"><select value={movement.movementType} onChange={(event) => setMovement({ ...movement, movementType: event.target.value })} className="w-full rounded border px-3 py-2 text-sm"><option>Inward</option><option>Outward</option></select></Labeled><Input label="Quantity" type="number" value={movement.quantity} onChange={(quantity) => setMovement({ ...movement, quantity })} /><button onClick={saveMovement} className="self-end rounded bg-black px-4 py-2 text-sm text-white">Submit request</button></div></Panel><Panel title="Request history"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="p-2">Product</th><th>Type</th><th>Quantity</th><th>Status</th><th>Requested by</th><th>Action</th></tr></thead><tbody>{data.movements?.map((item) => <tr key={item.id} className="border-b"><td className="p-2">{item.product_name}</td><td>{item.movement_type}</td><td>{item.quantity}</td><td>{item.status}</td><td>{item.requested_by}</td><td>{item.status === "Pending" && <div className="flex gap-1"><button onClick={() => approve(item.id, "Approved")} className="rounded bg-green-700 px-2 py-1 text-xs text-white">Approve</button><button onClick={() => approve(item.id, "Rejected")} className="rounded bg-red-700 px-2 py-1 text-xs text-white">Reject</button></div>}</td></tr>)}</tbody></table></div></Panel></>}
    </main>
  );
}

function Panel({ title, children }) { return <section className="mt-5 rounded bg-white p-4 shadow"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>; }
function Labeled({ label, children }) { return <label className="block text-xs font-medium text-gray-600">{label}<div className="mt-1">{children}</div></label>; }
function Input({ label, value, onChange, type = "text" }) { return <Labeled label={label}><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded border px-3 py-2 text-sm" /></Labeled>; }
function List({ products, selected, setSelected, query, setQuery, bulk }) {
  const allVisibleSelected = products?.length > 0 && products.every((item) => selected.includes(item.id));
  return <Panel title="Catalog"><div className="mb-3 flex flex-wrap gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product or SKU..." className="rounded border px-3 py-2 text-sm" /><button onClick={() => bulk("archive")} className="rounded bg-white px-3 py-2 text-sm shadow">Archive selected</button><button onClick={() => bulk("delete")} className="rounded bg-red-700 px-3 py-2 text-sm text-white">Delete selected</button></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="p-2"><input type="checkbox" aria-label="Select all catalog products" checked={allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? products.map((item) => item.id) : [])} /></th><th>Product</th><th>SKU</th><th>Category</th><th>Brand</th><th>Stock</th><th>Status</th></tr></thead><tbody>{products?.map((item) => <tr key={item.id} className="border-b"><td className="p-2"><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} /></td><td>{item.name}</td><td>{item.sku}</td><td>{item.category_name || "-"}</td><td>{item.brand_name || "-"}</td><td>{item.stock_on_hand || 0}</td><td>{item.status}</td></tr>)}</tbody></table></div></Panel>;
}
