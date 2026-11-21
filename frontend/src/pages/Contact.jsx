import React, { useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

import phone from "../assets/telephone.png";
import mail from "../assets/gmail (1).png";
import whatsapp from "../assets/whatsapp.png";
import location from "../assets/location.png";
import clock from "../assets/clock (1).png";
import plane from "../assets/paper-plane.png";
import share from "../assets/share (1).png";
import { pushDataLayer, submitContactEnquiry } from "../lib/api";

const contactDetails = {
  email: "goldencreation@lekhanmart.in",

  primaryPhone: "+91 87459 35729",

  supportPhone: "+91 73030 49362",

  address:
    "G-38, BAANI THE ADDRESS SHOPPING ARCADE, SECTOR 56, GOLF COURSE ROAD, GURUGRAM, Haryana - 122011",

  mapQuery:
    "G-38 BAANI THE ADDRESS SHOPPING ARCADE SECTOR 56 GOLF COURSE ROAD GURUGRAM Haryana 122011",

  mapLink:
    "https://maps.app.goo.gl/iPsQep2E1LNHgWGaA",
};

const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(
  contactDetails.mapQuery
)}&output=embed`;

const mapLink = contactDetails.mapLink;

const Contact = () => {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFeedback("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFeedback("");
    try {
      await submitContactEnquiry(form);
      pushDataLayer("generate_lead", {
        lead_type: "contact",
        form_name: "Contact Us",
      });
      setFeedback("Your enquiry has been sent. Our team will contact you shortly.");
      setForm({ firstName: "", lastName: "", email: "", subject: "", message: "" });
    } catch (error) {
      setFeedback(error.message || "Unable to send your enquiry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />

      {/* HERO SECTION */}

      <section className="w-full bg-[#FFF49C] px-4 py-8 md:px-8 md:py-12">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8A5A22]">
            Golden Creation
          </p>

          <h1 className="mt-3 text-3xl font-bold text-[#242414] md:text-5xl">
            Contact Information
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-[#5F5A44]">
            For questions about policies, product
            support, bulk stationery orders, or
            store visits, you can reach us here.
          </p>
        </div>
      </section>

      {/* MAIN SECTION */}

      <main className="recaptcha-safe bg-[#FBF8F2] px-4 py-8 md:px-8 md:py-10">
        <div className="mx-auto grid max-w-7xl min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* CONTACT FORM */}

          <form onSubmit={handleSubmit} className="rounded-2xl border border-[#E8DDBF] bg-white p-5 shadow-sm md:rounded-3xl md:p-8">
            <h2 className="text-xl font-bold text-[#242414] md:text-2xl">
              Send us a message
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Fill out the form below and our team
              will respond as soon as possible.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="First Name"
                placeholder="Enter your first name"
                value={form.firstName}
                onChange={(value) => updateField("firstName", value)}
                required
              />

              <Field
                label="Last Name"
                placeholder="Enter your last name"
                value={form.lastName}
                onChange={(value) => updateField("lastName", value)}
              />
            </div>

            <Field
              label="Email Address"
              placeholder="Enter your email address"
              type="email"
              className="mt-4"
              value={form.email}
              onChange={(value) => updateField("email", value)}
              required
            />

            <Field
              label="Subject"
              placeholder="How can we help you?"
              className="mt-4"
              value={form.subject}
              onChange={(value) => updateField("subject", value)}
              required
            />

            <div className="mt-4">
              <label className="text-sm font-medium text-gray-600">
                Your Message
              </label>

              <textarea
                placeholder="Type your detailed message here..."
                value={form.message}
                onChange={(event) => updateField("message", event.target.value)}
                required
                className="mt-1 h-32 w-full rounded-xl border border-gray-200 bg-[#FBF8F2] p-3 text-sm outline-none transition focus:border-[#C2863F] focus:bg-white"
              />
            </div>

            {feedback && (
              <p className="mt-4 rounded-xl bg-[#FBF8F2] px-4 py-3 text-sm text-[#7A4D18]">
                {feedback}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mobile-touch-target mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#C2863F] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#A06422]"
            >
              <img
                src={plane}
                alt=""
                className="w-4 invert"
              />

              {submitting ? "Sending..." : "Send Message"}
            </button>
          </form>

          {/* CONTACT DETAILS */}

          <section className="min-w-0 space-y-6">
            <div className="rounded-2xl border border-[#E8DDBF] bg-white p-5 shadow-sm md:rounded-3xl md:p-8">
              <h2 className="text-xl font-bold text-[#242414] md:text-2xl">
                Contact Information
              </h2>

              <div className="mt-6 space-y-4">
                <ContactCard
                  icon={mail}
                  title="Email"
                  value={contactDetails.email}
                  detail="For product, order, and policy support"
                  href={`mailto:${contactDetails.email}`}
                />

                <ContactCard
                  icon={phone}
                  title="Phone"
                  value={contactDetails.primaryPhone}
                  detail={`Alternate support: ${contactDetails.supportPhone}`}
                  href={`tel:${contactDetails.primaryPhone.replace(
                    /\s/g,
                    ""
                  )}`}
                />

                <ContactCard
                  icon={whatsapp}
                  title="WhatsApp"
                  value={contactDetails.primaryPhone}
                  detail="Fastest support for quick queries"
                  href={`https://wa.me/${contactDetails.primaryPhone.replace(
                    /\D/g,
                    ""
                  )}`}
                />

                <ContactCard
                  icon={location}
                  title="Address"
                  value={contactDetails.address}
                  detail="Sector 56, Golf Course Road, Gurugram"
                  href={mapLink}
                />
              </div>
            </div>

            {/* MAP */}

            <div className="overflow-hidden rounded-2xl border border-[#E8DDBF] bg-white shadow-sm md:rounded-3xl">
              <div className="flex min-w-0 flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-[#242414]">
                    Map Location
                  </h2>

                  <p className="mt-1 break-words text-sm text-gray-500">
                    BAANI ADDRESS ONE SHOPPING ARCADE, RAPID METRO STATION, G38, 55-56, Golf Course Rd, Sector 56, Gurugram, Haryana 122011
                  </p>
                </div>

                <a
                  href={mapLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mobile-touch-target inline-flex items-center justify-center gap-2 rounded-full border border-[#C2863F] px-4 py-2 text-sm font-semibold text-[#8A5A22] transition hover:bg-[#FFF49C]"
                >
                  <img
                    src={share}
                    className="h-4 w-4"
                    alt=""
                  />

                  Open in Google Maps
                </a>
              </div>

              <div className="border-t border-[#E8DDBF] bg-[#FBF8F2] p-5 text-center md:hidden">
                <p className="text-sm font-semibold text-[#242414]">Golden Creation, Sector 56, Gurugram</p>
                <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-gray-500">
                  Tap below to open the exact store location in Google Maps.
                </p>
                <a
                  href={mapLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mobile-touch-target mt-4 inline-flex items-center justify-center rounded-full bg-[#C2863F] px-5 py-3 text-sm font-semibold text-white"
                >
                  Open Map
                </a>
              </div>
              <iframe
                title="Golden Creation map location"
                src={mapUrl}
                className="hidden h-80 w-full border-0 md:block"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            {/* BUSINESS HOURS */}

            <div className="rounded-2xl border border-[#E8DDBF] bg-white p-5 shadow-sm md:rounded-3xl md:p-6">
              <h2 className="text-xl font-bold text-[#242414]">
                Business Hours
              </h2>

              <div className="mt-4 flex items-start gap-3 text-sm">
                <img
                  src={clock}
                  className="mt-1 h-5 w-5"
                  alt=""
                />

                <div className="space-y-1 text-gray-600">
                  <p>
                    Monday - Friday: 09:00 AM -
                    08:00 PM
                  </p>

                  <p>
                    Saturday: 10:00 AM - 06:00 PM
                  </p>

                  <p className="text-red-500">
                    Sunday: Closed
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
};

function Field({
  label,
  placeholder,
  type = "text",
  className = "",
  value,
  onChange,
  required = false,
}) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-gray-600">
        {label}
      </label>

      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      className="mobile-touch-target mt-1 w-full rounded-xl border border-gray-200 bg-[#FBF8F2] p-3 text-sm outline-none transition focus:border-[#C2863F] focus:bg-white"
      />
    </div>
  );
}

function ContactCard({
  icon,
  title,
  value,
  detail,
  href,
}) {
  const content = (
    <div className="flex min-w-0 gap-4 rounded-2xl border border-gray-100 bg-[#FBF8F2] p-4 transition hover:border-[#C2863F] hover:bg-white">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF49C]">
        <img
          src={icon}
          className="h-5 w-5 object-contain"
          alt=""
        />
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {title}
        </p>

        <p className="mt-1 break-words font-semibold leading-6 text-[#242414]">
          {value}
        </p>

        <p className="mt-1 text-sm text-gray-500">
          {detail}
        </p>
      </div>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <a
      href={href}
      target={
        href.startsWith("http")
          ? "_blank"
          : undefined
      }
      rel={
        href.startsWith("http")
          ? "noreferrer"
          : undefined
      }
    >
      {content}
    </a>
  );
}

export default Contact;
