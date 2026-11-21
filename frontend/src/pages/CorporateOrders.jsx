import React, { useEffect, useMemo, useState } from "react";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { formatCurrency, getProducts, pushDataLayer, submitCorporateEnquiry } from "../lib/api";

const emptyForm = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  whatsapp: "",
  enquiryType: "Corporate Gifting",
  budgetRange: "",
  timeline: "",
  message: "",
};

function CorporateOrders() {
  const [products, setProducts] = useState([]);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getProducts({ limit: 100 }).then(setProducts).catch(() => setProducts([]));
  }, []);

  const matches = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    if (!query) return products.slice(0, 8);
    return products
      .filter((product) =>
        [product.name, product.categoryName, product.brandName, product.description]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 8);
  }, [productQuery, products]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus("");
  };

  const toggleProduct = (product) => {
    setSelectedProducts((current) =>
      current.some((item) => item.id === product.id)
        ? current.filter((item) => item.id !== product.id)
        : [...current, product]
    );
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");

    try {
      await submitCorporateEnquiry({
        ...form,
        products: selectedProducts.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.price,
          categoryName: product.categoryName,
          brandName: product.brandName,
        })),
      });
      pushDataLayer("generate_lead", {
        lead_type: "corporate_order",
        form_name: "Corporate Orders",
      });
      setForm(emptyForm);
      setSelectedProducts([]);
      setProductQuery("");
      setStatus("Your enquiry has been submitted. Our team will contact you shortly.");
    } catch (error) {
      setStatus(error.message || "Unable to submit enquiry");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF8F2]">
      <Navbar />
      <main>
        <section className="border-b bg-[#FFF49C] px-4 py-8 md:px-8 md:py-12">
          <div className="mx-auto grid max-w-7xl min-w-0 gap-8 md:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] md:items-center">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8A541E]">Corporate orders</p>
              <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-[#242414] md:text-5xl">
                Stationery, gifting, and custom kits for teams and events
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-700 md:text-base">
                Share your gifting brief, preferred products, budget, timeline, and branding needs. Golden Creation can prepare curated stationery boxes, office onboarding kits, school/event supplies, and custom product bundles for bulk orders.
              </p>
            </div>
            <div className="min-w-0 rounded-xl border bg-white p-4 shadow-sm md:p-5">
              <h2 className="text-lg font-semibold">What we support</h2>
              <div className="mt-4 space-y-3 text-sm text-gray-600">
                <Info label="Corporate gifting" value="Welcome kits, festive boxes, and client gifts." />
                <Info label="Bulk office orders" value="Recurring stationery needs with product selection support." />
                <Info label="Custom bundles" value="Handpicked products packed together for your team." />
              </div>
            </div>
          </div>
        </section>

        <section className="recaptcha-safe mx-auto grid max-w-7xl min-w-0 gap-6 px-4 py-8 md:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] md:px-8">
          <form onSubmit={submit} className="min-w-0 rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Enquiry details</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Company Name" value={form.companyName} onChange={(value) => updateForm("companyName", value)} required />
              <Field label="Contact Person" value={form.contactName} onChange={(value) => updateForm("contactName", value)} required />
              <Field label="Email" type="email" value={form.email} onChange={(value) => updateForm("email", value)} required />
              <Field label="Mobile Number" value={form.phone} onChange={(value) => updateForm("phone", value)} required />
              <Field label="WhatsApp Number" value={form.whatsapp} onChange={(value) => updateForm("whatsapp", value)} />
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Requirement Type</span>
                <select value={form.enquiryType} onChange={(event) => updateForm("enquiryType", event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                  <option>Corporate Gifting</option>
                  <option>Bulk Office Order</option>
                  <option>Custom Product Bundle</option>
                  <option>School or Event Supply</option>
                </select>
              </label>
              <Field label="Budget Range" value={form.budgetRange} onChange={(value) => updateForm("budgetRange", value)} placeholder="Example: Rs. 25,000 - Rs. 50,000" />
              <Field label="Timeline" value={form.timeline} onChange={(value) => updateForm("timeline", value)} placeholder="Example: Need in 2 weeks" />
              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-gray-500">Brief</span>
                <textarea value={form.message} onChange={(event) => updateForm("message", event.target.value)} rows={5} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Mention quantities, branding, packaging, delivery city, or any special product request." />
              </label>
            </div>
            {status && <p className="mt-4 rounded-lg bg-[#FBF8F2] px-4 py-3 text-sm text-[#7A4D18]">{status}</p>}
            <button disabled={submitting} className="mobile-touch-target mt-5 w-full rounded-lg bg-[#C2863F] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">
              {submitting ? "Submitting..." : "Submit Enquiry"}
            </button>
          </form>

          <aside className="h-fit min-w-0 rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Select products for enquiry</h2>
            <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Search products" className="mobile-touch-target mt-4 w-full rounded-lg border px-3 py-2 text-sm" />
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {matches.map((product) => {
                const selected = selectedProducts.some((item) => item.id === product.id);
                return (
                  <button key={product.id} type="button" onClick={() => toggleProduct(product)} className={`mobile-touch-target flex w-full items-center gap-3 rounded-lg border p-2 text-left ${selected ? "border-[#C2863F] bg-[#FFF9C9]" : "bg-white"}`}>
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-[#FBF8F2]">
                      {product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-contain" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{product.name}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(product.price)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-lg bg-[#FBF8F2] p-3">
              <p className="text-sm font-semibold">{selectedProducts.length} selected products</p>
              <p className="mt-1 text-xs text-gray-500">Selected products are sent with the enquiry so staff can prepare the quotation faster.</p>
            </div>
          </aside>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = false, placeholder = "" }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mobile-touch-target mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg bg-[#FBF8F2] p-3">
      <p className="font-semibold text-[#242414]">{label}</p>
      <p className="mt-1 text-xs">{value}</p>
    </div>
  );
}

export default CorporateOrders;
