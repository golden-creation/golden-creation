import React, { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { pushDataLayer, submitAffiliateApplication } from "../lib/api";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  businessName: "",
  socialProfile: "",
  city: "",
  state: "",
  promotionChannels: "",
  expectedMonthlyReach: "",
  notes: "",
};

function Field({ label, children }) {
  return (
    <label className="block text-sm font-semibold text-[#242414]">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

export default function AffiliateJoin() {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      await submitAffiliateApplication(form);
      pushDataLayer("generate_lead", {
        lead_type: "affiliate_application",
        form_name: "Affiliate Join",
      });
      setForm(emptyForm);
      setMessage("Application submitted. Golden Creation will review and contact you shortly.");
    } catch (error) {
      setMessage(error.message || "Unable to submit affiliate application.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-2xl border border-[#E6D7BF] bg-white px-4 py-3 text-sm outline-none focus:border-[#C2863F] focus:ring-4 focus:ring-[#D8A14B]/20";

  return (
    <>
      <Navbar />
      <main className="bg-[#F7F3EA] px-4 py-8 md:px-8 md:py-12">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-3xl bg-[#404C31] p-6 text-white md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFF49C]">Join Affiliate Program</p>
            <h1 className="mt-4 text-3xl font-bold leading-tight md:text-4xl">Apply to become a Golden Creation affiliate.</h1>
            <p className="mt-4 text-sm leading-7 text-white/80">
              Share details about your audience and promotion channels. Approved accounts receive access to a focused affiliate dashboard with link generation, wallet, and reports.
            </p>
            <div className="mt-6 rounded-2xl bg-white/10 p-4 text-sm leading-6">
              Commission becomes withdrawable after the order is delivered and the configured hold period is complete. Payouts are processed manually after admin approval.
            </div>
            <Link to="/affiliate/login" className="mt-6 inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[#404C31]">
              Already approved? Login
            </Link>
          </section>

          <form onSubmit={submit} className="rounded-3xl bg-white p-5 shadow-sm md:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name">
                <input className={inputClass} value={form.name} onChange={(event) => update("name", event.target.value)} required />
              </Field>
              <Field label="Email">
                <input className={inputClass} type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required />
              </Field>
              <Field label="Mobile Number">
                <input className={inputClass} value={form.phone} onChange={(event) => update("phone", event.target.value)} required />
              </Field>
              <Field label="Business / Social Name">
                <input className={inputClass} value={form.businessName} onChange={(event) => update("businessName", event.target.value)} />
              </Field>
              <Field label="City">
                <input className={inputClass} value={form.city} onChange={(event) => update("city", event.target.value)} />
              </Field>
              <Field label="State">
                <input className={inputClass} value={form.state} onChange={(event) => update("state", event.target.value)} />
              </Field>
              <Field label="Business / Social Profile Link">
                <input className={inputClass} value={form.socialProfile} onChange={(event) => update("socialProfile", event.target.value)} placeholder="Instagram, YouTube, website, marketplace profile..." />
              </Field>
              <Field label="Expected Monthly Reach">
                <input className={inputClass} value={form.expectedMonthlyReach} onChange={(event) => update("expectedMonthlyReach", event.target.value)} placeholder="Example: 20,000 viewers" />
              </Field>
            </div>
            <div className="mt-4 grid gap-4">
              <Field label="Promotion Channels">
                <textarea className={`${inputClass} min-h-[100px]`} value={form.promotionChannels} onChange={(event) => update("promotionChannels", event.target.value)} placeholder="WhatsApp groups, Instagram, YouTube, blogs, corporate network..." required />
              </Field>
              <Field label="Notes">
                <textarea className={`${inputClass} min-h-[100px]`} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Tell us how you plan to promote Golden Creation." />
              </Field>
            </div>
            {message && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {message}
              </div>
            )}
            <button
              disabled={submitting}
              className="mt-5 w-full rounded-2xl bg-[#C2863F] px-6 py-3 font-semibold text-white shadow-md disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit Application"}
            </button>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
