import React, { useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import rightArrow from "../assets/right-arrow.png";
import boxIcon from "../assets/box.png";
import plusIcon from "../assets/plus.png";
import checkIcon from "../assets/check.png";
import a3 from "../assets/a3.jpg";
import a4 from "../assets/a4.jpg";
import a5 from "../assets/a5.jpg";
import rahul from "../assets/rahul.jpg";
import v1 from "../assets/v1.avif";
import v2 from "../assets/v2.avif";
import v3 from "../assets/v3.jpg";
import w1 from "../assets/w1.avif";
import w2 from "../assets/w2.jpeg";
import w3 from "../assets/W3.webp";
import starIcon from "../assets/star.png";
import briefcaseIcon from "../assets/briefcase.png";

const bundleCards = [
  {
    img: v1,
    title: "Student Starter Kit",
    category: "Academic",
    price: "₹1299",
    oldPrice: "₹1799",
    desc: "Everything a student needs to start the semester strong.",
    items: ["3x Hardcover Notebooks", "12x Pastel Highlighters", "Mechanical Pencil Set", "A5 Weekly Planner"],
  },
  {
    img: v2,
    title: "Artist's Gouache Set",
    category: "Art",
    price: "₹2450",
    oldPrice: "₹2999",
    desc: "Premium pigments and tools for professional illustration.",
    items: ["18 Color Gouache Set", "Synthetic Brush Pack", "Cold Press Paper Pad", "Ceramic Mixing Palette"],
  },
  {
    img: v3,
    title: "The Executive Desk Kit",
    category: "Office",
    price: "₹3800",
    oldPrice: "₹4500",
    desc: "Sophisticated tools for the modern professional workspace.",
    items: ["Signature Fountain Pen", "Leather Journal", "Desk Organizer Set", "Brass Paperweight"],
  },
  {
    img: w1,
    title: "The Creative Journaler",
    category: "Creative",
    price: "₹1599",
    oldPrice: "₹1999",
    desc: "Perfect for bullet journaling, scrapbooking, and daily reflections.",
    items: ["Dot Grid Journal", "Metal Tip Brush Pen", "Floral Washi Tape", "Planner Stickers Set"],
  },
  {
    img: w2,
    title: "Math & Science Pro",
    category: "Academic",
    price: "₹1899",
    oldPrice: "₹2299",
    desc: "Technical precision for number-heavy study sessions.",
    items: ["Advanced Geometry Set", "Scientific Calculator", "Graph Notebook", "Ballpoint Pens"],
  },
  {
    img: w3,
    title: "Calligraphy Masterclass",
    category: "Art",
    price: "₹2999",
    oldPrice: "₹3499",
    desc: "A complete journey from novice lettering to confident ink work.",
    items: ["Calligraphy Pen Holder", "Assorted Nibs Set", "Ink Bottles Pack", "Practice Workbook"],
  },
];

const filterOptions = ["All", "Academic", "Art", "Office", "Creative"];

const BundleKits = () => {
  const [activeBtn, setActiveBtn] = useState("start");
  const [activeFilter, setActiveFilter] = useState("All");
  const [showToast, setShowToast] = useState(false);
  const visibleBundles =
    activeFilter === "All"
      ? bundleCards
      : bundleCards.filter((bundle) => bundle.category === activeFilter);

  const handleQuickAdd = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  return (
    <>
      <Navbar />
      {showToast && (
        <div className="fixed right-5 top-5 z-50 rounded bg-black px-4 py-2 text-sm text-white shadow-lg">
          Bundle added to your kit.
        </div>
      )}

      <section className="w-full bg-[#FFF49CFF] px-4 py-10">
        <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-2">
          <div>
            <span className="rounded-full bg-yellow-200 px-3 py-1 text-xs">
              Custom Experience
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
              Build Your Own <br />
              <span className="text-[#C2863F]">Dream Box</span>
            </h1>
            <p className="mt-4 max-w-md text-gray-600">
              Choose the notebooks, pens, and accessories you love, then turn them into a kit that fits your routine.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <button
                onClick={() => setActiveBtn("start")}
                className={`flex items-center gap-2 rounded-md px-5 py-2 ${
                  activeBtn === "start" ? "bg-[#C2863F] text-white" : "border bg-white"
                }`}
              >
                Start Building Now
                <img src={rightArrow} className="w-4" />
              </button>
              <button
                onClick={() => setActiveBtn("how")}
                className={`rounded-md px-5 py-2 ${
                  activeBtn === "how" ? "bg-[#C2863F] text-white" : "border bg-white"
                }`}
              >
                How It Works
              </button>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex -space-x-2">
                {[a3, a4, a5, rahul].map((avatar) => (
                  <img key={avatar} src={avatar} className="h-8 w-8 rounded-full border object-cover" />
                ))}
              </div>
              <p className="text-sm text-gray-600">
                <span className="font-semibold">1,200+</span> creators built their kits
              </p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex justify-between">
              <div className="flex gap-2">
                <img src={boxIcon} className="mt-2 h-4 w-5" />
                <div>
                  <h2 className="text-sm font-semibold">Your Custom Kit</h2>
                  <p className="text-xs text-gray-400">Updated just now</p>
                </div>
              </div>
              <span className="text-sm text-gray-500">Saved ₹450</span>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Premium Dot Grid Notebook", "₹450"],
                ["Metallic Brush Pen Set", "₹320"],
                ["Eco-Friendly Pencil Case", "₹180"],
              ].map(([name, price]) => (
                <div key={name} className="flex justify-between rounded bg-gray-50 p-2">
                  <p>{name}</p>
                  <span>{price}</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleQuickAdd}
              className="mt-4 flex w-full justify-center gap-2 rounded border py-2"
            >
              <img src={plusIcon} className="mt-1 h-4 w-4" />
              Add Another Item
            </button>
            <div className="mt-4 flex justify-between font-bold">
              <p>Total Bundle Price</p>
              <p>₹950</p>
            </div>
            <button
              onClick={handleQuickAdd}
              className="mt-4 w-full rounded bg-[#C2863FFF] py-2 text-white"
            >
              Checkout My Kit
            </button>
          </div>
        </div>
      </section>

      <section className="w-full bg-gray-100 px-4 py-14">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold tracking-wide text-[#C2863FFF]">
            HANDPICKED VALUE
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-3xl font-bold md:text-4xl">
              Expertly Curated <span className="font-medium italic text-gray-500">Collections</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {filterOptions.map((item) => (
                <button
                  key={item}
                  onClick={() => setActiveFilter(item)}
                  className={`rounded-full px-4 py-1.5 text-sm transition ${
                    activeFilter === item
                      ? "bg-[#C2863F] text-white shadow"
                      : "border bg-white hover:bg-gray-100"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 max-w-xl text-gray-500">
            Designed by stationery enthusiasts to provide the right balance of function, quality, and savings.
          </p>

          <BundleGrid bundles={visibleBundles} onQuickAdd={handleQuickAdd} />
        </div>
      </section>

      <section
        className="w-full px-4 py-16"
        style={{ background: "linear-gradient(180deg, #F9FAFBFF 0%, #C2863FFF 100%)" }}
      >
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-3">
          <InfoCard icon={boxIcon} title="Free Box Packaging">
            Every bundle is shipped in our signature Golden Creation eco-box, ready for gifting or storage.
          </InfoCard>
          <InfoCard icon={starIcon} title="Guaranteed Savings" dark>
            We guarantee at least 20% savings compared to buying individual items separately.
          </InfoCard>
          <InfoCard icon={briefcaseIcon} title="No-Hassle Returns">
            Not happy with one item? Swap it out or return the whole kit within 15 days.
          </InfoCard>
        </div>
      </section>

      <section className="w-full bg-white px-4 py-10">
        <div className="mx-auto max-w-6xl rounded-3xl bg-[#404C31FF] px-6 py-16 text-center text-white shadow-lg">
          <h1 className="text-3xl font-bold md:text-4xl">
            Gift a Spark of <span className="italic text-[#9AD0F5]">Creativity</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-gray-200 md:text-base">
            Our corporate and bulk bundles are perfect for teams, events, and school gifting. Get custom branding on orders over 50 kits.
          </p>
          <button
            onClick={() => alert("Enquiry sent successfully")}
            className="mt-6 rounded-full bg-white px-6 py-2 text-sm font-medium text-black transition hover:opacity-90"
          >
            Enquire About Bulk Orders
          </button>
        </div>
      </section>

      <Footer />
    </>
  );
};

function BundleGrid({ bundles, onQuickAdd }) {
  if (bundles.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        No bundles match this filter yet.
      </div>
    );
  }

  return (
    <div className="mt-10 grid gap-8 md:grid-cols-3">
      {bundles.map((item) => (
        <div key={item.title} className="overflow-hidden rounded-2xl bg-white shadow-md transition duration-300 hover:shadow-xl">
          <img src={item.img} className="h-56 w-full object-cover" />
          <div className="p-5">
            <p className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
              <img src={boxIcon} className="h-4 w-4" />
              {item.category}
            </p>
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className="mt-1 text-xs text-gray-400">{item.desc}</p>
            <p className="mt-3 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium shadow-sm">
              Inside this bundle
            </p>
            <ul className="mt-3 space-y-1 text-sm text-gray-600">
              {item.items.map((list) => (
                <li key={list} className="flex gap-2">
                  <img src={checkIcon} className="w-4" />
                  {list}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 line-through">{item.oldPrice}</p>
                <p className="text-lg font-bold">{item.price}</p>
              </div>
              <button
                onClick={onQuickAdd}
                className="rounded-full bg-[#C2863F] px-4 py-1.5 text-sm text-white hover:opacity-90"
              >
                Quick Add
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoCard({ icon, title, children, dark = false }) {
  return (
    <div className={`rounded-2xl p-6 text-center shadow-md ${dark ? "bg-[#A68B5BFF] text-white" : "bg-[#FFF49CFF]"}`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow">
        <img src={icon} className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className={`mt-2 text-sm ${dark ? "" : "text-gray-600"}`}>{children}</p>
    </div>
  );
}

export default BundleKits;
