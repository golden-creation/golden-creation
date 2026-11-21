import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import heroImage from "../assets/hero.png";
import logo from "../assets/golden-creation-horizontal-logo.png";

function Step({ title, copy }) {
  return (
    <div className="rounded-2xl border border-[#E9DEC9] bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-[#242414]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{copy}</p>
    </div>
  );
}

export default function AffiliateLanding() {
  return (
    <>
      <Navbar />
      <main className="bg-[#F7F3EA]">
        <section className="px-4 py-8 md:px-8 md:py-12">
          <div className="mx-auto grid max-w-7xl gap-8 overflow-hidden rounded-[28px] bg-[#FFF49C] p-5 md:grid-cols-[1.05fr_0.95fr] md:p-8">
            <div className="flex flex-col justify-center">
              <img src={logo} alt="Golden Creation" className="mb-8 h-16 w-fit object-contain" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8A541E]">
                Affiliate Program
              </p>
              <h1 className="mt-3 text-3xl font-bold leading-tight text-[#101820] md:text-5xl">
                Earn commission by recommending stationery people already need.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#3F4138] md:text-lg">
                Share Golden Creation products, categories, or the website. Approved affiliates get a dashboard, referral links, weekly/monthly reports, and wallet-based manual payouts.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link to="/affiliate/join" className="rounded-2xl bg-[#C2863F] px-6 py-3 text-center font-semibold text-white shadow-md">
                  Join Affiliate Program
                </Link>
                <Link to="/affiliate/login" className="rounded-2xl border border-[#C2863F] bg-white px-6 py-3 text-center font-semibold text-[#8A541E]">
                  Affiliate Login
                </Link>
              </div>
            </div>
            <div className="min-h-[300px] overflow-hidden rounded-[24px] bg-white">
              <img src={heroImage} alt="Desk stationery collection" className="h-full w-full object-cover" />
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-10 md:grid-cols-3 md:px-8">
          <Step title="1. Apply" copy="Submit your profile, promotion channels, and expected reach. The Golden Creation team reviews every application manually." />
          <Step title="2. Share links" copy="Generate links for the website, app, products, or categories. Attribution is captured for the configured tracking window." />
          <Step title="3. Earn and cash out" copy="Commission appears as pending first, becomes available after delivery and the hold period, then can be cashed out manually." />
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-12 md:px-8">
          <div className="rounded-2xl bg-white p-5 shadow-sm md:p-7">
            <h2 className="text-2xl font-bold text-[#242414]">Designed for genuine promotion</h2>
            <div className="mt-5 grid gap-4 text-sm leading-6 text-gray-600 md:grid-cols-3">
              <p>Product/category commission rules are controlled by admin, so campaigns can be tuned for high-priority stationery, gifts, and office essentials.</p>
              <p>The wallet ledger shows pending, approved, paid, rejected, and reversed entries so earnings remain transparent.</p>
              <p>Manual payout approval keeps bank and UPI processing under Golden Creation control for the first release.</p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
