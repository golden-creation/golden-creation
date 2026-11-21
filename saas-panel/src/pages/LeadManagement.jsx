import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Download, FileText, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import {
  createSalesLead,
  downloadSalesLeads,
  getSalesLead,
  getSalesLeads,
  getSalesmen,
  updateSalesLead,
} from "../lib/adminApi";
import { getStoredAdmin } from "../lib/api";

const statuses = ["Newly Added", "In Progress", "Closed Won", "Cancelled/Abandoned"];
const leadSources = ["Manual", "Justdial", "Indiamart", "Other"];
const emptyForm = {
  leadName: "",
  source: "Manual",
  meetingAt: "",
  place: "",
  companyName: "",
  contactPerson: "",
  phone: "",
  whatsapp: "",
  email: "",
  notes: "",
  status: "Newly Added",
  closingRemarks: "",
  ownerId: "",
};

function localDateTimeValue(value = new Date()) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function LeadManagement() {
  const admin = getStoredAdmin();
  const isSuperAdmin = String(admin?.role || "").trim().toLowerCase() === "super admin";
  const isSalesman = String(admin?.role || "").trim().toLowerCase() === "salesman";
  const [leads, setLeads] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [filters, setFilters] = useState({ q: "", status: "", source: "", ownerId: "", from: "", to: "", page: 1 });
  const [form, setForm] = useState({ ...emptyForm, meetingAt: localDateTimeValue(), ownerId: isSalesman ? admin?.id || "" : "" });
  const [editingId, setEditingId] = useState(null);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const formRef = useRef(null);

  const load = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const payload = await getSalesLeads(nextFilters);
      setLeads(payload.leads || []);
      setPagination(payload.pagination || pagination);
    } catch (error) {
      setMessage(error.message || "Unable to load leads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (isSuperAdmin) {
      getSalesmen().then((payload) => setSalesmen(payload.salesmen || [])).catch(() => setSalesmen([]));
    }
  }, []);

  const totalPages = Math.max(1, Math.ceil(Number(pagination.total || 0) / Number(pagination.limit || 20)));
  const metrics = useMemo(
    () => statuses.map((status) => [status, leads.filter((lead) => lead.status === status).length]),
    [leads]
  );

  const updateFilter = (key, value) => {
    const next = { ...filters, [key]: value, page: 1 };
    setFilters(next);
    load(next);
  };

  const reset = () => {
    setEditingId(null);
    setHistory([]);
    setForm({
      ...emptyForm,
      meetingAt: localDateTimeValue(),
      ownerId: isSalesman ? admin?.id || "" : "",
    });
  };

  const edit = async (lead) => {
    try {
      const payload = await getSalesLead(lead.id);
      const detail = payload.lead;
      setEditingId(detail.id);
      setHistory(payload.history || []);
      setForm({
        leadName: detail.lead_name || "",
        source: detail.lead_source || "Manual",
        meetingAt: localDateTimeValue(detail.meeting_at),
        place: detail.place || "",
        companyName: detail.company_name || "",
        contactPerson: detail.contact_person || "",
        phone: detail.phone || "",
        whatsapp: detail.whatsapp || "",
        email: detail.email || "",
        notes: detail.notes || "",
        status: detail.status || "Newly Added",
        closingRemarks: detail.closing_remarks || "",
        ownerId: detail.owner_id || "",
      });
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setMessage(error.message || "Unable to open lead");
    }
  };

  const save = async (event) => {
    event.preventDefault();
    try {
      if (editingId) await updateSalesLead(editingId, form);
      else await createSalesLead(form);
      setMessage(editingId ? "Lead updated." : "Lead created.");
      reset();
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to save lead");
    }
  };

  const setPage = (page) => {
    const next = { ...filters, page };
    setFilters(next);
    load(next);
  };

  return (
    <main className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Lead Management</h1>
          <p className="text-sm text-gray-500">Record corporate meetings, follow progress, and connect catalogs to active leads.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => downloadSalesLeads(filters).catch((error) => setMessage(error.message || "Unable to export leads"))} className="inline-flex items-center gap-2 rounded bg-black px-4 py-2 text-sm text-white">
            <Download size={16} /> Export Leads
          </button>
          <button type="button" onClick={() => { reset(); requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth" })); }} className="inline-flex items-center gap-2 rounded bg-[#A68B5B] px-4 py-2 text-sm text-white">
            <Plus size={16} /> Add New Lead
          </button>
        </div>
      </div>

      {message && <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded border bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <section className="mt-5 rounded border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={17} />
            <input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search lead, company or contact..." className="w-full rounded border py-2 pl-9 pr-3 text-sm" />
          </label>
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded border px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          <select value={filters.source} onChange={(event) => updateFilter("source", event.target.value)} className="rounded border px-3 py-2 text-sm">
            <option value="">All sources</option>
            {leadSources.map((source) => <option key={source}>{source}</option>)}
          </select>
          {isSuperAdmin && (
            <select value={filters.ownerId} onChange={(event) => updateFilter("ownerId", event.target.value)} className="rounded border px-3 py-2 text-sm">
              <option value="">All salesmen</option>
              <option value="unassigned">Unassigned / Calling team</option>
              {salesmen.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
          <div className="flex gap-2">
            <input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} className="min-w-0 flex-1 rounded border px-2 py-2 text-xs" title="Meeting date from" />
            <input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} className="min-w-0 flex-1 rounded border px-2 py-2 text-xs" title="Meeting date to" />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b bg-[#FBF8F2] text-xs uppercase text-gray-500">
              <tr><th className="p-3">Lead</th><th>Source</th><th>Meeting</th><th>Company / Contact</th><th>Place</th><th>Owner</th><th>Status</th><th>Catalogs</th><th>Action</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" className="p-8 text-center text-gray-500">Loading leads...</td></tr>
              ) : leads.length ? leads.map((lead) => (
                <tr key={lead.id} className="border-b">
                  <td className="p-3"><p className="font-semibold">{lead.lead_name}</p><p className="text-xs text-gray-500">#{lead.id}</p></td>
                  <td>{lead.lead_source || "Manual"}</td>
                  <td>{new Date(lead.meeting_at).toLocaleString()}</td>
                  <td><p>{lead.company_name || "-"}</p><p className="text-xs text-gray-500">{lead.contact_person || lead.phone || lead.email || "-"}</p></td>
                  <td>{lead.place || "-"}</td>
                  <td>{lead.owner_name}</td>
                  <td><span className={`rounded-full px-2 py-1 text-xs ${lead.status === "Closed Won" ? "bg-green-100 text-green-700" : lead.status === "Cancelled/Abandoned" ? "bg-red-100 text-red-700" : "bg-amber-50 text-amber-700"}`}>{lead.status}</span></td>
                  <td>{lead.catalog_count || 0}</td>
                  <td><button type="button" onClick={() => edit(lead)} className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-xs"><Pencil size={13} /> Edit</button></td>
                </tr>
              )) : <tr><td colSpan="9" className="p-8 text-center text-gray-500">No leads found.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span>Page {pagination.page || 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={(pagination.page || 1) <= 1} onClick={() => setPage((pagination.page || 1) - 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Previous</button>
            <button disabled={(pagination.page || 1) >= totalPages} onClick={() => setPage((pagination.page || 1) + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>

      <section ref={formRef} className="mt-6 scroll-mt-24 rounded border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{editingId ? "Edit Lead" : "Add New Lead"}</h2>
            <p className="text-xs text-gray-500">Final statuses require closing remarks.</p>
          </div>
          {editingId && <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-xs"><RotateCcw size={13} /> Cancel edit</button>}
        </div>
        <form onSubmit={save} className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Lead Name" required value={form.leadName} onChange={(value) => setForm({ ...form, leadName: value })} />
            <label className="text-sm">
              <span className="font-medium">Lead Source</span>
              <input list="lead-source-options" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" />
              <datalist id="lead-source-options">
                {leadSources.map((source) => <option key={source} value={source} />)}
              </datalist>
            </label>
            <label className="text-sm">
              <span className="font-medium">Meeting Date and Time *</span>
              <div className="mt-1 flex gap-2">
                <input type="datetime-local" required value={form.meetingAt} onChange={(event) => setForm({ ...form, meetingAt: event.target.value })} className="min-w-0 flex-1 rounded border px-3 py-2" />
                <button type="button" title="Use current date and time" onClick={() => setForm({ ...form, meetingAt: localDateTimeValue() })} className="rounded border px-3"><Clock3 size={16} /></button>
              </div>
            </label>
            <Field label="Place" value={form.place} onChange={(value) => setForm({ ...form, place: value })} />
            <Field label="Company Name" value={form.companyName} onChange={(value) => setForm({ ...form, companyName: value })} />
            <Field label="Contact Person" value={form.contactPerson} onChange={(value) => setForm({ ...form, contactPerson: value })} />
            <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
            <Field label="WhatsApp" value={form.whatsapp} onChange={(value) => setForm({ ...form, whatsapp: value })} />
            <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
            {isSuperAdmin && (
              <label className="text-sm">
                <span className="font-medium">Assigned Salesman</span>
                <select value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })} className="mt-1 w-full rounded border px-3 py-2">
                  <option value="">Unassigned / Calling team</option>
                  {salesmen.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.email})</option>)}
                </select>
              </label>
            )}
            <label className="text-sm">
              <span className="font-medium">Lead Status</span>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 w-full rounded border px-3 py-2">
                {statuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-4 block text-sm"><span className="font-medium">Remarks / Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-1 min-h-24 w-full rounded border px-3 py-2" /></label>
          {(form.status === "Closed Won" || form.status === "Cancelled/Abandoned") && (
            <label className="mt-4 block text-sm"><span className="font-medium">Closing Remarks *</span><textarea required value={form.closingRemarks} onChange={(event) => setForm({ ...form, closingRemarks: event.target.value })} className="mt-1 min-h-20 w-full rounded border px-3 py-2" /></label>
          )}
          <button className="mt-4 rounded bg-[#A68B5B] px-5 py-2 text-sm text-white">{editingId ? "Update Lead" : "Create Lead"}</button>
        </form>

        {history.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <h3 className="flex items-center gap-2 font-semibold"><FileText size={16} /> Status History</h3>
            <div className="mt-3 space-y-2">
              {history.map((item) => (
                <div key={item.id} className="flex flex-col justify-between gap-1 rounded bg-[#FBF8F2] p-3 text-sm sm:flex-row">
                  <div><span className="font-medium">{item.status}</span>{item.remarks && <span className="text-gray-500"> - {item.remarks}</span>}</div>
                  <span className="text-xs text-gray-400">{item.changed_by_name || "System"} | {new Date(item.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", required = false }) {
  return (
    <label className="text-sm">
      <span className="font-medium">{label}{required ? " *" : ""}</span>
      <input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
    </label>
  );
}
