import React from "react";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";

const faqs = [
  {
    question: "How do I track my Golden Creation order?",
    answer:
      "Open the Track Order page from your account area and enter your order details. You can also check recent orders from your profile.",
  },
  {
    question: "Can I return stationery items?",
    answer:
      "Eligible unused products can be returned within the return window. Damaged, incorrect, or defective products should be reported with photos.",
  },
  {
    question: "Do you sell school, office, and art products?",
    answer:
      "Yes. The catalog includes school stationery, office essentials, art and craft products, premium pens, desk supplies, and gifting items.",
  },
  {
    question: "Is online payment secure?",
    answer:
      "Checkout is designed to use secure payment handling. Avoid sharing OTPs, passwords, or payment details outside the official checkout flow.",
  },
  {
    question: "Can I place bulk or office orders?",
    answer:
      "Yes. Use the Contact page for bulk stationery, office supply, or gifting requirements and the team will follow up.",
  },
];

function Faqs() {
  return (
    <div className="min-h-screen bg-[#FBF8F2]">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-14">
        <div className="rounded-3xl bg-white p-6 shadow-sm md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C2863F]">
            Help Center
          </p>
          <h1 className="mt-3 text-3xl font-bold text-[#242414] md:text-4xl">
            Frequently Asked Questions
          </h1>
          <div className="mt-8 divide-y divide-gray-100">
            {faqs.map((item) => (
              <section key={item.question} className="py-5">
                <h2 className="text-lg font-semibold text-[#242414]">{item.question}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">{item.answer}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default Faqs;
