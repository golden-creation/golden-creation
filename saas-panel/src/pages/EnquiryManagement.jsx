import React, { useEffect, useState } from "react";
import {
  getAdminContactEnquiries,
  updateAdminContactEnquiry,
} from "../lib/adminApi";

const statuses = ["New", "In Progress", "Resolved", "Closed"];

function EnquiryManagement() {
  const [enquiries, setEnquiries] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const payload = await getAdminContactEnquiries({ q: query, status });
      setEnquiries(payload.enquiries || []);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Unable to load enquiries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [query, status]);

  const save = async () => {
    if (!selected) return;
    try {
      await updateAdminContactEnquiry(selected.id, {
        status: selected.status,
        adminNotes: selected.admin_notes || "",
      });
      setMessage("Enquiry updated.");
      setSelected(null);
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to update enquiry");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Enquiry Management</h1>
        <p className="text-sm text-gray-500">Contact requests submitted from the storefront.</p>
      </div>
      {message && <div className="mb-4 rounded-lg border bg-white px-4 py-3 text-sm">{message}</div>}
      <div className="mb-4 grid gap-3 rounded-xl bg-white p-4 shadow-sm md:grid-cols-[1fr_220px]">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, subject, or message" className="rounded-lg border px-3 py-2" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border px-3 py-2">
          <option value="">All statuses</option>
          {statuses.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-[#FBF8F2] text-left text-gray-500">
            <tr>
              <th className="p-4">Received</th><th>Name</th><th>Email</th><th>Subject</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((enquiry) => (
              <tr key={enquiry.id} className="border-b align-top">
                <td className="p-4">{new Date(enquiry.created_at).toLocaleString("en-IN")}</td>
                <td>{[enquiry.first_name, enquiry.last_name].filter(Boolean).join(" ")}</td>
                <td><a className="text-[#8A541E] underline" href={`mailto:${enquiry.email}`}>{enquiry.email}</a></td>
                <td className="max-w-sm"><p className="font-medium">{enquiry.subject}</p><p className="mt-1 line-clamp-2 text-xs text-gray-500">{enquiry.message}</p></td>
                <td><span className="whitespace-nowrap rounded-full bg-[#FFF4CC] px-2 py-1 text-xs">{enquiry.status}</span></td>
                <td><button onClick={() => setSelected({ ...enquiry })} className="rounded-lg border px-3 py-1.5">Review</button></td>
              </tr>
            ))}
            {!loading && !enquiries.length && <tr><td colSpan="6" className="p-10 text-center text-gray-500">No enquiries found.</td></tr>}
            {loading && <tr><td colSpan="6" className="p-10 text-center text-gray-500">Loading enquiries...</td></tr>}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{selected.subject}</h2><button onClick={() => setSelected(null)}>Close</button></div>
            <p className="mt-4 whitespace-pre-wrap rounded-lg bg-[#FBF8F2] p-4 text-sm">{selected.message}</p>
            <label className="mt-4 block text-sm">Status<select value={selected.status} onChange={(event) => setSelected({ ...selected, status: event.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="mt-4 block text-sm">Internal notes<textarea value={selected.admin_notes || ""} onChange={(event) => setSelected({ ...selected, admin_notes: event.target.value })} className="mt-1 h-28 w-full rounded-lg border p-3" /></label>
            <button onClick={save} className="mt-4 rounded-lg bg-[#A68B5B] px-4 py-2 text-white">Save enquiry</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EnquiryManagement;
