import React, { useEffect, useState } from "react";
import { quantityFieldValue } from "../lib/formatQuantity";
import checkIcon from "../assets/check.png";
import chainIcon from "../assets/chain.png";
import starIcon from "../assets/star.png";
import boxIcon from "../assets/box.png";
import codeIcon from "../assets/code.png";
import arrowIcon from "../assets/right-arrow.png";
import a1 from "../assets/a1.png";
import a3 from "../assets/a3.jpg";
import uploadIcon from "../assets/download.png";
import closeIcon from "../assets/close.png";
import addIcon from "../assets/add.png";
import imageIcon from "../assets/image.png";
import toggleIcon from "../assets/toggle.png";
import infoIcon from "../assets/information (2).png";
import { apiRequest } from "../lib/api";
import { createAdminTag, getAdminTags, uploadAdminMedia, deleteAdminMedia } from "../lib/adminApi";
import { useNavigate } from "react-router-dom";
import RemoteLookup from "../components/RemoteLookup";
import ProductVariantEditor, {
  prepareVariantOptions,
  prepareVariants,
} from "../components/ProductVariantEditor";
import ConfirmDialog from "../components/ConfirmDialog";

const AddProduct = () => {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState(null);
  const [brand, setBrand] = useState(null);
  const [tags, setTags] = useState([]);
  const [tagSearch, setTagSearch] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptions, setVariantOptions] = useState([
    { name: "Color", valuesText: "Blue, Black" },
  ]);
  const [variants, setVariants] = useState([]);
  const [toast, setToast] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category_id: "",
    brand_id: "",
    price: "",
    stock: "",
    sku: "",
    barcode: "",
    weight: "",
    weight_unit: "g",
    length: "",
    breadth: "",
    height: "",
    dimension_unit: "cm",
    gst_inclusive: true,
    slug: "",
    meta_title: "",
    meta_description: "",
    seo_description: "",
    focus_keyword: "",
    search_keywords: "",
    canonical_url: "",
    robots_directive: "index,follow",
    og_image: "",
  });
  const navigate = useNavigate();

  useEffect(() => {
    getAdminTags({ status: "Active", limit: 100 })
      .then((data) => setTags(data.tags || []))
      .catch(() => setTags([]));
  }, []);

  const filteredTags = tags.filter((tag) =>
    `${tag.name} ${tag.slug}`.toLowerCase().includes(tagSearch.toLowerCase())
  );

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const uploadImageFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => /^image\//i.test(file.type));
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const media = await uploadAdminMedia(file, "products");
        setImages((current) => [...current, { ...media, altText: form.name }]);
      }
      showToast("Product media uploaded");
    } catch (error) {
      showToast(error.message || "Unable to upload product media");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (event) => {
    await uploadImageFiles(event.target.files);
    event.target.value = "";
  };

  const removeImage = async (index) => {
    const media = images[index];
    setImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
    if (media?.key) {
      await deleteAdminMedia(media.key).catch(() => {});
    }
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
    if (!form.name || !form.price || !form.category_id) {
      showToast("Name, price and category are required");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/products", {
      method: "POST",
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
        category_id: form.category_id,
        brand_id: form.brand_id || null,
        image: images[0]?.url || "",
        images: images.map((media, index) => ({
          url: media.url,
          key: media.key,
          altText: media.altText || form.name,
          titleText: media.titleText || form.name,
          sortOrder: index + 1,
        })),
        sku: form.sku,
        barcode: form.barcode,
        weight: form.weight,
        weight_unit: form.weight_unit,
        dimensions:
          form.length || form.breadth || form.height
            ? {
                length: Number(form.length) || null,
                breadth: Number(form.breadth) || null,
                height: Number(form.height) || null,
                unit: form.dimension_unit,
              }
            : null,
        stock_quantity: form.stock,
        reorder_level: 0,
        status: "Active",
        gst_inclusive: form.gst_inclusive,
        tagIds: selectedTagIds,
        hasVariants,
        variantOptions: hasVariants ? prepareVariantOptions(variantOptions) : [],
        variants: hasVariants ? prepareVariants(variants) : [],
      }),
      });
      showToast("Product saved successfully");
      setTimeout(() => navigate("/product"), 700);
    } catch (error) {
      showToast(error.message || "Unable to save product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 bg-[#F6F4EF] min-h-screen">
      <ConfirmDialog
        open={confirmSave}
        title="Save product?"
        message={`Create ${form.name || "this product"} in Website Products?`}
        confirmLabel="YES"
        onConfirm={handleSave}
        onDiscard={() => setConfirmSave(false)}
      />
      {toast && <div className="fixed top-5 right-5 bg-black text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">{toast}</div>}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">Add New Product</h1>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => navigate(-1)} className="w-full sm:w-auto px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm transition">Cancel</button>
          <button onClick={() => setConfirmSave(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#C2863FFF] hover:bg-[#A68B5BFF] text-white px-4 py-2 rounded-lg text-sm shadow transition">
            <img src={checkIcon} className="h-4" />
            Save Product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-5 rounded-xl shadow">
            <div className="flex items-start gap-3 mb-4">
              <img src={chainIcon} className="h-5 mt-1" />
              <div>
                <h2 className="font-semibold text-sm">PRODUCT INFORMATION</h2>
                <p className="text-xs text-gray-500">Define the core identity of your product</p>
              </div>
            </div>
            <label className="text-xs text-black">PRODUCT NAME</label>
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="e.g. Gold Leaf Embossed Journal" className="w-full border p-3 rounded-lg mb-3 text-sm" />
            <label className="text-xs text-black">PRODUCT DESCRIPTION</label>
            <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} className="w-full border p-3 rounded-lg mb-3 text-sm h-28 resize-none" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-black">CATEGORY</label>
                <RemoteLookup type="categories" value={category} onChange={(option) => { setCategory(option); updateField("category_id", option?.id || ""); }} placeholder="Search category..." />
              </div>
              <div>
                <label className="text-xs text-black">BRAND</label>
                <RemoteLookup type="brands" value={brand} onChange={(option) => { setBrand(option); updateField("brand_id", option?.id || ""); }} placeholder="Search brand..." />
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs text-black">TAGS</label>
              <input value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="Search or create tag" className="mt-1 w-full border p-2 rounded-lg text-sm" />
              <div className="mt-2 flex flex-wrap gap-2">
                {filteredTags.slice(0, 12).map((tag) => {
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
          </div>

          <div className="bg-white p-5 rounded-xl shadow">
            <div className="flex items-start gap-3 mb-4">
              <img src={infoIcon} className="h-5 mt-1" />
              <div>
                <h2 className="font-semibold text-sm">SEO</h2>
                <p className="text-xs text-gray-500">Search preview fields, canonical URL, and crawl directives.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SeoInput label="Slug" value={form.slug} onChange={(value) => updateField("slug", value)} hint={`${form.slug.length}/140`} />
              <SeoInput label="Meta Title" value={form.meta_title} onChange={(value) => updateField("meta_title", value)} hint={`${form.meta_title.length}/60`} />
              <SeoTextarea label="Meta Description" value={form.meta_description} onChange={(value) => updateField("meta_description", value)} hint={`${form.meta_description.length}/160`} />
              <SeoTextarea label="SEO Description" value={form.seo_description} onChange={(value) => updateField("seo_description", value)} />
              <SeoInput label="Focus Keyword" value={form.focus_keyword} onChange={(value) => updateField("focus_keyword", value)} />
              <SeoInput label="Search Keywords" value={form.search_keywords} onChange={(value) => updateField("search_keywords", value)} />
              <SeoInput label="Canonical URL" value={form.canonical_url} onChange={(value) => updateField("canonical_url", value)} />
              <SeoInput label="OG Image" value={form.og_image} onChange={(value) => updateField("og_image", value)} />
              <label className="text-xs text-black">
                Robots Directive
                <select value={form.robots_directive} onChange={(event) => updateField("robots_directive", event.target.value)} className="mt-1 w-full rounded-lg border p-3 text-sm">
                  <option value="index,follow">index,follow</option>
                  <option value="noindex,follow">noindex,follow</option>
                  <option value="noindex,nofollow">noindex,nofollow</option>
                </select>
              </label>
            </div>
          </div>

          <ProductVariantEditor
            enabled={hasVariants}
            setEnabled={setHasVariants}
            options={variantOptions}
            setOptions={setVariantOptions}
            variants={variants}
            setVariants={setVariants}
            baseSku={form.sku || "LM-PRODUCT"}
            basePrice={form.price || 0}
          />

          <div className="bg-white p-5 rounded-xl shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-[#f3e7d9] p-2 rounded-lg text-[#A68B5BFF]">₹</div>
              <div>
                <h2 className="font-semibold text-sm">PRICING & INVENTORY</h2>
                <p className="text-xs text-gray-500">Management of retail value and stock availability</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-black">BASE PRICE</label>
                <input value={form.price} onChange={(event) => updateField("price", event.target.value)} className="border p-3 rounded-lg w-full" placeholder="₹ 0.00" />
              </div>
              <div>
                <label className="text-xs text-black">DISCOUNT PRICE (Optional)</label>
                <input className="border p-3 rounded-lg w-full" placeholder="₹ 0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="text-xs text-black">STOCK QUANTITY</label>
                <div className="flex items-center border p-3 rounded-lg gap-2">
                  <img src={boxIcon} className="h-4" />
                  <input value={quantityFieldValue(form.stock)} onChange={(event) => updateField("stock", event.target.value)} className="w-full outline-none text-sm" placeholder="50" />
                </div>
              </div>
              <div>
                <label className="text-xs text-black">SKU CODE</label>
                <div className="flex items-center border p-3 rounded-lg gap-2">
                  <img src={codeIcon} className="h-4" />
                  <input value={form.sku} onChange={(event) => updateField("sku", event.target.value)} className="w-full outline-none text-sm" placeholder="G-CRTN-001" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow">
            <div className="flex items-center gap-3 mb-4">
              <img src={boxIcon} className="h-5" />
              <div>
                <h2 className="font-semibold text-sm">SPECIFICATIONS</h2>
                <p className="text-xs text-gray-500">Barcode, weight and physical dimensions shown on the storefront.</p>
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs text-black">GST TREATMENT</label>
              <select
                value={form.gst_inclusive ? "inclusive" : "exclusive"}
                onChange={(event) => updateField("gst_inclusive", event.target.value === "inclusive")}
                className="mt-1 w-full rounded-lg border bg-white p-3 text-sm sm:max-w-md"
              >
                <option value="inclusive">Price includes GST</option>
                <option value="exclusive">Price excludes GST</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">Category GST is added only when the price excludes GST.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Barcode" value={form.barcode} onChange={(value) => updateField("barcode", value)} />
              <Field label="Weight" value={form.weight} onChange={(value) => updateField("weight", value)} type="number" />
              <SelectField label="Weight unit" value={form.weight_unit} onChange={(value) => updateField("weight_unit", value)} options={["g", "kg", "lb", "oz"]} />
              <Field label="Length" value={form.length} onChange={(value) => updateField("length", value)} type="number" />
              <Field label="Breadth / Width" value={form.breadth} onChange={(value) => updateField("breadth", value)} type="number" />
              <Field label="Height" value={form.height} onChange={(value) => updateField("height", value)} type="number" />
            </div>
            <div className="mt-4 max-w-xs">
              <SelectField label="Dimension unit (applies to all three)" value={form.dimension_unit} onChange={(value) => updateField("dimension_unit", value)} options={["mm", "cm", "in", "m"]} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow">
            <div className="flex items-center gap-2 mb-2">
              <img src={imageIcon} className="h-4" />
              <h2 className="font-semibold text-sm">PRODUCT MEDIA</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">Upload images to Golden Creation storage. The first image is the primary storefront image.</p>
            <label
              className="border-2 border-dashed border-[#e5d3b3] p-6 rounded-xl text-center cursor-pointer block bg-[#faf7f2]"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                uploadImageFiles(event.dataTransfer.files);
              }}
            >
              <img src={uploadIcon} className="h-6 mx-auto mb-3 opacity-70" />
              <p className="text-sm font-medium text-gray-700">Click to upload or drag and drop</p>
              <p className="text-xs text-gray-400 mt-1">{uploading ? "Uploading..." : "PNG, JPG or WebP"}</p>
              <input type="file" hidden multiple accept="image/*" onChange={handleFileChange} disabled={uploading} />
            </label>
            <div className="flex gap-3 mt-4 flex-wrap">
              {images.map((media, i) => (
                <div key={media.key || media.url} className="relative rounded-lg border p-2">
                  <img src={media.url} className="h-16 w-16 rounded-lg object-cover" />
                  <img src={closeIcon} onClick={() => removeImage(i)} className="absolute top-1 right-1 h-4 bg-white rounded-full p-[2px] shadow cursor-pointer" />
                  {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">Primary</span>}
                  <input
                    value={media.altText || ""}
                    onChange={(event) => {
                      const nextImages = [...images];
                      nextImages[i] = { ...media, altText: event.target.value };
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

          <div className="bg-white p-5 rounded-xl shadow">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-[#f3e7d9] p-2 rounded-lg"><img src={starIcon} className="h-4" /></div>
              <div>
                <h2 className="font-semibold text-sm">STATUS & SETTINGS</h2>
                <p className="text-xs text-gray-500">Finalize the visibility and customization options</p>
              </div>
            </div>
            <div className="flex items-center justify-between border rounded-xl p-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#f3e7d9] p-2 rounded-full"><img src={checkIcon} className="h-4" /></div>
                <div>
                  <p className="text-sm font-medium">Active Status</p>
                  <p className="text-xs text-gray-500">Visible to customers on the storefront</p>
                </div>
              </div>
              <img src={toggleIcon} className="h-6" />
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <img src={infoIcon} className="h-4" />
                <span>Product will be saved through `/api/products`</span>
              </div>
              <button disabled={saving || uploading} onClick={() => setConfirmSave(true)} className="px-4 py-2 border border-[#A68B5BFF] text-[#C2863FFF] rounded-lg text-sm disabled:opacity-50">{saving ? "Saving..." : "Save to Backend"}</button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-2">LIVE STOREFRONT PREVIEW</p>
            <div className="bg-white p-4 rounded-xl shadow">
              {images[0]?.url ? <img src={images[0].url} className="rounded-lg mb-3 w-full" /> : <div className="mb-3 aspect-square rounded-lg bg-gray-100" />}
              <p className="text-[10px] text-[#C2863FFF] font-semibold">LEKHANMART CATALOG</p>
              <h3 className="font-semibold text-sm">{form.name || "Gold Leaf Embossed Journal"}</h3>
              <p className="text-xs text-gray-400 mt-1">RETAIL PRICE</p>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">₹{Number(form.price || 85).toLocaleString("en-IN")}</span>
                <div className="flex -space-x-2">
                  <img src={a1} className="h-6 w-6 rounded-full border-2 border-white" />
                  <img src={a3} className="h-6 w-6 rounded-full border-2 border-white" />
                </div>
              </div>
            </div>
          </div>
          <div className="bg-[#f3e7d9] p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <img src={starIcon} className="h-4" />
              <h3 className="font-semibold text-sm">Backend Ready</h3>
            </div>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>Uses the existing products table endpoint</li>
              <li>Requires name, price and category</li>
              <li>Keeps Golden Creation frontend API unchanged</li>
            </ul>
          </div>
          <div className="bg-white p-4 rounded-xl shadow">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button className="border rounded-xl py-4 flex flex-col items-center"><img src={boxIcon} className="h-5 mb-1" /><span className="text-xs">Duplicate</span></button>
              <button className="border rounded-xl py-4 flex flex-col items-center"><img src={arrowIcon} className="h-5 mb-1 rotate-180" /><span className="text-xs">Archive</span></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddProduct;

function Field({ label, value, onChange, type = "text" }) {
  return <label className="text-xs text-black">{label}<input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "any" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border p-3 text-sm" /></label>;
}

function SelectField({ label, value, onChange, options }) {
  return <label className="text-xs text-black">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
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
