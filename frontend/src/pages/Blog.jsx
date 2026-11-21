import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { buildImageUrl, getBlogPosts, subscribeNewsletter } from "../lib/api";
import { SkeletonBlock } from "../components/Skeleton";

export default function Blog() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [q, setQ] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    getBlogPosts()
      .then((data) => {
        if (ignore) return;
        setPosts(data.posts || []);
        setFeatured(data.featured || null);
      })
      .catch((error) => {
        if (!ignore) setMessage(error.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const filtered = useMemo(
    () =>
      posts.filter((post) =>
        [post.title, post.excerpt, post.category]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase())
      ),
    [posts, q]
  );

  const subscribe = async () => {
    try {
      const response = await subscribeNewsletter(email, "blog");
      setMessage(response.message);
      setEmail("");
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-8 md:px-6">
        <h1 className="text-3xl font-bold">The Stationery Journal</h1>
        <p className="mt-2 text-sm text-gray-500">
          Insights, guides, and inspiration for those who appreciate writing.
        </p>

        {message && (
          <p className="mt-4 rounded border border-[#C2863F] bg-[#FFF4CC] px-3 py-2 text-sm text-[#7a4d18]">
            {message}
          </p>
        )}

        {loading ? (
          <BlogSkeleton />
        ) : (
          <>
            {featured && (
              <section className="mt-6 grid overflow-hidden rounded-lg bg-[#FFF49C] shadow md:grid-cols-2">
                <div className="flex flex-col justify-center p-6">
                  <p className="text-xs font-semibold uppercase text-[#404C31]">Featured story</p>
                  <h2 className="mt-3 text-2xl font-bold">{featured.title}</h2>
                  <p className="mt-3 text-sm text-gray-700">{featured.excerpt}</p>
                  <button
                    onClick={() => navigate(`/blog/${featured.slug}`)}
                    className="mobile-touch-target mt-5 w-fit rounded bg-[#404C31] px-4 py-2 text-sm text-white"
                  >
                    Read article
                  </button>
                </div>
                <BlogMedia post={featured} className="h-64 w-full md:h-full" />
              </section>
            )}

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
              <section>
                <input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Search articles..."
                  className="mobile-touch-target w-full rounded border px-3 py-2 text-sm"
                />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {filtered.map((post) => (
                    <article key={post.id} className="overflow-hidden rounded-lg bg-white shadow">
                      <BlogMedia post={post} className="h-40 w-full" />
                      <div className="p-4">
                        <p className="text-xs text-[#C2863F]">{post.category || "Journal"}</p>
                        <h2 className="mt-2 font-semibold">{post.title}</h2>
                        <p className="mt-2 text-xs leading-5 text-gray-500">{post.excerpt}</p>
                        <button
                          onClick={() => navigate(`/blog/${post.slug}`)}
                          className="mobile-touch-target mt-3 text-xs font-semibold text-[#C2863F]"
                        >
                          Read full article
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                {!filtered.length && (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#E8DDBF] bg-[#FBF8F2] px-5 py-8 text-center">
                    <h2 className="text-lg font-semibold text-[#242414]">No articles available yet</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
                      New buying guides and stationery stories will appear here. You can browse products meanwhile.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate("/writing-essentials")}
                      className="mobile-touch-target mt-5 rounded-full bg-[#C2863F] px-5 py-3 text-sm font-semibold text-white"
                    >
                      Explore Products
                    </button>
                  </div>
                )}
              </section>

              <aside className="h-fit rounded-lg bg-[#FFF4CC] p-5">
                <h2 className="font-semibold">Inked In.</h2>
                <p className="mt-2 text-xs leading-5 text-gray-600">
                  Get new articles and offers in your inbox.
                </p>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Your email address"
                  className="mobile-touch-target mt-4 w-full rounded border px-3 py-2 text-sm"
                />
                <button
                  onClick={subscribe}
                  className="mobile-touch-target mt-2 w-full rounded bg-[#C2863F] px-3 py-2 text-sm text-white"
                >
                  Subscribe
                </button>
              </aside>
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

function BlogSkeleton() {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
      <section className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-lg bg-white p-3 shadow-sm">
            <SkeletonBlock className="h-40 w-full" />
            <SkeletonBlock className="mt-4 h-4 w-2/3" />
            <SkeletonBlock className="mt-3 h-3 w-full" />
            <SkeletonBlock className="mt-2 h-3 w-4/5" />
          </div>
        ))}
      </section>
      <SkeletonBlock className="h-48" />
    </div>
  );
}

function BlogMedia({ post, className }) {
  const isVideo = post.featured_media_type === "video";
  const source = isVideo ? post.video_poster : post.cover_image;
  const alt = post.cover_image_alt || post.video_poster_alt || post.meta_title || post.title || "Golden Creation blog image";

  return (
    <div className={`relative bg-gray-100 ${className}`}>
      {source ? (
        <img src={buildImageUrl(source)} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-gray-100" />
      )}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 pl-0.5 text-xl text-[#404C31]" aria-hidden="true">
            ▶
          </span>
        </div>
      )}
    </div>
  );
}
