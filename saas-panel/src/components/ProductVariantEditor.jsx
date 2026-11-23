/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useMemo } from "react";
import { uploadAdminMedia } from "../lib/adminApi";
import { formatQuantity, quantityFieldValue } from "../lib/formatQuantity";

function splitValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item.value || item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function combinationKey(options) {
  return options.map((option) => `${option.optionName}:${option.value}`).join("|");
}

function buildCombinations(options) {
  const normalized = options
    .map((option) => ({
      name: String(option.name || "").trim(),
      values: splitValues(option.valuesText || option.values),
    }))
    .filter((option) => option.name && option.values.length);

  if (!normalized.length) return [];

  return normalized.reduce(
    (combinations, option) =>
      combinations.flatMap((combination) =>
        option.values.map((value) => [
          ...combination,
          {
            optionName: option.name,
            value,
          },
        ])
      ),
    [[]]
  );
}

function normalizeOptions(options) {
  return (options || []).map((option) => ({
    name: option.name || option.optionName || "",
    valuesText: splitValues(option.valuesText || option.values).join(", "),
  }));
}

function normalizeVariants(variants) {
  return (variants || []).map((variant) => ({
    ...variant,
    options: (variant.options || []).map((option) => ({
      optionName: option.optionName || option.name,
      value: option.value,
    })),
    price: String(variant.price ?? ""),
    comparePrice: String(variant.comparePrice ?? variant.compare_price ?? ""),
    costPrice: String(variant.costPrice ?? variant.cost_price ?? ""),
    stock: formatQuantity(variant.stock ?? ""),
    weight: String(variant.weight ?? ""),
    weightUnit: variant.weightUnit || variant.weight_unit || "g",
    dimensions:
      typeof variant.dimensions === "string"
        ? (() => {
            try {
              return JSON.parse(variant.dimensions);
            } catch {
              return {};
            }
          })()
        : variant.dimensions || {},
    sku: variant.sku || "",
    barcode: variant.barcode || "",
    image: variant.image || "",
    visibility: variant.visibility || "Visible",
    isDefault: Boolean(variant.isDefault || variant.is_default),
  }));
}

export function prepareVariantOptions(options) {
  return normalizeOptions(options)
    .map((option) => ({
      name: option.name.trim(),
      values: splitValues(option.valuesText),
    }))
    .filter((option) => option.name && option.values.length);
}

export function prepareVariants(variants) {
  return (variants || [])
    .map((variant) => ({
      ...variant,
      price: Number(variant.price) || 0,
      comparePrice: variant.comparePrice === "" ? null : Number(variant.comparePrice) || null,
      costPrice: variant.costPrice === "" ? null : Number(variant.costPrice) || null,
      stock: Math.max(0, Number(variant.stock) || 0),
      weight: variant.weight === "" ? null : Number(variant.weight) || null,
      weightUnit: variant.weightUnit || variant.weight_unit || null,
      dimensions: variant.dimensions
        ? {
            length: variant.dimensions.length === "" ? null : Number(variant.dimensions.length) || null,
            breadth: variant.dimensions.breadth === "" ? null : Number(variant.dimensions.breadth) || null,
            height: variant.dimensions.height === "" ? null : Number(variant.dimensions.height) || null,
            unit: variant.dimensions.unit || "cm",
          }
        : null,
      status: "Active",
      visibility: variant.visibility || "Visible",
      isDefault: Boolean(variant.isDefault),
      options: variant.options || [],
    }))
    .filter((variant) => variant.options?.length && variant.sku);
}

const emptyOption = { name: "Color", valuesText: "Blue, Black" };

function ProductVariantEditor({
  enabled,
  setEnabled,
  options,
  setOptions,
  variants,
  setVariants,
  baseSku = "SKU",
  basePrice = 0,
}) {
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);

  useEffect(() => {
    if (!enabled) return;

    const combinations = buildCombinations(normalizedOptions);
    const previousByKey = new Map((variants || []).map((variant) => [combinationKey(variant.options || []), variant]));
    const nextVariants = combinations.map((combination, index) => {
      const existing = previousByKey.get(combinationKey(combination)) || {};
      const suffix = combination.map((option) => option.value).join("-").replace(/[^a-z0-9]+/gi, "-").toUpperCase();

      return {
        options: combination,
        sku: existing.sku || `${baseSku || "SKU"}-${suffix || index + 1}`,
        barcode: existing.barcode || "",
        price: existing.price ?? basePrice ?? "",
        comparePrice: existing.comparePrice ?? "",
        costPrice: existing.costPrice ?? "",
        stock: formatQuantity(existing.stock ?? ""),
        weight: existing.weight ?? "",
        weightUnit: existing.weightUnit || "g",
        dimensions: existing.dimensions || { length: "", breadth: "", height: "", unit: "cm" },
        image: existing.image || "",
        visibility: existing.visibility || "Visible",
        isDefault: existing.isDefault ?? index === 0,
      };
    });

    setVariants(nextVariants);
  }, [enabled, normalizedOptions, baseSku, basePrice]);

  const updateOption = (index, field, value) => {
    setOptions((current) =>
      normalizeOptions(current).map((option, optionIndex) =>
        optionIndex === index ? { ...option, [field]: value } : option
      )
    );
  };

  const updateVariant = (index, field, value) => {
    setVariants((current) =>
      (current || []).map((variant, variantIndex) =>
        variantIndex === index
          ? {
              ...variant,
              [field]: value,
            }
          : field === "isDefault" && value
          ? {
              ...variant,
              isDefault: false,
            }
          : variant
      )
    );
  };

  const handleVariantImage = async (index, file) => {
    if (!file) return;
    if (!/^image\//i.test(file.type)) return;

    const media = await uploadAdminMedia(file, "products/variants");
    updateVariant(index, "image", media.url);
  };

  const updateVariantDimension = (index, field, value) => {
    setVariants((current) =>
      (current || []).map((variant, variantIndex) =>
        variantIndex === index
          ? {
              ...variant,
              dimensions: {
                ...(variant.dimensions || { unit: "cm" }),
                [field]: value,
              },
            }
          : variant
      )
    );
  };

  return (
    <div className="bg-white p-5 rounded-xl shadow">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-sm">PRODUCT VARIANTS</h2>
          <p className="text-xs text-gray-500">Create Shopify-style options and manage inventory per variant.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-[#A68B5B]"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          This product has variants
        </label>
      </div>

      {enabled && (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border bg-[#FBF8F2] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Options</p>
              <button
                type="button"
                onClick={() => setOptions((current) => [...normalizeOptions(current), { name: "", valuesText: "" }])}
                className="rounded-lg border px-3 py-1 text-xs"
              >
                Add option
              </button>
            </div>
            <div className="space-y-3">
              {normalizedOptions.map((option, index) => (
                <div key={index} className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
                  <input
                    value={option.name}
                    onChange={(event) => updateOption(index, "name", event.target.value)}
                    placeholder="Color"
                    className="rounded-lg border p-2 text-sm"
                  />
                  <input
                    value={option.valuesText}
                    onChange={(event) => updateOption(index, "valuesText", event.target.value)}
                    placeholder="Blue, Black, Red"
                    className="rounded-lg border p-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setOptions((current) => normalizeOptions(current).filter((_, optionIndex) => optionIndex !== index))}
                    className="rounded-lg border px-3 py-2 text-xs text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[1420px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="p-3">Variant</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>Compare</th>
                  <th>Stock</th>
                  <th>Weight</th>
                  <th>Unit</th>
                  <th>Length</th>
                  <th>Breadth</th>
                  <th>Height</th>
                  <th>Size Unit</th>
                  <th>Barcode</th>
                  <th>Image</th>
                  <th>Visible</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {(variants || []).map((variant, index) => (
                  <tr key={combinationKey(variant.options || []) || index} className="border-t">
                    <td className="p-3 font-medium">{(variant.options || []).map((option) => option.value).join(" / ")}</td>
                    <td><input value={variant.sku || ""} onChange={(event) => updateVariant(index, "sku", event.target.value)} className="w-32 rounded border p-2" /></td>
                    <td><input value={variant.price || ""} onChange={(event) => updateVariant(index, "price", event.target.value)} className="w-24 rounded border p-2" /></td>
                    <td><input value={variant.comparePrice || ""} onChange={(event) => updateVariant(index, "comparePrice", event.target.value)} className="w-24 rounded border p-2" /></td>
                    <td><input value={quantityFieldValue(variant.stock)} onChange={(event) => updateVariant(index, "stock", event.target.value)} className="w-20 rounded border p-2" /></td>
                    <td><input value={variant.weight || ""} onChange={(event) => updateVariant(index, "weight", event.target.value)} className="w-20 rounded border p-2" /></td>
                    <td>
                      <select value={variant.weightUnit || "g"} onChange={(event) => updateVariant(index, "weightUnit", event.target.value)} className="rounded border p-2">
                        <option>g</option>
                        <option>kg</option>
                        <option>lb</option>
                        <option>oz</option>
                      </select>
                    </td>
                    <td><input type="number" min="0" step="any" value={variant.dimensions?.length ?? ""} onChange={(event) => updateVariantDimension(index, "length", event.target.value)} className="w-20 rounded border p-2" /></td>
                    <td><input type="number" min="0" step="any" value={variant.dimensions?.breadth ?? ""} onChange={(event) => updateVariantDimension(index, "breadth", event.target.value)} className="w-20 rounded border p-2" /></td>
                    <td><input type="number" min="0" step="any" value={variant.dimensions?.height ?? ""} onChange={(event) => updateVariantDimension(index, "height", event.target.value)} className="w-20 rounded border p-2" /></td>
                    <td>
                      <select value={variant.dimensions?.unit || "cm"} onChange={(event) => updateVariantDimension(index, "unit", event.target.value)} className="rounded border p-2">
                        <option value="mm">mm</option>
                        <option value="cm">cm</option>
                        <option value="in">in</option>
                        <option value="m">m</option>
                      </select>
                    </td>
                    <td><input value={variant.barcode || ""} onChange={(event) => updateVariant(index, "barcode", event.target.value)} className="w-32 rounded border p-2" /></td>
                    <td>
                      <label className="flex cursor-pointer items-center gap-2">
                        {variant.image ? <img src={variant.image} className="h-8 w-8 rounded object-cover" /> : <span className="h-8 w-8 rounded bg-gray-100" />}
                        <span className="text-xs text-[#8A541E]">Upload</span>
                        <input type="file" hidden accept="image/*" onChange={(event) => handleVariantImage(index, event.target.files?.[0])} />
                      </label>
                      {variant.image && <button type="button" onClick={() => updateVariant(index, "image", "")} className="mt-1 text-[10px] text-red-600">Remove</button>}
                    </td>
                    <td>
                      <select value={variant.visibility || "Visible"} onChange={(event) => updateVariant(index, "visibility", event.target.value)} className="rounded border p-2">
                        <option>Visible</option>
                        <option>Hidden</option>
                      </select>
                    </td>
                    <td className="text-center">
                      <input type="radio" name="defaultVariant" checked={Boolean(variant.isDefault)} onChange={() => updateVariant(index, "isDefault", true)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

ProductVariantEditor.defaultProps = {
  options: [emptyOption],
  variants: [],
};

export function normalizeVariantEditorState(product = {}) {
  const options = product.variantOptions?.length
    ? product.variantOptions.map((option) => ({
        name: option.name,
        valuesText: splitValues(option.values).join(", "),
      }))
    : [emptyOption];

  return {
    enabled: Boolean(product.hasVariants || product.has_variants || product.variants?.length),
    options,
    variants: normalizeVariants(product.variants || []),
  };
}

export default ProductVariantEditor;
