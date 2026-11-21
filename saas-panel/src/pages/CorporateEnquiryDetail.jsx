import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAdminCorporateEnquiryDetail, updateAdminCorporateEnquiry } from "../lib/adminApi";

function CorporateEnquiryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [enquiry, setEnquiry] = useState(null);
  const [form, setForm] = useState({ status: "New", adminNotes: "" });
  const [toast, setToast] = useState("");

  useEffect(() => {
    getAdminCorporateEnquiryDetail(id).then((response) => {
      setEnquiry(response.enquiry);
      setForm({
        status: response.enquiry?.status || "New",
        adminNotes: response.enquiry?.admin_notes || "",
      });
    });
  }, [id]);

  const save = async () => {
    await updateAdminCorporateEnquiry(id, form);
    setToast("Enquiry updated");
    setTimeout(() => setToast(""), 2000);
  };

  if (!enquiry) {
    return <div className="min-h-screen bg-[#F6F4EF] p-6 text-sm text-gray-500">Loading enquiry...</div>;
  }

  const whatsappNumber = String(enquiry.whatsapp || enquiry.phone || "").replace(/\D/g, "");

  return (
    <div className="min-h-screen bg-[#F6F4EF] p-4 md:p-6">
      {toast && <div className="fixed right-5 top-20 rounded-lg bg-black px-4 py-2 text-sm text-white">{toast}</div>}
      <button onClick={() => navigate("/corporate-enquiries")} className="mb-4 rounded border bg-white px-3 py-1 text-sm">Back</button>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-semibold">{enquiry.company_name}</h1>
          <p className="mt-1 text-sm text-gray-500">{enquiry.enquiry_type} - {new Date(enquiry.created_at).toLocaleString("en-IN")}</p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Info label="Contact Person" value={enquiry.contact_name} />
            <Info label="Budget" value={enquiry.budget_range || "-"} />
            <Info label="Timeline" value={enquiry.timeline || "-"} />
            <Info label="Status" value={enquiry.status} />
          </div>

          <div className="mt-5 rounded-xl bg-[#FBF8F2] p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">Brief</p>
            <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{enquiry.message || "No message provided."}</p>
          </div>

          <div className="mt-5">
            <h2 className="font-semibold">Selected Products</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {(enquiry.products || []).length ? enquiry.products.map((product) => (
                <div key={product.id || product.name} className="rounded-lg border p-3 text-sm">
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-xs text-gray-500">{product.brandName || product.categoryName || "Product"}</p>
                </div>
              )) : <p className="text-sm text-gray-500">No products selected.</p>}
            </div>
          </div>
        </section>

        <aside className="h-fit space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <div>
            <h2 className="font-semibold">Contact</h2>
            <div className="mt-3 space-y-2 text-sm">
              <a href={`mailto:${enquiry.email}`} className="block rounded-lg border px-3 py-2 text-[#8A541E]">Email: {enquiry.email}</a>
              <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className="block rounded-lg border px-3 py-2 text-green-700">WhatsApp: {enquiry.whatsapp || enquiry.phone}</a>
              <a href={`tel:${enquiry.phone}`} className="block rounded-lg border px-3 py-2">Call: {enquiry.phone}</a>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">Status</span>
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm">
              <option>New</option>
              <option>In Progress</option>
              <option>Closed</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">Admin Notes</span>
            <textarea value={form.adminNotes} onChange={(event) => setForm((current) => ({ ...current, adminNotes: event.target.value }))} rows={5} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>

          <button onClick={save} className="w-full rounded-lg bg-[#A68B5B] px-4 py-2 text-sm text-white">Save</button>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

export default CorporateEnquiryDetail;
