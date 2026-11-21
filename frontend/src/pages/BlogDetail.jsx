import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import { buildImageUrl, getBlogPost } from "../lib/api";
import { SkeletonBlock } from "../components/Skeleton";

export default function BlogDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    getBlogPost(slug)
      .then((payload) => {
        if (!ignore) setPost(payload);
      })
      .catch((error) => {
        if (!ignore) setMessage(error.message || "Unable to load this article.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [slug]);

  const imageAlt = post?.cover_image_alt || post?.meta_title || post?.title || "Golden Creation blog image";
  const hasHtmlContent = /<\/?[a-z][\s\S]*>/i.test(post?.content || "");
  const plainHtml = String(post?.content || "")
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-[70vh] max-w-4xl px-4 py-8 md:px-6">
        {loading ? (
          <ArticleSkeleton />
        ) : post ? (
          <article>
            <p className="text-xs font-semibold uppercase text-[#C2863F]">{post.category || "Journal"}</p>
            <h1 className="mt-3 text-3xl font-bold">{post.title}</h1>
            <p className="mt-3 text-sm text-gray-500">{post.excerpt}</p>
            {post.featured_media_type === "video" && post.featured_video_url ? (
              <video
                src={post.featured_video_url}
                poster={post.video_poster ? buildImageUrl(post.video_poster) : undefined}
                controls
                preload="metadata"
                className="mt-6 max-h-[520px] w-full rounded-lg bg-black"
              />
            ) : (
              post.cover_image && (
                <img
                  src={buildImageUrl(post.cover_image)}
                  alt={imageAlt}
                  className="mt-6 max-h-[480px] w-full rounded-lg object-cover"
                />
              )
            )}
            <div
              className="blog-content mt-6 text-sm leading-7 text-gray-700"
              dangerouslySetInnerHTML={{ __html: hasHtmlContent ? post.content : plainHtml }}
            />
            {post.media_gallery?.length > 0 && (
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {post.media_gallery.map((url, index) => (
                  <img
                    key={url}
                    src={buildImageUrl(url)}
                    alt={`${post.title} gallery image ${index + 1}`}
                    className="w-full rounded-lg object-cover"
                  />
                ))}
              </div>
            )}
          </article>
        ) : (
          <div className="rounded-2xl border border-[#E8DDBF] bg-[#FFF9C9] px-5 py-8 text-center">
            <h1 className="text-2xl font-bold text-[#242414]">Article not available</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#5F5A44]">
              {message || "This article may have moved or is no longer published."}
            </p>
            <button
              type="button"
              onClick={() => navigate("/blog")}
              className="mobile-touch-target mt-5 rounded-full bg-[#C2863F] px-5 py-3 text-sm font-semibold text-white"
            >
              Back to Blog
            </button>
          </div>
        )}
      </main>
      <Footer />
      <style>{`.blog-content h2{margin:1.5rem 0 .5rem;font-size:1.45rem;font-weight:700;color:#242414}.blog-content h3{margin:1.25rem 0 .5rem;font-size:1.15rem;font-weight:700;color:#242414}.blog-content p{margin:.8rem 0}.blog-content ul,.blog-content ol{margin:.8rem 0 .8rem 1.25rem}.blog-content ul{list-style:disc}.blog-content ol{list-style:decimal}.blog-content blockquote{border-left:3px solid #C2863F;margin:1rem 0;padding:.5rem 1rem;background:#FBF8F2}.blog-content table{width:100%;border-collapse:collapse;margin:1rem 0;display:block;overflow-x:auto}.blog-content th,.blog-content td{border:1px solid #e5e7eb;padding:.6rem;text-align:left}.blog-content img{max-width:100%;height:auto;border-radius:.75rem;margin:1rem 0}`}</style>
    </>
  );
}

function ArticleSkeleton() {
  return (
    <div aria-busy="true">
      <SkeletonBlock className="h-4 w-28" />
      <SkeletonBlock className="mt-4 h-10 w-5/6" />
      <SkeletonBlock className="mt-3 h-4 w-full" />
      <SkeletonBlock className="mt-6 aspect-video w-full" />
      <div className="mt-8 space-y-3">
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-4/5" />
      </div>
    </div>
  );
}
