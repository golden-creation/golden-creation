import assert from "node:assert/strict";
import {
  locationMatches,
  selectShippingRuleCandidate,
} from "../services/commerce.service.js";
import { isShopifyRemoteImageUrl } from "../services/remote-media.service.js";

assert.equal(
  isShopifyRemoteImageUrl("https://cdn.shopify.com/s/files/1/product.jpg?v=1"),
  true
);
assert.equal(
  isShopifyRemoteImageUrl(
    "https://golden-creation.sgp1.digitaloceanspaces.com/products/shopify-backfill/image.jpg"
  ),
  false,
  "Application Spaces URLs must never be queued as Shopify sources"
);

const items = [
  {
    categoryId: 20,
    collectionIds: [30],
    stockLines: [{ productId: 40 }],
    bundleItems: [],
  },
];
const categoryMap = new Map([[20, new Set([20, 10])]]);
const allIndia = [{ location_type: "All India", location_value: "" }];

assert.equal(locationMatches(allIndia[0], { state: "Delhi", zipCode: "110001" }), true);
assert.equal(
  locationMatches(
    { location_type: "State", location_value: "Delhi" },
    { state: "delhi" }
  ),
  true
);
assert.equal(
  locationMatches(
    { location_type: "Pincode", location_value: "110 001" },
    { zipCode: "110001" }
  ),
  true
);

const targetMap = new Map([
  [2, [{ target_type: "Category", target_id: 10 }]],
  [3, [{ target_type: "Collection", target_id: 30 }]],
  [
    4,
    [
      { target_type: "Category", target_id: 10 },
      { target_type: "Collection", target_id: 999 },
    ],
  ],
  [5, [{ target_type: "Product", target_id: 40 }]],
]);
const locationMap = new Map([
  [1, allIndia],
  [2, allIndia],
  [3, allIndia],
  [4, allIndia],
  [5, [{ location_type: "Pincode", location_value: "110001" }]],
]);
const rules = [
  { id: 1, priority: 0, min_order_value: 0, charge: 59 },
  { id: 2, priority: 0, min_order_value: 0, charge: 49 },
  { id: 3, priority: 0, min_order_value: 0, charge: 39 },
  { id: 4, priority: 1, min_order_value: 0, charge: 29 },
  { id: 5, priority: 1, min_order_value: 0, charge: 19 },
];

const selected = selectShippingRuleCandidate({
  rules,
  targetMap,
  locationMap,
  categoryMap,
  items,
  address: { state: "Delhi", zipCode: "110001" },
});
assert.equal(selected.id, 5, "Product target must win within the same priority");

const multiTargetSelected = selectShippingRuleCandidate({
  rules: [rules[3]],
  targetMap,
  locationMap,
  categoryMap,
  items,
  address: { state: "Delhi", zipCode: "110001" },
});
assert.equal(
  multiTargetSelected.id,
  4,
  "One matching target must not be cancelled by a later nonmatching target"
);

const thresholdSelected = selectShippingRuleCandidate({
  rules: [
    { id: 6, priority: 0, min_order_value: 0, charge: 59 },
    { id: 7, priority: 0, min_order_value: 999, charge: 0 },
  ],
  targetMap: new Map(),
  locationMap: new Map(),
  categoryMap,
  items,
  address: { state: "Delhi", zipCode: "110001" },
});
assert.equal(thresholdSelected.id, 7, "Highest valid minimum threshold must win");

console.log("Commerce rule verification passed.");
