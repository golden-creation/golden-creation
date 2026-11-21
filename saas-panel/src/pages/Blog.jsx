import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import z1 from "../assets/z1.jpeg";
import user1 from "../assets/user1.png";
import arrowIcon from "../assets/right-arrow (2).png";
import addIcon from "../assets/add.png";
import searchIcon from "../assets/search.png";
import infoIcon from "../assets/information (2).png";
import chainIcon from "../assets/chain.png";
import e1 from "../assets/e1.jpeg";
import e2 from "../assets/e2.jpeg";
import e3 from "../assets/e3.jpeg";
import e4 from "../assets/e4.jpeg";
import e5 from "../assets/e5.jpeg";
import e6 from "../assets/e6.jpeg";
import y1 from "../assets/y1.jpeg";
import y2 from "../assets/y2.jpeg";
import y3 from "../assets/y3.jpeg";
import a1 from "../assets/a1.jpg";
import a3 from "../assets/a3.jpg";
import a1png from "../assets/a1.png";
import alisha from "../assets/alisha.jpg";
import t1 from "../assets/t1.jpeg";
import t2 from "../assets/t2.jpeg";
import gmailIcon from "../assets/gmail.png";
import { getAdminBlog } from "../lib/adminApi";

const articleImages = [e1, e2, e3, e4, e5, e6];
const authorImages = [a1, a3, a1png, alisha, t1, t2];
const recentImages = [y1, y2, y3];

const Blog = () => {
  const [visible, setVisible] = useState(6);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [blog, setBlog] = useState({
    featured: null,
    articles: [],
    recentPosts: [],
    tags: [],
    totalArticles: 0,
  });
  const navigate = useNavigate();

  const loadBlog = async () => {
    try {
      setStatus("");
      setBlog(await getAdminBlog());
    } catch (error) {
      setStatus(error.message || "Failed to load blog");
    }
  };

  useEffect(() => {
    loadBlog();
  }, []);

  const filteredArticles = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value) return blog.articles || [];

    return (blog.articles || []).filter((article) =>
      [article.title, article.desc, article.description, article.category, article.author]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [blog.articles, query]);

  const featured = blog.featured || {};

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F9FAFB] to-[#BCC7D2] p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Blog</h1>
          {status && <p className="text-sm text-[#8a5b16] mt-1">{status}</p>}
        </div>
        <button
          onClick={() => navigate("/blog-list")}
          className="flex items-center justify-center gap-2 bg-[#A68B5BFF] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:scale-105 transition"
        >
          <img src={addIcon} alt="add" className="h-4 w-4" />
          Add Blog
        </button>
      </div>

      <div className="relative rounded-2xl overflow-hidden shadow-xl">
        <img src={z1} className="w-full h-[220px] sm:h-[280px] md:h-[420px] object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent p-4 sm:p-6 md:p-10 flex flex-col justify-center">
          <span className="bg-[#FFF49CFF] text-black text-[10px] sm:text-xs px-2 py-1 rounded-full w-fit mb-3 font-semibold">
            Featured Article
          </span>
          <h1 className="text-white text-lg sm:text-xl md:text-4xl font-bold max-w-2xl leading-snug">
            {featured.title || "The Future of SaaS"}
          </h1>
          <p className="text-gray-200 mt-2 sm:mt-3 max-w-xl text-[11px] sm:text-sm md:text-base">
            {featured.description || "Explore next-generation platforms powered by AI."}
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 mt-4 sm:mt-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <img src={user1} className="h-8 w-8 sm:h-10 sm:w-10 rounded-full border-2 border-white" />
              <div>
                <p className="text-white text-xs sm:text-sm font-semibold">{featured.author || "Golden Creation"}</p>
                <p className="text-gray-300 text-[10px] sm:text-xs">{featured.readTime || "5 min read"}</p>
              </div>
            </div>
            <button
              onClick={() => setStatus(`Opened ${featured.title || "featured article"}`)}
              className="flex items-center justify-center gap-2 bg-[#A68B5BFF] px-4 sm:px-5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold hover:scale-105 transition w-fit"
            >
              Read More
              <img src={arrowIcon} className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredArticles.slice(0, visible).map((article, index) => (
            <div key={`${article.title}-${index}`} className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition">
              <div className="relative">
                <img src={article.image || articleImages[index % articleImages.length]} className="h-40 w-full object-cover" />
                <span className="absolute top-3 left-3 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  {article.category || "Store"}
                </span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-sm">{article.title}</h3>
                <p className="text-xs text-gray-500 mt-2">{article.desc || article.description}</p>
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <img src={article.authorImg || authorImages[index % authorImages.length]} className="h-6 w-6 rounded-full object-cover border" />
                    <div>
                      <p className="text-xs font-semibold">{article.author || "Golden Creation"}</p>
                      <p className="text-[10px] text-gray-400">{article.date || "Recently"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setStatus(`Opened ${article.title}`)}
                    className="flex items-center gap-1 text-xs text-[#C2863FFF] font-semibold"
                  >
                    Read More
                    <img src={arrowIcon} className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="space-y-6">
          <div className="text-xs text-gray-500">
            Showing: <span className="font-semibold text-black">{filteredArticles.length} of {blog.totalArticles || filteredArticles.length} Articles</span>
          </div>

          <div className="bg-white p-4 rounded-xl shadow">
            <p className="text-sm font-semibold mb-2">Search</p>
            <div className="flex items-center border rounded-lg px-2">
              <img src={searchIcon} className="h-4 mr-2" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a topic..."
                className="w-full py-2 outline-none text-sm"
              />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow">
            <p className="text-sm font-semibold mb-3">Recent Posts</p>
            {(blog.recentPosts || []).map((post, index) => (
              <div key={`${post.title}-${index}`} className="flex gap-3 mb-4 items-start">
                <img src={post.img || recentImages[index % recentImages.length]} className="h-10 w-10 rounded-lg object-cover" />
                <div>
                  <p className="text-xs font-medium leading-tight">{post.title}</p>
                  <div className="flex items-center gap-1 text-gray-400 text-[10px] mt-1">
                    <img src={infoIcon} className="h-3" />
                    {post.time || "Recently"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white p-4 rounded-xl shadow">
            <p className="text-sm font-semibold mb-3">Popular Tags</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {(blog.tags || []).map((tag) => (
                <button key={tag} onClick={() => setQuery(tag)} className="bg-gray-100 px-3 py-1 rounded-full">
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#F9FAFB] p-4 rounded-xl border">
            <div className="flex items-center gap-2 mb-2">
              <img src={chainIcon} className="h-4" />
              <p className="text-sm font-semibold text-[#161A1DFF]">Trending Now</p>
            </div>
            <p className="text-xs text-gray-500 mb-3">Join readers who get weekly Golden Creation updates.</p>
            <button
              onClick={() => setStatus("Community signup noted")}
              className="w-full bg-[#A68B5BFF] text-white py-2 rounded-lg text-sm font-semibold hover:scale-105 transition"
            >
              Join Community
            </button>
          </div>
        </aside>
      </div>

      <div className="flex justify-center mt-10">
        <button onClick={() => setVisible((prev) => prev + 3)} className="bg-white px-6 py-2 rounded-full shadow text-sm hover:scale-105 transition">
          Load More Articles
        </button>
      </div>

      <div className="mt-16 bg-[#FFF49CFF] rounded-2xl py-16 px-6 md:px-10 text-center">
        <div className="flex justify-center mb-4">
          <img src={gmailIcon} className="h-10 w-10 opacity-80" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Keep up with the Golden Creation dashboard</h2>
        <p className="text-gray-500 text-sm mt-3 max-w-xl mx-auto">
          Subscribe interactions are now handled in-page and the article feed is loaded from the admin backend.
        </p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 mt-6">
          <input type="email" placeholder="Enter your email address" className="w-full sm:w-[300px] px-4 py-3 rounded-full border outline-none text-sm" />
          <button
            onClick={() => setStatus("Subscribed successfully")}
            className="bg-[#A68B5BFF] text-white px-6 py-3 rounded-full text-sm font-semibold hover:scale-105 transition"
          >
            Subscribe
          </button>
        </div>
      </div>
    </div>
  );
};

export default Blog;
