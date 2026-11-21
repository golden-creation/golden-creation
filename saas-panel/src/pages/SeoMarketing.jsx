import React, { useEffect, useMemo, useState } from "react";
import RemoteLookup from "../components/RemoteLookup";
import {
  deleteSeoScript,
  getBlogSeo,
  getMediaSeo,
  getProductSeo,
  getSeoAudit,
  getSeoFeedStatus,
  getSeoScripts,
  getSeoSettings,
  saveSeoScript,
  updateBlogSeo,
  updateMediaSeo,
  updateProductSeo,
  updateSeoSettings,
} from "../lib/adminApi";

const scriptSlots = [
  "global_head",
  "body_start",
  "home",
  "product",
  "category",
  "collection",
  "brand",
  "blog",
  "checkout",
  "order_success",
];

const emptyScript = {
  id: null,
  name: "",
  slot: "global_head",
  content: "",
  status: "Active",
};

const settingFields = [
  ["site_title", "Site title"],
  ["default_meta_title", "Default meta title"],
  ["default_meta_description", "Default meta description"],
  ["canonical_base_url", "Canonical base URL"],
  ["default_social_image", "Default social image"],
  ["search_console_verification", "Search Console verification"],
  ["gtm_container_id", "GTM container ID"],
  ["ga4_measurement_id", "GA4 measurement ID"],
  ["google_ads_conversion_id", "Google Ads conversion ID"],
  ["google_ads_purchase_label", "Google Ads purchase label"],
  ["google_merchant_center_id", "Merchant Center ID"],
  ["meta_pixel_id", "Meta Pixel ID"],
  ["meta_capi_dataset_id", "Meta CAPI dataset ID"],
  ["meta_catalog_id", "Meta catalog ID"],
];

function SeoMarketing() {
  const [settings, setSettings] = useState({});
  const [scripts, setScripts] = useState([]);
  const [scriptDraft, setScriptDraft] = useState(emptyScript);
  const [audit, setAudit] = useState(null);
  const [feedStatus, setFeedStatus] = useState(null);
  const [productLookup, setProductLookup] = useState(null);
  const [productSeo, setProductSeo] = useState(null);
  const [blogId, setBlogId] = useState("");
  const [blogSeo, setBlogSeo] = useState(null);
  const [mediaId, setMediaId] = useState("");
  const [mediaDraft, setMediaDraft] = useState({
    altText: "",
    titleText: "",
    caption: "",
    description: "",
    seoFilename: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const publicBase = useMemo(
    () => String(settings.canonical_base_url || "https://goldencreation.in").replace(/\/$/, ""),
    [settings.canonical_base_url]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [settingsPayload, scriptsPayload, auditPayload, feedPayload] = await Promise.all([
        getSeoSettings(),
        getSeoScripts(),
        getSeoAudit(),
        getSeoFeedStatus(),
      ]);
      setSettings(settingsPayload.settings || {});
      setScripts(scriptsPayload.scripts || []);
      setAudit(auditPayload.audit || null);
      setFeedStatus(feedPayload.feedStatus || null);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Unable to load SEO settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const patchSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = async () => {
    try {
      await updateSeoSettings(settings);
      setMessage("SEO settings saved.");
      load();
    } catch (error) {
      setMessage(error.message || "Unable to save SEO settings.");
    }
  };

  const editScript = (script) => {
    setScriptDraft({
      id: script.id,
      name: script.name || "",
      slot: script.slot || "global_head",
      content: script.content || "",
      status: script.status || "Active",
    });
  };

  const submitScript = async () => {
    try {
      await saveSeoScript(scriptDraft);
      setScriptDraft(emptyScript);
      setMessage("SEO script saved.");
      load();
    } catch (error) {
      setMessage(error.message || "Unable to save script.");
    }
  };

  const removeScript = async (id) => {
    if (!window.confirm("Delete this SEO script?")) return;
    try {
      await deleteSeoScript(id);
      setMessage("SEO script deleted.");
      load();
    } catch (error) {
      setMessage(error.message || "Unable to delete script.");
    }
  };

  const loadProductSeo = async (option) => {
    setProductLookup(option);
    setProductSeo(null);
    if (!option?.id) return;
    try {
      const payload = await getProductSeo(option.id);
      setProductSeo(payload.product || null);
    } catch (error) {
      setMessage(error.message || "Unable to load product SEO.");
    }
  };

  const saveProductSeo = async () => {
    if (!productSeo?.id) return;
    try {
      await updateProductSeo(productSeo.id, {
        ...productSeo,
        images: productSeo.images || [],
      });
      setMessage("Product SEO saved.");
      loadProductSeo(productLookup);
    } catch (error) {
      setMessage(error.message || "Unable to save product SEO.");
    }
  };

  const loadBlogSeo = async () => {
    if (!blogId) return;
    try {
      const payload = await getBlogSeo(blogId);
      setBlogSeo(payload.blog || null);
    } catch (error) {
      setMessage(error.message || "Unable to load blog SEO.");
    }
  };

  const saveBlogSeo = async () => {
    if (!blogSeo?.id) return;
    try {
      await updateBlogSeo(blogSeo.id, blogSeo);
      setMessage("Blog SEO saved.");
      loadBlogSeo();
    } catch (error) {
      setMessage(error.message || "Unable to save blog SEO.");
    }
  };

  const saveMediaSeo = async () => {
    if (!mediaId) return;
    try {
      await updateMediaSeo(mediaId, mediaDraft);
      setMessage("Media SEO saved.");
    } catch (error) {
      setMessage(error.message || "Unable to save media SEO.");
    }
  };

  const loadMediaSeo = async () => {
    if (!mediaId) return;
    try {
      const payload = await getMediaSeo(mediaId);
      const media = payload.media || {};
      setMediaDraft({
        altText: media.alt_text || media.altText || "",
        titleText: media.title_text || media.titleText || "",
        caption: media.caption || "",
        description: media.description || "",
        seoFilename: media.seo_filename || media.seoFilename || "",
      });
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Unable to load media SEO.");
    }
  };

  return (
    <main className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">SEO & Marketing</h1>
          <p className="text-sm text-gray-500">Manage storefront metadata, feeds, scripts, and image SEO fields.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <a className="rounded border bg-white px-3 py-2" href={`${publicBase}/sitemap.xml`} target="_blank" rel="noreferrer">Sitemap</a>
          <a className="rounded border bg-white px-3 py-2" href={`${publicBase}/feeds/google-merchant.xml`} target="_blank" rel="noreferrer">Google feed</a>
          <a className="rounded border bg-white px-3 py-2" href={`${publicBase}/feeds/meta-catalog.csv`} target="_blank" rel="noreferrer">Meta feed</a>
        </div>
      </div>

      {message && <p className="mt-4 rounded border bg-white px-4 py-3 text-sm text-[#7A4D18]">{message}</p>}
      {loading ? <p className="mt-5 text-sm text-gray-500">Loading SEO workspace...</p> : null}

      <section className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Global SEO Settings">
          <div className="grid gap-3 md:grid-cols-2">
            {settingFields.map(([key, label]) => (
              <Field key={key} label={label} value={settings[key] || ""} onChange={(value) => patchSetting(key, value)} />
            ))}
            <label className="flex items-center gap-3 rounded border bg-[#FBF8F2] px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={["true", "1", "yes"].includes(String(settings.allow_ai_crawlers ?? "true").toLowerCase())}
                onChange={(event) => patchSetting("allow_ai_crawlers", event.target.checked ? 1 : 0)}
              />
              Allow GPTBot, OAI-SearchBot, and ChatGPT-User in robots.txt
            </label>
          </div>
          <button onClick={saveSettings} className="mt-4 rounded bg-[#A68B5B] px-4 py-2 text-sm font-semibold text-white">Save settings</button>
        </Panel>

        <Panel title="SEO Audit">
          <Stat label="Products missing meta" value={audit?.productsMissingMeta ?? "-"} />
          <Stat label="Products missing image alt" value={audit?.productImagesMissingAlt ?? "-"} />
          <Stat label="Blogs missing meta" value={audit?.blogsMissingMeta ?? "-"} />
          <Stat label="Media assets missing alt" value={audit?.mediaMissingAlt ?? "-"} />
          <div className="mt-4 rounded border bg-[#FBF8F2] p-3 text-xs text-gray-600">
            <p>Google Merchant feed: {feedStatus?.feeds?.googleMerchant || `${publicBase}/feeds/google-merchant.xml`}</p>
            <p className="mt-1">Meta catalog feed: {feedStatus?.feeds?.metaCatalog || `${publicBase}/feeds/meta-catalog.csv`}</p>
            <p className="mt-1">Active feed products: {feedStatus?.counts?.activeProducts ?? "-"}</p>
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Header And Body Scripts">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name" value={scriptDraft.name} onChange={(value) => setScriptDraft({ ...scriptDraft, name: value })} />
            <label className="text-sm">
              <span className="font-medium">Slot</span>
              <select value={scriptDraft.slot} onChange={(event) => setScriptDraft({ ...scriptDraft, slot: event.target.value })} className="mt-1 w-full rounded border px-3 py-2 text-sm">
                {scriptSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium">Status</span>
              <select value={scriptDraft.status} onChange={(event) => setScriptDraft({ ...scriptDraft, status: event.target.value })} className="mt-1 w-full rounded border px-3 py-2 text-sm">
                <option>Active</option>
                <option>Paused</option>
              </select>
            </label>
          </div>
          <Textarea label="Script / meta tag" rows={8} value={scriptDraft.content} onChange={(value) => setScriptDraft({ ...scriptDraft, content: value })} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={submitScript} className="rounded bg-black px-4 py-2 text-sm text-white">Save script</button>
            <button onClick={() => setScriptDraft(emptyScript)} className="rounded border px-4 py-2 text-sm">Clear</button>
          </div>
        </Panel>

        <Panel title="Saved Scripts">
          <div className="space-y-2">
            {scripts.map((script) => (
              <div key={script.id} className="rounded border p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold">{script.name}</p>
                    <p className="text-xs text-gray-500">{script.slot} - {script.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => editScript(script)} className="rounded border px-3 py-1 text-xs">Edit</button>
                    <button onClick={() => removeScript(script.id)} className="rounded border border-red-200 px-3 py-1 text-xs text-red-600">Delete</button>
                  </div>
                </div>
                <pre className="mt-2 max-h-20 overflow-auto rounded bg-gray-50 p-2 text-[11px]">{script.content}</pre>
              </div>
            ))}
            {!scripts.length && <p className="text-sm text-gray-500">No custom scripts saved.</p>}
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-3">
        <Panel title="Product SEO Quick Editor">
          <RemoteLookup type="products" catalog="website" value={productLookup} onChange={loadProductSeo} placeholder="Search product..." />
          {productSeo && (
            <div className="mt-4 space-y-3">
              <SeoFields value={productSeo} onChange={setProductSeo} />
              <div className="rounded border bg-[#FBF8F2] p-3">
                <p className="text-sm font-semibold">Image alt text</p>
                {(productSeo.images || []).map((image, index) => (
                  <div key={image.id || image.url || index} className="mt-2 grid gap-2 md:grid-cols-[70px_1fr] md:items-center">
                    {image.url ? <img src={image.url} alt="" className="h-14 w-14 rounded object-contain" /> : <span className="text-xs text-gray-400">Image</span>}
                    <input
                      value={image.altText || ""}
                      onChange={(event) => {
                        const nextImages = [...(productSeo.images || [])];
                        nextImages[index] = { ...image, altText: event.target.value };
                        setProductSeo({ ...productSeo, images: nextImages });
                      }}
                      className="rounded border px-3 py-2 text-sm"
                      placeholder="Describe this image"
                    />
                  </div>
                ))}
              </div>
              <button onClick={saveProductSeo} className="rounded bg-[#A68B5B] px-4 py-2 text-sm font-semibold text-white">Save product SEO</button>
            </div>
          )}
        </Panel>

        <Panel title="Blog SEO Quick Editor">
          <div className="flex gap-2">
            <input value={blogId} onChange={(event) => setBlogId(event.target.value)} className="w-full rounded border px-3 py-2 text-sm" placeholder="Blog ID" />
            <button onClick={loadBlogSeo} className="rounded bg-black px-4 py-2 text-sm text-white">Load</button>
          </div>
          {blogSeo && (
            <div className="mt-4 space-y-3">
              <SeoFields value={blogSeo} onChange={setBlogSeo} includeAuthor />
              <button onClick={saveBlogSeo} className="rounded bg-[#A68B5B] px-4 py-2 text-sm font-semibold text-white">Save blog SEO</button>
            </div>
          )}
        </Panel>

        <Panel title="Media SEO Quick Editor">
          <div className="flex gap-2">
            <div className="flex-1"><Field label="Media asset ID or storage key" value={mediaId} onChange={setMediaId} /></div>
            <button onClick={loadMediaSeo} className="mt-6 rounded bg-black px-4 py-2 text-sm text-white">Load</button>
          </div>
          <Field label="Alt text" value={mediaDraft.altText} onChange={(value) => setMediaDraft({ ...mediaDraft, altText: value })} />
          <Field label="Title text" value={mediaDraft.titleText} onChange={(value) => setMediaDraft({ ...mediaDraft, titleText: value })} />
          <Field label="Caption" value={mediaDraft.caption} onChange={(value) => setMediaDraft({ ...mediaDraft, caption: value })} />
          <Field label="SEO filename" value={mediaDraft.seoFilename} onChange={(value) => setMediaDraft({ ...mediaDraft, seoFilename: value })} />
          <Textarea label="Description" rows={4} value={mediaDraft.description} onChange={(value) => setMediaDraft({ ...mediaDraft, description: value })} />
          <button onClick={saveMediaSeo} className="mt-3 rounded bg-[#A68B5B] px-4 py-2 text-sm font-semibold text-white">Save media SEO</button>
        </Panel>
      </section>
    </main>
  );
}

function SeoFields({ value, onChange, includeAuthor = false }) {
  const patch = (key, nextValue) => onChange({ ...value, [key]: nextValue });
  return (
    <>
      {"name" in value && <Field label="Name" value={value.name || ""} onChange={(nextValue) => patch("name", nextValue)} />}
      {"title" in value && <Field label="Title" value={value.title || ""} onChange={(nextValue) => patch("title", nextValue)} />}
      <Field label="Slug" value={value.slug || ""} onChange={(nextValue) => patch("slug", nextValue)} hint={`${String(value.slug || "").length}/140`} />
      <Field label="Meta title" value={value.metaTitle || value.meta_title || ""} onChange={(nextValue) => patch("metaTitle", nextValue)} hint={`${String(value.metaTitle || value.meta_title || "").length}/60`} />
      <Textarea label="Meta description" rows={3} value={value.metaDescription || value.meta_description || ""} onChange={(nextValue) => patch("metaDescription", nextValue)} hint={`${String(value.metaDescription || value.meta_description || "").length}/160`} />
      <Textarea label="SEO description" rows={4} value={value.seoDescription || value.seo_description || ""} onChange={(nextValue) => patch("seoDescription", nextValue)} />
      <Field label="Focus keyword" value={value.focusKeyword || value.focus_keyword || ""} onChange={(nextValue) => patch("focusKeyword", nextValue)} />
      <Field label="Search keywords" value={value.searchKeywords || value.search_keywords || ""} onChange={(nextValue) => patch("searchKeywords", nextValue)} />
      <Field label="Canonical URL" value={value.canonicalUrl || value.canonical_url || ""} onChange={(nextValue) => patch("canonicalUrl", nextValue)} />
      <Field label="Robots directive" value={value.robotsDirective || value.robots_directive || "index,follow"} onChange={(nextValue) => patch("robotsDirective", nextValue)} />
      <Field label="OG image" value={value.ogImage || value.og_image || ""} onChange={(nextValue) => patch("ogImage", nextValue)} />
      {includeAuthor && <Field label="Author" value={value.author || ""} onChange={(nextValue) => patch("author", nextValue)} />}
      <Textarea label="Schema override JSON" rows={4} value={value.schemaOverrideJson || value.schema_override_json || ""} onChange={(nextValue) => patch("schemaOverrideJson", nextValue)} />
    </>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text", hint = "" }) {
  return (
    <label className="block text-sm">
      <span className="flex items-center justify-between gap-3 font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-gray-400">{hint}</span>}
      </span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
    </label>
  );
}

function Textarea({ label, value, onChange, rows = 4, hint = "" }) {
  return (
    <label className="mt-3 block text-sm">
      <span className="flex items-center justify-between gap-3 font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-gray-400">{hint}</span>}
      </span>
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-mono" />
    </label>
  );
}

function Stat({ label, value }) {
  return (
    <div className="mb-3 rounded border bg-[#FBF8F2] p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

export default SeoMarketing;
