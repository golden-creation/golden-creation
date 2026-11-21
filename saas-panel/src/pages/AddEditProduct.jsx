import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import closeIcon from "../assets/close.png";
import reportIcon from "../assets/report.png";
import infoIcon from "../assets/information (2).png";
import tagIcon from "../assets/tag.png";
import boxIcon from "../assets/box.png";
import cameraIcon from "../assets/camra.png";
import uploadIcon from "../assets/upload.png";
import clockIcon from "../assets/clock (1).png";
import addIcon from "../assets/add.png";
import chainIcon from "../assets/chain.png";
import { apiRequest, getAssetUrl } from "../lib/api";
import {
  createAdminTag,
  deleteAdminMedia,
  getAdminTags,
  uploadAdminMedia,
} from "../lib/adminApi";
import ProductVariantEditor, {
  normalizeVariantEditorState,
  prepareVariantOptions,
  prepareVariants,
} from "../components/ProductVariantEditor";
import RemoteLookup from "../components/RemoteLookup";
import ConfirmDialog from "../components/ConfirmDialog";

const defaultForm = {
  id: "",
  name: "",
  description: "",
  category_id: "",
  brand_id: "",
  price: "",
  discountPrice: "",
  tax: "",
  sku: "",
  stock: "",
  lowStockLimit: 5,
  barcode: "",
  weight: "",
  weight_unit: "g",
  length: "",
  breadth: "",
  height: "",
  dimension_unit: "cm",
  gst_inclusive: true,
  image: "",
  slug: "",
  meta_title: "",
  meta_description: "",
  seo_description: "",
  focus_keyword: "",
  search_keywords: "",
  canonical_url: "",
  robots_directive: "index,follow",
  og_image: "",
};

function parseJson(value, fallbackValue = null) {
  if (!value) return fallbackValue;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

const AddEditProduct = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const product = location.state?.product || {};

  const [lowStock, setLowStock] = useState(true);
  const [active, setActive] = useState((product.status || "Active") !== "Inactive");
  const [category, setCategory] = useState(product.category_id ? { id: product.category_id, label: product.category_name || "Selected category" } : null);
  const [brand, setBrand] = useState(product.brand_id ? { id: product.brand_id, label: product.brand_name || "Selected brand" } : null);
  const [tags, setTags] = useState([]);
  const [tagSearch, setTagSearch] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const initialVariantState = normalizeVariantEditorState(product);
  const initialDimensions = parseJson(product.dimensions, {});
  const [hasVariants, setHasVariants] = useState(initialVariantState.enabled);
  const [variantOptions, setVariantOptions] = useState(initialVariantState.options);
  const [variants, setVariants] = useState(initialVariantState.variants);
  const [form, setForm] = useState({
    ...defaultForm,
    ...product,
    category_id: product.category_id || product.categoryId || "",
    brand_id: product.brand_id || product.brandId || "",
    barcode: product.barcode || "",
    weight: product.weight || "",
    weight_unit: product.weight_unit || product.weightUnit || "g",
    length: initialDimensions?.length || "",
    breadth: initialDimensions?.breadth || initialDimensions?.width || "",
    height: initialDimensions?.height || "",
    dimension_unit: initialDimensions?.unit || "cm",
    image: product.image || "",
    gst_inclusive:
      product.gst_inclusive === undefined && product.gstInclusive === undefined
        ? true
        : Boolean(Number(product.gst_inclusive ?? product.gstInclusive)),
    slug: product.slug || "",
    meta_title: product.meta_title || product.metaTitle || "",
    meta_description: product.meta_description || product.metaDescription || "",
    seo_description: product.seo_description || product.seoDescription || "",
    focus_keyword: product.focus_keyword || product.focusKeyword || "",
    search_keywords: product.search_keywords || product.searchKeywords || "",
    canonical_url: product.canonical_url || product.canonicalUrl || "",
    robots_directive: product.robots_directive || product.robotsDirective || "index,follow",
    og_image: product.og_image || product.ogImage || "",
  });
  const [images, setImages] = useState(
    (Array.isArray(product.imagesDetailed || product.images_detailed) && (product.imagesDetailed || product.images_detailed).length
      ? (product.imagesDetailed || product.images_detailed).map((image) => ({
          id: image.id || null,
          url: image.url || image.image_url || "",
          key: image.storageKey || image.storage_key || "",
          altText: image.altText || image.alt_text || "",
          titleText: image.titleText || image.title_text || "",
          isNew: false,
        }))
      : [product.image, ...String(product.images || "").split(",")]
          .map((value) => String(value || "").trim())
          .filter((value, index, values) => value && values.indexOf(value) === index)
          .map((url) => ({ url, key: "", altText: product.name || "", titleText: product.name || "", isNew: false })))
  );
  const [removedImages, setRemovedImages] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getAdminTags({ status: "Active", limit: 100 })
      .then((data) => setTags(data.tags || []))
      .catch(() => setTags([]));
  }, []);

  useEffect(() => {
    if (!form.id) return;

    apiRequest(`/products/${form.id}`)
      .then((payload) => {
        const variantState = normalizeVariantEditorState(payload);
        setHasVariants(variantState.enabled);
        setVariantOptions(variantState.options);
        setVariants(variantState.variants);
        setForm((current) => ({
          ...current,
          slug: payload.slug || current.slug,
          meta_title: payload.meta_title || payload.metaTitle || current.meta_title,
          meta_description: payload.meta_description || payload.metaDescription || current.meta_description,
          seo_description: payload.seo_description || payload.seoDescription || current.seo_description,
          focus_keyword: payload.focus_keyword || payload.focusKeyword || current.focus_keyword,
          search_keywords: payload.search_keywords || payload.searchKeywords || current.search_keywords,
          canonical_url: payload.canonical_url || payload.canonicalUrl || current.canonical_url,
          robots_directive: payload.robots_directive || payload.robotsDirective || current.robots_directive,
          og_image: payload.og_image || payload.ogImage || current.og_image,
        }));
        if (Array.isArray(payload.imagesDetailed) && payload.imagesDetailed.length) {
          setImages(
            payload.imagesDetailed.map((image) => ({
              id: image.id || null,
              url: image.url || "",
              key: image.storageKey || "",
              altText: image.altText || payload.name || "",
              titleText: image.titleText || payload.name || "",
              isNew: false,
            }))
          );
        }
      })
      .catch(() => {});
  }, [form.id]);

  const filteredTags = tags.filter((tag) =>
    `${tag.name} ${tag.slug}`.toLowerCase().includes(tagSearch.toLowerCase())
  );

  useEffect(() => {
    const productTagSlugs = String(product.tag_slugs || product.tagSlugs || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!productTagSlugs.length || !tags.length || selectedTagIds.length) return;

    setSelectedTagIds(
      tags
        .filter((tag) => productTagSlugs.includes(tag.slug))
        .map((tag) => tag.id)
    );
  }, [tags, product, selectedTagIds.length]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => /^image\//i.test(file.type));
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const media = await uploadAdminMedia(file, "products");
        setImages((current) => [...current, { ...media, altText: form.name, titleText: form.name, isNew: true }]);
      }
      showToast("Product media uploaded");
    } catch (error) {
      showToast(error.message || "Unable to upload product media");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const removeImage = async (index) => {
    const media = images[index];
    setImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
    if (media?.isNew && media.key) {
      await deleteAdminMedia(media.key).catch(() => {});
    } else if (media?.url) {
      setRemovedImages((current) => [...current, media.url]);
    }
  };

  const setPrimaryImage = (index) => {
    setImages((current) => {
      const next = [...current];
      const [selected] = next.splice(index, 1);
      return [selected, ...next];
    });
  };

  const createInlineTag = async () => {
    const name = tagSearch.trim();
    if (!name) return;

    try {
      const response = await createAdminTag({ name, status: "Active" });
      const tag = response.tag;
      setTags((current) => [...current, tag]);
      setSelectedTagIds((current) => [...new Set([...current, tag.id])]);
      setTagSearch("");
      showToast("Tag created");
    } catch (error) {
      showToast(error.message || "Unable to create tag");
    }
  };

  const handleSave = async () => {
    setConfirmSave(false);
    if (!form.id) {
      showToast("Open a product from Product Management before editing");
      return;
    }

    if (!form.name || !form.price || !form.category_id) {
      showToast("Name, price and category are required");
      return;
    }

    try {
      setSaving(true);
      await apiRequest(`/products/${form.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          price: form.price,
          slug: form.slug,
          metaTitle: form.meta_title,
          metaDescription: form.meta_description,
          seoDescription: form.seo_description,
          focusKeyword: form.focus_keyword,
          searchKeywords: form.search_keywords,
          canonicalUrl: form.canonical_url,
          robotsDirective: form.robots_directive,
          ogImage: form.og_image,
          image: images[0]?.url || "",
          images: images.map((media, index) => ({
            id: media.id,
            url: media.url,
            key: media.key,
            altText: media.altText || form.name,
            titleText: media.titleText || form.name,
            sortOrder: index + 1,
          })),
          category_id: form.category_id,
          brand_id: form.brand_id || null,
          sku: form.sku,
          stock_quantity: form.stock || form.stock_quantity,
          reorder_level: form.lowStockLimit,
          status: active ? "Active" : "Inactive",
          barcode: form.barcode,
          weight: form.weight,
          weight_unit: form.weight_unit,
          dimensions:
            form.length || form.breadth || form.height
              ? {
                  length: Number(form.length) || null,
                  breadth: Number(form.breadth) || null,
                  height: Number(form.height) || null,
                  unit: form.dimension_unit || "cm",
                }
              : null,
          gst_inclusive: form.gst_inclusive,
          tagIds: selectedTagIds,
          hasVariants,
          variantOptions: hasVariants ? prepareVariantOptions(variantOptions) : [],
          variants: hasVariants ? prepareVariants(variants) : [],
        }),
      });
      await Promise.all(
        removedImages.map((url) => deleteAdminMedia(url).catch(() => null))
      );
      showToast("Product updated successfully");
      setTimeout(() => navigate("/product"), 700);
    } catch (error) {
      showToast(error.message || "Unable to update product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FFFFFF_0%,#FFF49CFF_100%)] p-4 md:p-8">
      <ConfirmDialog
        open={confirmSave}
        title="Save product changes?"
        message={`Apply changes to ${form.name || "this product"}?`}
        confirmLabel="YES"
        onConfirm={handleSave}
        onDiscard={() => setConfirmSave(false)}
      />
      {toast && <div className="fixed top-5 right-5 bg-black text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">{toast}</div>}
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
          <h1 className="text-lg md:text-xl font-semibold">Edit Product</h1>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate("/product")} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm bg-white">
              <img src={closeIcon} className="h-4" />
              Cancel
            </button>
            <button onClick={() => setConfirmSave(true)} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-[#A68B5BFF] text-white rounded-lg text-sm shadow disabled:opacity-60">
              <img src={reportIcon} className="h-4" />
              {saving ? "Saving..." : "Save Product"}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow border p-4 md:p-6">
          <SectionHeader icon={infoIcon} title="Basic Information" description="General information about the product shown to customers." />
          <div className="mb-4">
            <label className="text-sm font-medium">Product Name <span className="text-red-500">*</span></label>
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} className="border rounded-lg p-2.5 text-sm w-full mt-1 outline-none focus:ring-1 focus:ring-[#C2863FFF]" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium">Category <span className="text-red-500">*</span></label>
              <RemoteLookup type="categories" value={category} onChange={(option) => { setCategory(option); updateField("category_id", option?.id || ""); }} placeholder="Search category..." />
            </div>
            <div>
              <label className="text-sm font-medium">Brand</label>
              <RemoteLookup type="brands" value={brand} onChange={(option) => { setBrand(option); updateField("brand_id", option?.id || ""); }} placeholder="Search brand..." />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Product Description</label>
            <textarea value={form.description || ""} onChange={(event) => updateField("description", event.target.value)} rows={4} className="border rounded-lg p-2.5 text-sm w-full mt-1 resize-none" />
          </div>

          <div className="mt-6 rounded-xl border bg-[#FBF8F2] p-4">
            <SectionHeader icon={infoIcon} title="SEO" description="Search title, description, canonical URL, and crawl directive." />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SeoInput label="Slug" value={form.slug || ""} onChange={(value) => updateField("slug", value)} hint={`${String(form.slug || "").length}/140`} />
              <SeoInput label="Meta Title" value={form.meta_title || ""} onChange={(value) => updateField("meta_title", value)} hint={`${String(form.meta_title || "").length}/60`} />
              <SeoTextarea label="Meta Description" value={form.meta_description || ""} onChange={(value) => updateField("meta_description", value)} hint={`${String(form.meta_description || "").length}/160`} />
              <SeoTextarea label="SEO Description" value={form.seo_description || ""} onChange={(value) => updateField("seo_description", value)} />
              <SeoInput label="Focus Keyword" value={form.focus_keyword || ""} onChange={(value) => updateField("focus_keyword", value)} />
              <SeoInput label="Search Keywords" value={form.search_keywords || ""} onChange={(value) => updateField("search_keywords", value)} />
              <SeoInput label="Canonical URL" value={form.canonical_url || ""} onChange={(value) => updateField("canonical_url", value)} />
              <SeoInput label="OG Image" value={form.og_image || ""} onChange={(value) => updateField("og_image", value)} />
              <label className="text-sm font-medium">
                Robots Directive
                <select value={form.robots_directive || "index,follow"} onChange={(event) => updateField("robots_directive", event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2.5 text-sm">
                  <option value="index,follow">index,follow</option>
                  <option value="noindex,follow">noindex,follow</option>
                  <option value="noindex,nofollow">noindex,nofollow</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium">Tags</label>
            <input value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="Search or create tag" className="border rounded-lg p-2.5 text-sm w-full mt-1" />
            <div className="mt-2 flex flex-wrap gap-2">
              {filteredTags.slice(0, 16).map((tag) => {
                const active = selectedTagIds.includes(tag.id);
                return (
                  <button key={tag.id} type="button" onClick={() => setSelectedTagIds((current) => active ? current.filter((id) => id !== tag.id) : [...current, tag.id])} className={`rounded-full border px-3 py-1 text-xs ${active ? "border-[#A68B5B] bg-[#FFF4DC] text-[#7A4D18]" : "bg-white text-gray-600"}`}>
                    {tag.name}
                  </button>
                );
              })}
              {tagSearch.trim() && !filteredTags.some((tag) => tag.name.toLowerCase() === tagSearch.trim().toLowerCase()) && (
                <button type="button" onClick={createInlineTag} className="rounded-full border border-[#A68B5B] px-3 py-1 text-xs text-[#7A4D18]">
                  Create "{tagSearch.trim()}"
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div>
              <SectionHeader icon={tagIcon} title="Pricing" description="Configure price, tax, and promotional rates." />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <FormInput label="Base Price" value={form.price} onChange={(value) => updateField("price", value)} required />
                <FormInput label="Discount Price" value={form.discountPrice || ""} onChange={(value) => updateField("discountPrice", value)} />
              </div>
              <label className="block text-sm font-medium">
                GST Treatment
                <select
                  value={form.gst_inclusive ? "inclusive" : "exclusive"}
                  onChange={(event) => updateField("gst_inclusive", event.target.value === "inclusive")}
                  className="mt-1 w-full rounded-lg border bg-white p-2.5 text-sm"
                >
                  <option value="inclusive">Price includes GST</option>
                  <option value="exclusive">Price excludes GST</option>
                </select>
                <span className="mt-1 block text-xs font-normal text-gray-400">Category GST is added only to exclusive prices.</span>
              </label>
            </div>

            <div>
              <SectionHeader icon={boxIcon} title="Inventory" description="Manage stock levels and tracking numbers." />
              <FormInput label="SKU" value={form.sku || ""} onChange={(value) => updateField("sku", value)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 mt-4">
                <FormInput label="Stock Quantity" value={form.stock || ""} onChange={(value) => updateField("stock", value)} />
                <FormInput label="Low Stock Limit" value={form.lowStockLimit || ""} onChange={(value) => updateField("lowStockLimit", value)} />
              </div>
              <div className="bg-gray-50 border rounded-xl p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">Low Stock Notifications</p>
                  <p className="text-xs text-gray-500">Alert me when stock is low</p>
                </div>
                <div onClick={() => setLowStock(!lowStock)} className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer ${lowStock ? "bg-[#C2863FFF]" : "bg-gray-300"}`}>
                  <div className={`bg-white w-4 h-4 rounded-full ${lowStock ? "translate-x-6" : ""}`} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <SectionHeader icon={boxIcon} title="Specifications" description="Product size, weight and barcode shown on the storefront." />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormInput label="Barcode" value={form.barcode || ""} onChange={(value) => updateField("barcode", value)} />
              <FormInput label="Weight" value={form.weight || ""} onChange={(value) => updateField("weight", value)} />
              <div>
                <label className="text-sm font-medium">Weight Unit</label>
                <select value={form.weight_unit || "g"} onChange={(event) => updateField("weight_unit", event.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm">
                  <option>g</option>
                  <option>kg</option>
                  <option>lb</option>
                  <option>oz</option>
                </select>
              </div>
              <FormInput label="Length" value={form.length || ""} onChange={(value) => updateField("length", value)} />
              <FormInput label="Breadth / Width" value={form.breadth || ""} onChange={(value) => updateField("breadth", value)} />
              <FormInput label="Height" value={form.height || ""} onChange={(value) => updateField("height", value)} />
              <div>
                <label className="text-sm font-medium">Dimension Unit</label>
                <select value={form.dimension_unit || "cm"} onChange={(event) => updateField("dimension_unit", event.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm">
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                  <option value="m">m</option>
                </select>
                <p className="mt-1 text-xs text-gray-400">Applies to length, breadth and height.</p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <ProductVariantEditor
              enabled={hasVariants}
              setEnabled={setHasVariants}
              options={variantOptions}
              setOptions={setVariantOptions}
              variants={variants}
              setVariants={setVariants}
              baseSku={form.sku || `PRD-${form.id}`}
              basePrice={form.price || 0}
            />
          </div>

          <div className="mt-6">
            <SectionHeader icon={cameraIcon} title="Product Media" description="The first image is the primary storefront image." />
            <label className="grid grid-cols-1 md:grid-cols-3 gap-4 cursor-pointer">
              <div className="md:col-span-2 border-dashed border rounded-xl p-6 text-center bg-gray-50">
                <img src={uploadIcon} className="h-6 mx-auto mb-2" />
                <p className="text-sm font-medium">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-400">{uploading ? "Uploading..." : "PNG, JPG or WebP"}</p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 border rounded-lg p-2 text-xs">
                  <img src={infoIcon} className="h-4" />
                  Minimum size 800x800px
                </div>
                <div className="flex items-center gap-2 border rounded-lg p-2 text-xs">
                  <img src={clockIcon} className="h-4" />
                  Current file: {images[0]?.url || "No image selected"}
                </div>
              </div>
              <input type="file" hidden multiple accept="image/*" onChange={handleFileChange} disabled={uploading} />
            </label>
            <div className="flex gap-3 mt-5 flex-wrap">
              {images.map((media, index) => (
                <div key={`${media.url}-${index}`} className="relative rounded-lg border p-2">
                  <button type="button" onClick={() => setPrimaryImage(index)} title="Set as primary">
                    <img src={getAssetUrl(media.url)} className="h-16 w-16 rounded-lg object-cover" />
                  </button>
                  <button type="button" onClick={() => removeImage(index)} title="Remove image" className="absolute -right-1 -top-1 rounded-full bg-white p-1 shadow">
                    <img src={closeIcon} className="h-3 w-3" />
                  </button>
                  {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">Primary</span>}
                  <input
                    value={media.altText || ""}
                    onChange={(event) => {
                      const nextImages = [...images];
                      nextImages[index] = { ...media, altText: event.target.value };
                      setImages(nextImages);
                    }}
                    className="mt-2 w-40 rounded border px-2 py-1 text-xs"
                    placeholder="Image alt text"
                  />
                </div>
              ))}
              <label className={`h-16 w-16 cursor-pointer rounded-lg border flex items-center justify-center ${uploading ? "pointer-events-none opacity-60" : ""}`} title="Add more product images">
                <img src={addIcon} className="h-5" />
                <input type="file" hidden multiple accept="image/*" onChange={handleFileChange} disabled={uploading} />
              </label>
            </div>
          </div>

          <div className="mt-6 bg-gray-100 border rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-start gap-3">
              <div className="bg-white border p-2 rounded-full shadow-sm">
                <img src={chainIcon} className="h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Product Status</p>
                <p className="text-xs text-gray-500">Is this product available for purchase?</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 bg-white border rounded-xl px-4 py-3 w-full md:w-auto shadow-sm">
              <div>
                <p className="text-sm font-medium">Public / Active</p>
                <p className="text-xs text-gray-400">Currently visible on storefront</p>
              </div>
              <div onClick={() => setActive(!active)} className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer ${active ? "bg-[#C2863FFF]" : "bg-gray-300"}`}>
                <div className={`bg-white w-4 h-4 rounded-full ${active ? "translate-x-6" : ""}`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function SectionHeader({ icon, title, description }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="bg-[#FFF4DC] p-2 rounded-full">
        <img src={icon} className="h-4" />
      </div>
      <div>
        <h2 className="font-semibold text-sm md:text-base">{title}</h2>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </div>
  );
}

function FormInput({ label, value, onChange, placeholder = "", required = false }) {
  return (
    <div>
      <label className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="border rounded-lg p-2.5 text-sm w-full mt-1" />
    </div>
  );
}

function SeoInput({ label, value, onChange, hint = "" }) {
  return (
    <label className="text-sm font-medium">
      <span className="flex justify-between gap-2">
        {label}
        {hint && <span className="text-xs font-normal text-gray-400">{hint}</span>}
      </span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2.5 text-sm" />
    </label>
  );
}

function SeoTextarea({ label, value, onChange, hint = "" }) {
  return (
    <label className="text-sm font-medium md:col-span-2">
      <span className="flex justify-between gap-2">
        {label}
        {hint && <span className="text-xs font-normal text-gray-400">{hint}</span>}
      </span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border bg-white p-2.5 text-sm" />
    </label>
  );
}

export default AddEditProduct;
