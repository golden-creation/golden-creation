import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import imageIcon from "../assets/image.png";
import uploadIcon from "../assets/upload.png";
import addIcon from "../assets/add.png";
import premiumIcon from "../assets/premium.png";
import downIcon from "../assets/down-chevron.png";
import closeIcon from "../assets/close.png";
import clockIcon from "../assets/clock.png";
import reportIcon from "../assets/report.png";
import {
  createAdminBlogPost,
  createAdminVideoUpload,
  deleteAdminMedia,
  updateAdminBlogPost,
  uploadAdminMedia,
} from "../lib/adminApi";

const AddNewBlog = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const editingBlog = location.state?.blog || {};
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removedMedia, setRemovedMedia] = useState([]);
  const [form, setForm] = useState({
    title: editingBlog.title || "",
    excerpt: editingBlog.excerpt || editingBlog.desc || editingBlog.description || "",
    content: editingBlog.content || editingBlog.desc || editingBlog.description || "",
    coverImage: editingBlog.cover_image || editingBlog.img || editingBlog.image || "",
    featuredMediaType: editingBlog.featured_media_type || "image",
    featuredVideoUrl: editingBlog.featured_video_url || "",
    videoPoster: editingBlog.video_poster || "",
    mediaGallery: Array.isArray(editingBlog.media_gallery) ? editingBlog.media_gallery : [],
    category: editingBlog.category || "Lifestyle & Wellness",
    tags: Array.isArray(editingBlog.tags) ? editingBlog.tags.join(", ") : editingBlog.tags || "",
    status: editingBlog.status || "Draft",
    metaTitle: editingBlog.meta_title || editingBlog.metaTitle || "",
    metaDescription: editingBlog.meta_description || editingBlog.metaDescription || "",
    canonicalUrl: editingBlog.canonical_url || editingBlog.canonicalUrl || "",
    robotsDirective: editingBlog.robots_directive || editingBlog.robotsDirective || "index,follow",
    ogImage: editingBlog.og_image || editingBlog.ogImage || "",
    focusKeyword: editingBlog.focus_keyword || editingBlog.focusKeyword || "",
    schemaOverrideJson: editingBlog.schema_override_json || editingBlog.schemaOverrideJson || "",
    author: editingBlog.author || "Golden Creation",
  });

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveBlog = async (status) => {
    if (!form.title.trim()) {
      setMessage("Blog title is required");
      return;
    }

    try {
      setSaving(true);
      setMessage("");
      const payload = {
        ...form,
        desc: form.excerpt,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        status,
        author: form.author || "Golden Creation",
      };
      if (editingBlog.id) await updateAdminBlogPost(editingBlog.id, payload);
      else await createAdminBlogPost(payload);
      await Promise.all(removedMedia.map((value) => deleteAdminMedia(value).catch(() => null)));
      setMessage(status === "Published" ? "Blog published" : "Draft saved");
      setTimeout(() => navigate("/blog-list"), 700);
    } catch (error) {
      setMessage(error.message || "Unable to save blog");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold">Add New Blog</h1>
          <p className="text-sm text-gray-500">Draft your next Golden Creation update</p>
          {message && <p className="text-sm text-[#8a5b16] mt-1">{message}</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 md:p-6 max-w-4xl mx-auto">
        <h2 className="text-sm font-semibold text-black mb-2">CORE CONTENT</h2>
        <div className="border-b mb-4"></div>

        <div className="mb-4">
          <p className="text-xs mb-1 text-black">Blog Title</p>
          <input
            value={form.title}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="Enter a captivating title..."
            className="w-full border rounded-lg p-3 text-sm outline-none focus:ring-1 focus:ring-[#A68B5BFF]"
          />
        </div>

        <div className="mb-2">
          <p className="text-xs mb-1 text-black">Description & Content</p>
          <div className="relative">
            <textarea
              value={form.excerpt}
              onChange={(event) => updateField("excerpt", event.target.value)}
              placeholder="Short excerpt shown in the blog list..."
              className="w-full border rounded-lg p-3 text-sm h-40 outline-none resize-none focus:ring-1 focus:ring-[#A68B5BFF]"
            />
            <span className="absolute bottom-2 right-3 text-[10px] text-black">
              {form.excerpt.length} / 5000 characters
            </span>
          </div>
        </div>
        <RichBlogEditor
          value={form.content}
          uploading={uploading}
          setUploading={setUploading}
          onChange={(value) => updateField("content", value)}
          onMessage={setMessage}
        />

        <div className="flex items-center gap-2 mt-6 mb-2">
          <img src={imageIcon} className="h-4" />
          <h2 className="text-sm font-semibold text-black">MEDIA ASSETS</h2>
        </div>
        <div className="border-b mb-4"></div>
        <div className="mb-4 flex rounded-lg border p-1">
          {["image", "video"].map((type) => <button key={type} type="button" onClick={() => updateField("featuredMediaType", type)} className={`flex-1 rounded px-3 py-2 text-sm capitalize ${form.featuredMediaType === type ? "bg-[#A68B5B] text-white" : ""}`}>{type}</button>)}
        </div>
        {form.featuredMediaType === "image" ? (
          <>
            <label className="block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center bg-[#FFFDF3]">
              <img src={uploadIcon} className="h-6 mx-auto mb-2" />
              <p className="text-sm font-medium">{uploading ? "Uploading..." : "Upload featured image"}</p>
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setUploading(true); try { const data = await uploadAdminMedia(file, "blog"); updateField("coverImage", data.url); } catch (error) { setMessage(error.message || "Unable to upload cover image"); } finally { setUploading(false); } }} />
            </label>
            {form.coverImage && <MediaPreview url={form.coverImage} type="image" onRemove={() => { setRemovedMedia((current) => [...current, form.coverImage]); updateField("coverImage", ""); }} />}
          </>
        ) : (
          <div className="space-y-3">
            <label className="block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center bg-[#FFFDF3]">
              <img src={uploadIcon} className="h-6 mx-auto mb-2" />
              <p className="text-sm font-medium">{uploading ? "Uploading video..." : "Upload MP4 or WebM video (max 100 MB)"}</p>
              <input type="file" accept="video/mp4,video/webm" className="hidden" disabled={uploading} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setUploading(true); try { const data = await createAdminVideoUpload(file, "blog-videos"); updateField("featuredVideoUrl", data.url); } catch (error) { setMessage(error.message || "Unable to upload video"); } finally { setUploading(false); } }} />
            </label>
            {form.featuredVideoUrl && <MediaPreview url={form.featuredVideoUrl} type="video" onRemove={() => { setRemovedMedia((current) => [...current, form.featuredVideoUrl]); updateField("featuredVideoUrl", ""); }} />}
            <label className="block text-xs">Video poster image<input type="file" accept="image/*" className="mt-1 block w-full rounded border p-2" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const data = await uploadAdminMedia(file, "blog-posters"); updateField("videoPoster", data.url); } catch (error) { setMessage(error.message); } }} /></label>
            {form.videoPoster && <MediaPreview url={form.videoPoster} type="image" onRemove={() => { setRemovedMedia((current) => [...current, form.videoPoster]); updateField("videoPoster", ""); }} />}
          </div>
        )}
        <div className="mt-5">
          <p className="mb-2 text-xs text-black">Optional media gallery</p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-xs"><img src={addIcon} className="h-4" /> Add images<input type="file" multiple accept="image/*" className="hidden" onChange={async (event) => { for (const file of Array.from(event.target.files || [])) { try { const data = await uploadAdminMedia(file, "blog-gallery"); setForm((current) => ({ ...current, mediaGallery: [...current.mediaGallery, data.url] })); } catch (error) { setMessage(error.message); } } }} /></label>
          <div className="mt-3 flex flex-wrap gap-3">{form.mediaGallery.map((url) => <MediaPreview key={url} url={url} type="image" compact onRemove={() => { setRemovedMedia((current) => [...current, url]); setForm((current) => ({ ...current, mediaGallery: current.mediaGallery.filter((item) => item !== url) })); }} />)}</div>
        </div>

        <div className="flex items-center gap-2 mt-6 mb-2">
          <img src={premiumIcon} className="h-4" />
          <h2 className="text-sm font-semibold text-black">ORGANIZATION</h2>
        </div>
        <div className="border-b mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs mb-1 text-black">Category</p>
            <div className="relative">
              <select
                value={form.category}
                onChange={(event) => updateField("category", event.target.value)}
                className="w-full border rounded-lg p-3 text-sm appearance-none bg-white"
              >
                {["Lifestyle & Wellness", "Tech", "Business", "Marketing", "Store"].map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <img src={downIcon} className="h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <div>
            <p className="text-xs mb-1 text-black">Tags</p>
            <input
              value={form.tags}
              onChange={(event) => updateField("tags", event.target.value)}
              placeholder="# add tags"
              className="w-full border rounded-lg p-3 text-sm mb-2 outline-none focus:ring-1 focus:ring-[#A68B5BFF]"
            />
            <div className="flex flex-wrap gap-2">
              {form.tags.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                <span key={tag} className="bg-gray-100 px-3 py-1 rounded-full flex items-center gap-2 text-xs">
                  {tag}
                  <img src={closeIcon} className="h-3 cursor-pointer" />
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-6 mb-2">
          <img src={reportIcon} className="h-4" />
          <h2 className="text-sm font-semibold text-black">SEO</h2>
        </div>
        <div className="border-b mb-4"></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SeoInput label="Meta Title" value={form.metaTitle} onChange={(value) => updateField("metaTitle", value)} hint={`${form.metaTitle.length}/60`} />
          <SeoInput label="Focus Keyword" value={form.focusKeyword} onChange={(value) => updateField("focusKeyword", value)} />
          <SeoTextarea label="Meta Description" value={form.metaDescription} onChange={(value) => updateField("metaDescription", value)} hint={`${form.metaDescription.length}/160`} />
          <SeoInput label="Canonical URL" value={form.canonicalUrl} onChange={(value) => updateField("canonicalUrl", value)} />
          <SeoInput label="OG Image" value={form.ogImage} onChange={(value) => updateField("ogImage", value)} />
          <SeoInput label="Author" value={form.author} onChange={(value) => updateField("author", value)} />
          <label className="text-xs text-black">
            Robots Directive
            <select value={form.robotsDirective} onChange={(event) => updateField("robotsDirective", event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm">
              <option value="index,follow">index,follow</option>
              <option value="noindex,follow">noindex,follow</option>
              <option value="noindex,nofollow">noindex,nofollow</option>
            </select>
          </label>
          <SeoTextarea label="Schema Override JSON" value={form.schemaOverrideJson} onChange={(value) => updateField("schemaOverrideJson", value)} />
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center mt-6 gap-4">
          <div className="flex items-center gap-2 text-xs text-black">
            <img src={clockIcon} className="h-4" />
            Draft saves through `/api/admin/blog`
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => navigate("/blog-list")} className="px-4 py-2 rounded-lg text-sm text-white bg-[#A68B5BFF] hover:bg-[#C2863FFF] w-full md:w-auto">
              Cancel
            </button>
            <button disabled={saving} onClick={() => saveBlog("Draft")} className="flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-lg text-white bg-[#A68B5BFF] hover:bg-[#C2863FFF] w-full md:w-auto disabled:opacity-60">
              <img src={reportIcon} className="h-4" />
              Save as Draft
            </button>
            <button disabled={saving} onClick={() => saveBlog("Published")} className="px-5 py-2 rounded-lg text-white text-sm bg-[#A68B5BFF] hover:bg-[#C2863FFF] w-full md:w-auto disabled:opacity-60">
              Publish Blog
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddNewBlog;

function RichBlogEditor({ value, onChange, onMessage, uploading, setUploading }) {
  const editorRef = useRef(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    if (editor.innerHTML !== (value || "")) editor.innerHTML = value || "";
  }, [value]);

  const sync = () => onChange(editorRef.current?.innerHTML || "");
  const runCommand = (command, argument = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    sync();
  };
  const insertHtml = (html) => {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    sync();
  };
  const insertLink = () => {
    const url = window.prompt("Enter link URL");
    if (url) runCommand("createLink", url);
  };
  const insertTable = () => {
    insertHtml(
      '<table style="width:100%;border-collapse:collapse;margin:16px 0"><tbody><tr><th style="border:1px solid #ddd;padding:8px;text-align:left">Heading</th><th style="border:1px solid #ddd;padding:8px;text-align:left">Heading</th></tr><tr><td style="border:1px solid #ddd;padding:8px">Text</td><td style="border:1px solid #ddd;padding:8px">Text</td></tr></tbody></table><p><br></p>'
    );
  };
  const uploadInlineImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const data = await uploadAdminMedia(file, "blog-inline");
      insertHtml(`<figure><img src="${data.url}" alt="" style="max-width:100%;border-radius:12px;margin:16px 0" /></figure><p><br></p>`);
    } catch (error) {
      onMessage(error.message || "Unable to upload inline image");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const buttonClass = "rounded border bg-white px-3 py-1.5 text-xs hover:border-[#A68B5B]";

  return (
    <div className="mb-4">
      <p className="text-xs mb-1 text-black">Article Content</p>
      <div className="rounded-lg border bg-[#FBF8F2] p-2">
        <div className="mb-2 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => runCommand("formatBlock", "h2")}>H2</button>
          <button type="button" className={buttonClass} onClick={() => runCommand("formatBlock", "h3")}>H3</button>
          <button type="button" className={buttonClass} onClick={() => runCommand("bold")}>Bold</button>
          <button type="button" className={buttonClass} onClick={() => runCommand("italic")}>Italic</button>
          <button type="button" className={buttonClass} onClick={() => runCommand("insertUnorderedList")}>Bullets</button>
          <button type="button" className={buttonClass} onClick={() => runCommand("insertOrderedList")}>Numbers</button>
          <button type="button" className={buttonClass} onClick={() => runCommand("formatBlock", "blockquote")}>Quote</button>
          <button type="button" className={buttonClass} onClick={insertLink}>Link</button>
          <button type="button" className={buttonClass} onClick={insertTable}>Table</button>
          <label className={`${buttonClass} cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            Image
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={uploadInlineImage} />
          </label>
          <button type="button" className={buttonClass} onClick={() => runCommand("removeFormat")}>Clear</button>
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          className="prose prose-sm min-h-72 max-w-none rounded bg-white p-4 outline-none focus:ring-1 focus:ring-[#A68B5B]"
          data-placeholder="Write the full article..."
        />
      </div>
      <p className="mt-1 text-[11px] text-gray-400">Supports headings, formatting, lists, tables, links, and images between paragraphs.</p>
    </div>
  );
}

function MediaPreview({ url, type, onRemove, compact = false }) {
  return <div className="relative mt-3 w-fit">{type === "video" ? <video src={url} controls preload="metadata" className="max-h-64 max-w-full rounded" /> : <img src={url} className={`${compact ? "h-20 w-28" : "h-28 w-48"} rounded object-cover`} />}<button type="button" onClick={onRemove} title="Remove media" className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow"><img src={closeIcon} className="h-3 w-3" /></button></div>;
}

function SeoInput({ label, value, onChange, hint = "" }) {
  return (
    <label className="text-xs text-black">
      <span className="flex justify-between gap-2">
        {label}
        {hint && <span className="text-gray-400">{hint}</span>}
      </span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border p-3 text-sm" />
    </label>
  );
}

function SeoTextarea({ label, value, onChange, hint = "" }) {
  return (
    <label className="text-xs text-black md:col-span-2">
      <span className="flex justify-between gap-2">
        {label}
        {hint && <span className="text-gray-400">{hint}</span>}
      </span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border p-3 text-sm" />
    </label>
  );
}
