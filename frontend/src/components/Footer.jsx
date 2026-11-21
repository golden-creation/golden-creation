import React, { useEffect, useState } from "react";
import instagram from "../assets/instagram.png";
import facebook from "../assets/facebook.png";
import logo from "../assets/golden-creation-official-logo.png";

import { Link } from "react-router-dom";
import { getCategories } from "../lib/api";

const fallbackCategories = [
  { id: "", name: "Art & Craft" },
  {
    id: "",
    name: "Computer & Electronics Accessories",
  },
  { id: "", name: "Office Stationery" },
  { id: "", name: "Premium Pens" },
  { id: "", name: "School Stationery" },
];

const policyLinks = [
  ["Shipping Policy", "/shipping-policy"],
  ["Return Policy", "/return-policy"],
  ["Privacy Policy", "/privacy-policy"],
  ["Terms & Conditions", "/terms-and-conditions"],
];

const socialLinks = [
  {
    href: "https://www.facebook.com/profile.php?id=61584829862307",
    icon: facebook,
    label: "Facebook",
  },
  {
    href: "https://www.instagram.com/golden_creation56/",
    icon: instagram,
    label: "Instagram",
  },
  {
    href: "https://www.linkedin.com/in/ajay-malhotra-a1ab3a32?utm_source=share_via&utm_content=profile&utm_medium=member_android",
    text: "in",
    label: "LinkedIn",
  },
  {
    href: "https://www.youtube.com/@goldencreation56",
    youtube: true,
    label: "YouTube",
  },
];

const Footer = () => {
  const [categories, setCategories] = useState(
    fallbackCategories
  );

  useEffect(() => {
    let ignore = false;

    getCategories()
      .then((items) => {
        if (!ignore && items.length) {
          setCategories(items.slice(0, 6));
        }
      })
      .catch(() => {
        if (!ignore) {
          setCategories(fallbackCategories);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <footer className="mt-12 w-full border-t border-[#E8DDBF] bg-[#FBF8F2]">
      <div className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {/* LOGO & ABOUT */}

          <div className="md:col-span-1">
            <Link
              to="/"
              aria-label="Go to home"
            >
              <img
                src={logo}
                alt="Golden Creation"
                className="mb-6 w-72 object-contain"
              />
            </Link>

            <p className="text-sm leading-7 text-gray-600">
              Premium stationery, office supplies,
              art essentials and gifting products
              delivered with care and quality.
            </p>

            <div className="mt-6 flex items-center gap-3">
              {socialLinks.map((item) => (
                <SocialButton
                  key={item.label}
                  {...item}
                />
              ))}
            </div>
          </div>

          {/* SHOP */}

          <FooterColumn title="Shop">
            {categories.map((category) => (
              <FooterLink
                key={`${category.id}-${category.name}`}
                to={
                  category.id
                    ? `/writing-essentials?category=${category.id}`
                    : `/writing-essentials?q=${encodeURIComponent(
                        category.name
                      )}`
                }
              >
                {category.name}
              </FooterLink>
            ))}
          </FooterColumn>

          {/* COMPANY */}

          <FooterColumn title="Company">
            <FooterLink to="/about">
              About Us
            </FooterLink>

            <FooterLink to="/blog">
              Our Blog
            </FooterLink>

            <FooterLink to="/contact">
              Contact Us
            </FooterLink>

            <FooterLink to="/faqs">
              FAQs
            </FooterLink>

            <FooterLink to="/BundleKits">
              Bundles & Kits
            </FooterLink>

            <FooterLink to="/affiliate">
              Join Affiliate Program
            </FooterLink>
          </FooterColumn>

          {/* POLICIES */}

          <FooterColumn title="Policies">
            {policyLinks.map(([label, path]) => (
              <FooterLink
                key={path}
                to={path}
              >
                {label}
              </FooterLink>
            ))}
          </FooterColumn>
        </div>
      </div>

      {/* COPYRIGHT */}

      <div className="border-t border-[#E8DDBF] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-5 py-4 text-center text-sm text-gray-500 md:flex-row md:px-8">
          <p>
            © 2026 Golden Creation. All Rights
            Reserved.
          </p>

          <p>
            Powered by{" "}
            <a
              href="#"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#C2863F] transition hover:text-[#8A5A22]"
            >
              Golden Radhika
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};

function FooterColumn({
  title,
  children,
}) {
  return (
    <div>
      <h2 className="mb-4 text-base font-bold text-[#242414]">
        {title}
      </h2>

      <ul className="space-y-3 text-sm text-gray-500">
        {children}
      </ul>
    </div>
  );
}

function FooterLink({ to, children }) {
  return (
    <li>
      <Link
        to={to}
        className="inline-flex transition hover:translate-x-1 hover:text-[#A06422]"
      >
        {children}
      </Link>
    </li>
  );
}

function SocialButton({
  href,
  icon,
  label,
  text,
  youtube,
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E8DDBF] bg-white transition hover:-translate-y-0.5 hover:border-[#C2863F] hover:bg-[#FFF4D6]"
    >
      {youtube ? (
        <span
          aria-hidden="true"
          className="relative flex h-4 w-6 items-center justify-center rounded bg-[#FF0000]"
        >
          <span className="ml-0.5 h-0 w-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-white" />
        </span>
      ) : icon ? (
        <img
          src={icon}
          alt=""
          className="h-5 w-5 object-contain"
        />
      ) : (
        <span className="font-serif text-lg font-bold leading-none text-[#0A66C2]">
          {text}
        </span>
      )}
    </a>
  );
}

export default Footer;
