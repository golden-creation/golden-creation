import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminCorporateEnquiries } from "../lib/adminApi";

function CorporateEnquiries() {
  const navigate = useNavigate();
  const [enquiries, setEnquiries] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [loading, setLoading] = useState(true);

  const loadEnquiries = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const response = await getAdminCorporateEnquiries(nextFilters);
      setEnquiries(response.enquiries || []);
      setMetrics(response.metrics || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEnquiries();
  }, []);

  const cards = useMemo(() => [
    ["Total", metrics.total || enquiries.length || 0],
    ["New", metrics.new || 0],
    ["In Progress", metrics.inProgress || 0],
    ["Closed", metrics.closed || 0],
  ], [enquiries.length, metrics]);

  const updateFilter = (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    loadEnquiries(next);
  };

  return (
    <div className="min-h-screen bg-[#F6F4EF] p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Corporate Enquiries</h1>
        <p className="text-sm text-gray-500">Manage bulk, gifting, and custom order enquiries from the storefront.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {cards.map(([label, value]) => <Metric key={label} label={label} value={value} />)}
      </div>

      <section className="mt-5 rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search company, contact, email or phone" className="rounded-lg border px-3 py-2 text-sm" />
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm">
            <option value="">All Status</option>
            <option>New</option>
            <option>In Progress</option>
            <option>Closed</option>
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-[#FBF8F2] text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">Company</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Type</th>
                <th className="p-3">Products</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="p-6 text-center text-gray-500">Loading enquiries...</td></tr>
              ) : enquiries.length ? enquiries.map((enquiry) => (
                <tr key={enquiry.id} className="border-t">
                  <td className="p-3 font-semibold">{enquiry.company_name}</td>
                  <td className="p-3">
                    <p>{enquiry.contact_name}</p>
                    <p className="text-xs text-gray-500">{enquiry.email}</p>
                  </td>
                  <td className="p-3">{enquiry.enquiry_type}</td>
                  <td className="p-3">{enquiry.products?.length || 0}</td>
                  <td className="p-3"><span className="rounded-full bg-[#FFF4DC] px-3 py-1 text-xs text-[#7A4D18]">{enquiry.status}</span></td>
                  <td className="p-3 text-gray-500">{new Date(enquiry.created_at).toLocaleDateString("en-IN")}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => navigate(`/corporate-enquiries/${enquiry.id}`)} className="rounded border px-3 py-1 text-xs">Details</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="7" className="p-6 text-center text-gray-500">No corporate enquiries found.</td></tr>
              )}
            </tbody>
          </table>
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

export default CorporateEnquiries;
