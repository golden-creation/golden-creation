import test from "node:test";
import assert from "node:assert/strict";
import { planLowStockStateWrite } from "../services/low-stock-state.js";

test("the first low-stock observation inserts one state row", () => {
  const plan = planLowStockStateWrite({ existingCount: 0, isLow: true, wasLow: false });
  assert.equal(plan.mode, "insert");
  assert.equal(plan.isLow, true);
  assert.equal(plan.setAlertedAt, true);
});

test("a repeated refresh updates the catalog and product row", () => {
  const again = planLowStockStateWrite({ existingCount: 1, isLow: true, wasLow: true });
  assert.equal(again.mode, "update");
  assert.equal(again.setAlertedAt, false);
  const duplicates = planLowStockStateWrite({ existingCount: 3, isLow: false, wasLow: true });
  assert.equal(duplicates.mode, "update");
  assert.equal(duplicates.isLow, false);
});

test("repeated refreshes do not insert another row for the same catalog and product", async () => {
  const rows = [];
  let notifications = 0;
  async function refresh(catalog, productId, isLow) {
    const existing = rows.filter((row) => row.catalog === catalog && row.productId === productId);
    const wasLow = existing.some((row) => row.isLow);
    const plan = planLowStockStateWrite({ existingCount: existing.length, isLow, wasLow });
    if (plan.setAlertedAt) notifications += 1;
    if (plan.mode === "update") {
      for (const row of existing) row.isLow = plan.isLow;
      return;
    }
    rows.push({ catalog, productId, isLow: plan.isLow });
  }

  await refresh("website", 9, true);
  await refresh("website", 9, true);
  await refresh("warehouse", 9, true);
  await refresh("warehouse", 9, true);
  assert.equal(rows.length, 2);
  assert.equal(notifications, 2);
  assert.equal(rows.filter((row) => row.catalog === "website" && row.productId === 9).length, 1);
});
