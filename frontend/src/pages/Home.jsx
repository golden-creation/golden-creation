import React, { useEffect, useMemo, useState } from "react";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import heroImg from "../assets/a2.webp";
import user1 from "../assets/a3.jpg";
import user2 from "../assets/a4.jpg";
import user3 from "../assets/a5.jpg";
import rightArrow from "../assets/right-arrow.png";
import chevron from "../assets/chevron.png";
import leftIcon from "../assets/left.png";
import gift from "../assets/gift.png";
import car from "../assets/car.png";
import verify from "../assets/verify.png";
import bag from "../assets/shopping-bag.png";
import t1 from "../assets/t1.jpeg";
import t2 from "../assets/t2.jpeg";
import t3 from "../assets/t3.jpeg";
import t4 from "../assets/t4.jpeg";
import t5 from "../assets/t5.jpeg";
import t6 from "../assets/t6.jpeg";
import t7 from "../assets/t7.jpeg";
import t8 from "../assets/t8.jpeg";
import t9 from "../assets/t9.jpeg";
import t10 from "../assets/t10.jpeg";
import t11 from "../assets/t11.jpeg";
import t12 from "../assets/t12.jpeg";
import t13 from "../assets/t13.jpeg";
import t14 from "../assets/t14.jpeg";
import curatedImg from "../assets/curated.webp";
import graduate from "../assets/graduate.png";
import briefcase from "../assets/briefcase.png";
import palette from "../assets/color-palette.png";
import music from "../assets/music.png";
import star from "../assets/star.png";
import s1 from "../assets/s1.webp";
import s2 from "../assets/s2.jpg";
import s3 from "../assets/s3.webp";
import s4 from "../assets/s4.webp";
import rahul from "../assets/rahul.jpg";
import ananya from "../assets/ananaya.jpg";
import vikram from "../assets/vikram.jpg";
import { formatCurrency, getCategories, getProducts } from "../lib/api";

const categoryArtwork = [
  t1,
  t2,
  t3,
  t4,
  t5,
  t6,
  t7,
  t8,
  t9,
  t10,
  t11,
  t12,
  t13,
  t14,
];

const fallbackCategories = [
  "OFFICE STATIONERY",
  "ART & CRAFT",
  "SCHOOL STATIONERY",
  "CORPORATE GIFTING",
  "PREMIUM PENS",
  "COMPUTER & ELECTRONICS ACCESSORIES",
  "FILES & FOLDERS",
  "NOTEBOOKS & DIARIES",
  "PENS & PENCILS",
  "NOTEPAD & STICKY NOTES",
  "MARKERS & HIGHLIGHTERS",
  "TAPE & SCISSORS",
  "Ink & Refills",
  "Clay & Dough",
];

function Home() {
  const [activeBtn, setActiveBtn] = useState("shop");
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadStorefront() {
      try {
        const [categoryResponse, productResponse] = await Promise.all([
          getCategories(),
          getProducts(),
        ]);

        if (!ignore) {
          setCategories(categoryResponse);
          setProducts(productResponse);
          setError("");
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || "Unable to load storefront sections.");
        }
      }
    }

    loadStorefront();

    return () => {
      ignore = true;
    };
  }, []);

  const visibleCategories = useMemo(() => {
    if (categories.length) {
      return categories.slice(0, 14);
    }

    return fallbackCategories.map((name, index) => ({
      id: index + 1,
      name,
    }));
  }, [categories]);

  const categoryItemsPerPage =
    viewportWidth >= 1024 ? 4 : viewportWidth >= 768 ? 3 : 2;
  const bestsellerItemsPerPage =
    viewportWidth >= 1024 ? 5 : viewportWidth >= 768 ? 3 : 2;

  const categoryPageCount = Math.max(
    1,
    Math.ceil(visibleCategories.length / categoryItemsPerPage)
  );
  const featuredPageCount = Math.max(
    1,
    Math.ceil(products.length / bestsellerItemsPerPage)
  );

  useEffect(() => {
    setCategoryIndex((previous) => Math.min(previous, categoryPageCount - 1));
  }, [categoryPageCount]);

  useEffect(() => {
    setFeaturedIndex((previous) => Math.min(previous, featuredPageCount - 1));
  }, [featuredPageCount]);

  const categoryProducts = useMemo(() => {
    const start = categoryIndex * categoryItemsPerPage;
    const nextSlice = visibleCategories.slice(start, start + categoryItemsPerPage);
    return nextSlice.length
      ? nextSlice
      : visibleCategories.slice(0, categoryItemsPerPage);
  }, [categoryIndex, categoryItemsPerPage, visibleCategories]);

  const featuredProducts = useMemo(() => {
    if (!products.length) {
      return [];
    }

    const start = featuredIndex * bestsellerItemsPerPage;
    const nextSlice = products.slice(start, start + bestsellerItemsPerPage);
    return nextSlice.length
      ? nextSlice
      : products.slice(0, bestsellerItemsPerPage);
  }, [bestsellerItemsPerPage, featuredIndex, products]);

  return (
    <div className="w-full overflow-x-hidden">
      <Navbar />

      <div className="grid bg-[#FFF49CFF] px-4 py-12 md:grid-cols-2 md:px-10">
        <div>
          <p className="mb-3 inline-block rounded-full bg-[#C2863FFF] px-3 py-1 text-sm text-white">
            New Arrival: Premium italian Collection
          </p>
          <h1 className="text-4xl font-bold leading-tight text-gray-800">
            Your Complete <br /> Stationery <br /> Destination
          </h1>
          <p className="mt-4 text-gray-600">
            From luxury writing instruments to everyday office supplies,
            discover tools that inspire productivity and expression.
          </p>
          <div className="mt-6 flex gap-4">
            <button
              onClick={() => {
                setActiveBtn("shop");
                navigate("/writing-essentials");
              }}
              className={`flex items-center gap-2 rounded px-5 py-2 transition ${
                activeBtn === "shop"
                  ? "bg-[#C2863F] text-white"
                  : "border bg-white text-black"
              }`}
            >
              View All Products
              <img src={rightArrow} className="w-4" />
            </button>
            <button
              onClick={() => {
                setActiveBtn("show");
                navigate("/blog");
              }}
              className={`rounded border px-5 py-2 transition ${
                activeBtn === "show"
                  ? "bg-yellow-700 text-white"
                  : "border bg-white text-black"
              }`}
            >
              Read our Blog
            </button>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <img src={user1} className="h-8 w-8 rounded-full object-cover" />
            <img src={user2} className="h-8 w-8 rounded-full object-cover" />
            <img src={user3} className="h-8 w-8 rounded-full object-cover" />
            <p className="text-sm text-gray-600">Trusted by 1000+ customers</p>
          </div>
        </div>
        <img
          src={heroImg}
          className="mt-4 h-[260px] w-full rounded-lg object-cover sm:h-[300px] md:mt-0 md:h-[400px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-6 bg-white px-10 py-6 md:grid-cols-4">
        <Feature icon={gift} title="Flat 15% off on first order" />
        <Feature icon={car} title="Free Delivery on orders above Rs 999" />
        <Feature icon={verify} title="100% Stationery Brands" />
        <Feature icon={bag} title="No-Cost EMI On Premium pens" />
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-[#C2863F] bg-[#FFF4CC] px-4 py-3 text-sm text-[#7a4d18] md:mx-10">
          {error}
        </div>
      )}

      <div className="bg-gray-50 px-4 py-10 md:px-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">Shop by Category</h2>
          <div className="flex items-center gap-3">
            <div className="hidden gap-2 sm:flex">
              <button
                type="button"
                onClick={() =>
                  setCategoryIndex((previous) =>
                    previous > 0 ? previous - 1 : categoryPageCount - 1
                  )
                }
                className="rounded border bg-white p-2 hover:bg-gray-100"
              >
                <img src={leftIcon} className="w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setCategoryIndex((previous) =>
                    previous < categoryPageCount - 1 ? previous + 1 : 0
                  )
                }
                className="rounded border bg-white p-2 hover:bg-gray-100"
              >
                <img src={chevron} className="w-4" />
              </button>
            </div>
            <button
              onClick={() => navigate("/writing-essentials")}
              className="flex items-center gap-1 transition hover:scale-105"
              style={{ color: "#C2863F", background: "transparent" }}
            >
              View All Categories
              <img src={chevron} className="w-4" />
            </button>
          </div>
        </div>
        <p className="mb-6 mt-1 text-sm text-gray-500">
          Curated collections for every creative need.
        </p>
        <div
          className={`grid gap-6 ${
            categoryItemsPerPage === 4
              ? "grid-cols-4"
              : categoryItemsPerPage === 3
              ? "grid-cols-3"
              : "grid-cols-2"
          }`}
        >
          {categoryProducts.map((category, index) => (
            <CategoryCard
              key={category.id}
              img={
                categoryArtwork[
                  (categoryIndex * categoryItemsPerPage + index) %
                    categoryArtwork.length
                ]
              }
              title={category.name}
              onClick={() =>
                navigate(`/writing-essentials?category=${category.id}`)
              }
            />
          ))}
        </div>
        {categoryPageCount > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {Array.from({ length: categoryPageCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCategoryIndex(index)}
                className={`h-2.5 rounded-full transition ${
                  index === categoryIndex
                    ? "w-6 bg-[#C2863F]"
                    : "w-2.5 bg-[#D7C7AF]"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="px-4 py-12 md:px-10"
        style={{
          background: "linear-gradient(180deg, #FFFFFF 0%, #FFF49C 100%)",
        }}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">Our Bestsellers</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setFeaturedIndex((previous) =>
                  previous > 0 ? previous - 1 : featuredPageCount - 1
                )
              }
              className="rounded border p-2 hover:bg-gray-100"
            >
              <img src={leftIcon} className="w-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                setFeaturedIndex((previous) =>
                  previous < featuredPageCount - 1 ? previous + 1 : 0
                )
              }
              className="rounded border p-2 hover:bg-gray-100"
            >
              <img src={chevron} className="w-4" />
            </button>
          </div>
        </div>
        <div
          className={`grid gap-6 ${
            bestsellerItemsPerPage === 5
              ? "grid-cols-5"
              : bestsellerItemsPerPage === 3
              ? "grid-cols-3"
              : "grid-cols-2"
          }`}
        >
          {featuredProducts.length ? (
            featuredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => navigate(`/product/${product.id}`)}
                className="rounded-lg bg-white p-3 text-left shadow-sm transition hover:scale-105 hover:shadow-md"
              >
                <div className="flex h-40 items-center justify-center rounded bg-gray-50 p-3">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-sm text-gray-400">No image</span>
                  )}
                </div>
                <p className="mt-3 text-xs uppercase tracking-wide text-gray-400">
                  {product.categoryName}
                </p>
                <p className="mt-1 text-sm font-medium text-gray-800">
                  {product.name}
                </p>
                <p className="mt-2 font-bold text-[#C2863F]">
                  {formatCurrency(product.price)}
                </p>
              </button>
            ))
          ) : (
            Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="rounded-lg bg-white p-3 shadow-sm"
              >
                <p className="text-sm text-gray-400">Product {index + 1}</p>
              </div>
            ))
          )}
        </div>
        {featuredPageCount > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {Array.from({ length: featuredPageCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setFeaturedIndex(index)}
                className={`h-2.5 rounded-full transition ${
                  index === featuredIndex
                    ? "w-6 bg-[#C2863F]"
                    : "w-2.5 bg-[#D7C7AF]"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="mt-10 flex flex-col items-center gap-8 rounded-2xl px-4 py-6 shadow-md md:mx-10 md:flex-row md:p-8"
        style={{
          background: "linear-gradient(180deg, #f8fafc 0%, #cbd5e1 100%)",
        }}
      >
        <div className="flex-1">
          <span className="rounded-full bg-[#c2873f] px-3 py-1 text-xs font-semibold text-white">
            Curated Bundles
          </span>
          <h2 className="mt-3 text-2xl font-bold leading-snug text-[#C2863FFF] md:text-3xl">
            Everything You Need <br className="hidden md:block" />
            For the New Semester
          </h2>
          <p className="mt-3 max-w-md text-sm text-gray-600 md:text-base">
            Our Student Success Bundle includes a premium notebook,
            mechanical pencils, highlighters, and a study pencil case,
            all at 25% off.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xl font-bold text-black">Rs 2,499</span>
            <span className="text-gray-400 line-through">Rs 3,299</span>
          </div>
          <button
            onClick={() => navigate("/bundle-kits")}
            className="mt-4 rounded-md bg-[#c2873f] px-5 py-2 font-medium text-white shadow transition hover:bg-[#a86e32]"
          >
            Shop The Bundle
          </button>
        </div>
        <div className="flex flex-1 justify-center">
          <img
            src={curatedImg}
            alt="bundle"
            className="w-full max-w-xs rounded-xl object-cover shadow-lg md:max-w-sm"
          />
        </div>
      </div>

      <div className="mt-10 w-full bg-[#FFF49CFF]">
        <div className="px-4 py-10 md:px-10">
          <h2 className="text-center text-xl font-bold text-black">
            Tailored for Your Workflow
          </h2>
          <p className="mt-2 text-center text-sm text-black">
            Whether you are studying for finals, managing a team, or sketching
            your next masterpiece.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <TailCard
              img={graduate}
              title="For Students"
              desc="Perfect for exams, notes, and daily study needs."
            />
            <TailCard
              img={briefcase}
              title="For Professionals"
              desc="Stay organized with tools built for productivity."
            />
            <TailCard
              img={palette}
              title="For Artists"
              desc="Unleash creativity with premium sketch tools."
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 bg-gray-100 px-10 py-12 text-center md:grid-cols-4">
        <Feature icon={car} title="Fast Shipping" />
        <Feature icon={verify} title="Secure Payment" />
        <Feature icon={music} title="Expert Support" />
        <Feature icon={star} title="Quality Guarantee" />
      </div>

      <div className="w-full bg-white py-12">
        <div className="w-full px-4 text-center md:px-10">
          <p className="mb-8 text-sm tracking-wide text-gray-500">
            SHOP BY LEADING BRANDS
          </p>
          <div className="grid grid-cols-2 items-center gap-6 md:grid-cols-4 md:gap-10">
            <img
              src={s1}
              className="h-28 w-full rounded-lg object-cover transition duration-300 hover:scale-105 md:h-36"
            />
            <img
              src={s2}
              className="h-28 w-full rounded-lg object-cover transition duration-300 hover:scale-105 md:h-36"
            />
            <img
              src={s3}
              className="h-28 w-full rounded-lg object-cover transition duration-300 hover:scale-105 md:h-36"
            />
            <img
              src={s4}
              className="h-28 w-full rounded-lg object-cover transition duration-300 hover:scale-105 md:h-36"
            />
          </div>
        </div>
      </div>

      <div className="px-10 py-14 text-center" style={{ background: "#A68B5BFF" }}>
        <h2 className="text-xl font-bold text-white">What Our Community Says</h2>
        <div className="mt-3 flex justify-center gap-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <img key={index} src={star} className="w-5" />
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-200">
          Rated 4.8/5 by over 5,000 customers
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <ReviewCard
            img={rahul}
            name="Rahul Sharma"
            text="Golden Creation is my go-to for office supplies. Their premium pens and stationery sets feel dependable and polished."
          />
          <ReviewCard
            img={ananya}
            name="Ananya Gupta"
            text="The art and craft range is easy to browse now, and the product pages finally feel connected instead of static."
          />
          <ReviewCard
            img={vikram}
            name="Vikram Singh"
            text="The catalog, cart, and checkout flow make the site feel much more complete while keeping the same look."
          />
        </div>
      </div>

      <div className="flex justify-center px-10 py-10">
        <div
          className="w-full rounded-xl px-4 py-12 text-center shadow-lg md:px-10"
          style={{ background: "#161A1DFF" }}
        >
          <h2 className="text-xl font-bold text-white">
            Join the Golden Creation Community
          </h2>
          <p className="mt-3 text-sm text-gray-400">
            Subscribe to get early access to new collections, productivity
            tips, and exclusive offers.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <input
              type="email"
              placeholder="Enter your email"
              className="w-64 rounded-md border border-gray-300 px-4 py-2 outline-none"
            />
            <button
              onClick={() => navigate("/contact")}
              className="rounded-md bg-[#C2863F] px-4 py-2 text-sm text-white transition hover:bg-[#a86e32]"
            >
              Subscribe
            </button>
          </div>
          <p className="mt-4 text-xs text-[#C2863F]">
            By subscribing, you agree to our Privacy Policy and Terms of
            Service.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function ReviewCard({ img, name, text }) {
  return (
    <div className="rounded-lg bg-white p-5 text-left shadow-md">
      <div className="mb-2 flex gap-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <img key={index} src={star} className="w-4" />
        ))}
      </div>
      <p className="text-sm text-gray-600">{text}</p>
      <div className="mt-4 flex items-center gap-3">
        <img src={img} className="h-10 w-10 rounded-full object-cover" />
        <p className="text-sm font-semibold">{name}</p>
      </div>
    </div>
  );
}

function Feature({ icon, title }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <img src={icon} className="h-8 w-8 object-contain" />
      <p className="text-sm font-semibold text-gray-700">{title}</p>
    </div>
  );
}

function CategoryCard({ img, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl bg-white p-4 text-center shadow-sm transition hover:scale-105 hover:shadow-md"
    >
      <div className="flex items-center justify-center">
        <img src={img} className="h-36 w-36 rounded-full object-cover" />
      </div>
      <p className="mt-3 text-sm font-medium text-gray-700">{title}</p>
    </button>
  );
}

function TailCard({ img, title, desc }) {
  return (
    <div
      className="relative z-10 rounded-lg p-6 text-center shadow-md"
      style={{ background: "#A68B5BFF" }}
    >
      <img src={img} className="mx-auto mb-3 w-10" />
      <p className="font-medium text-white">{title}</p>
      <p className="mt-2 text-xs text-gray-200">{desc}</p>
    </div>
  );
}

export default Home;
