import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const store = "http://127.0.0.1:5173";
const adminUrl = "http://127.0.0.1:5174";
const api = "http://127.0.0.1:5000";
const results = [];
const consoleErrors = [];
const failedRequests = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function watch(page) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/api/")) {
      failedRequests.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
}

function rupee(text, label) {
  const match = String(text).match(new RegExp(`${label}[\\s\\S]{0,80}?₹\\s*([0-9][0-9,]*(?:\\.\\d+)?)`, "i"));
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
watch(page);

try {
  await page.goto(store, { waitUntil: "domcontentloaded" });
  const hero = page.locator("img[src*='golden-creation-hero-logo']");
  await hero.first().waitFor({ timeout: 15000 }).catch(() => {});
  record("homepage hero logo", (await hero.count()) > 0);

  await page.goto(`${store}/all-products`, { waitUntil: "domcontentloaded" });
  await page.getByText("ITEST Pen").first().waitFor({ timeout: 15000 });
  await page.getByText("Under ₹500").click();
  await page.waitForTimeout(500);
  const underFiveHundred = await page.locator("body").innerText();
  record("price filter hides the ₹800 pen", !underFiveHundred.includes("ITEST Pen"));
  await page.getByText("₹500 - ₹1,500").click();
  await page.getByText("ITEST Pen").first().waitFor({ timeout: 10000 });
  record("price filter shows the matching pen", true);

  await page.goto(`${store}/login`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("name@company.com").fill("itest.customer@example.com");
  await page.getByRole("button", { name: "Send OTP" }).click();
  const otpText = await page.getByText("OTP for testing:").textContent({ timeout: 10000 });
  const otp = otpText.match(/\d{4,8}/)?.[0];
  record("customer registration or login OTP", Boolean(otp), otp ? "development OTP shown" : "OTP was not shown");
  if (!otp) throw new Error("OTP was not shown");
  await page.getByPlaceholder("Enter OTP").fill(otp);
  await page.getByRole("button", { name: "Verify & Sign In" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 10000 });
  const session = await page.evaluate(() => {
    const raw = localStorage.getItem("goldencreation.customer.session");
    return raw ? JSON.parse(raw) : null;
  });
  record("customer login stores a session", Boolean(session?.accessToken));
  if (!session?.accessToken) throw new Error("Customer session was not stored");

  const stockBefore = await (await page.request.get(`${api}/api/products/1`)).json();
  const openingStock = Number(stockBefore.stock_quantity ?? stockBefore.stock ?? stockBefore.product?.stock_quantity);

  const added = page.waitForResponse((response) => response.url().includes("/api/customer/cart") && response.request().method() !== "GET");
  await page.goto(`${store}/product/1`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add to Cart" }).click();
  const addResponse = await added;
  record("add to cart after login", addResponse.ok() && !page.url().includes("/login"), `status ${addResponse.status()}`);

  await page.goto(`${store}/cart`, { waitUntil: "domcontentloaded" });
  const quantityBox = page.locator("div.rounded-md.border").filter({ has: page.locator("span.text-sm") }).first();
  const quantityText = quantityBox.locator("span.text-sm");
  let before = Number((await quantityText.textContent())?.trim());
  while (before > 1) {
    const decreased = page.waitForResponse((response) => response.url().includes("/api/customer/cart") && response.request().method() !== "GET");
    await quantityBox.locator("button").first().click();
    await decreased;
    before = Number((await quantityText.textContent())?.trim());
  }
  const changed = page.waitForResponse((response) => response.url().includes("/api/customer/cart") && response.request().method() !== "GET");
  await quantityBox.locator("button").nth(1).click();
  const changeResponse = await changed;
  const after = Number((await quantityText.textContent())?.trim());
  record("cart quantity change", changeResponse.ok() && after === before + 1, `${before} -> ${after}, status ${changeResponse.status()}`);
  const cartText = await page.locator("body").innerText();
  const cartTotal = rupee(cartText, "Total");
  record("cart total", cartTotal > 0, `₹${cartTotal}`);

  await page.goto(`${store}/checkout`, { waitUntil: "domcontentloaded" });
  try {
    await page.getByText("Order Summary").waitFor({ timeout: 15000 });
  } catch {
    throw new Error(`checkout stayed at ${page.url()} :: ${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 400)}`);
  }
  const fillCheckout = async (label, value) => {
    const field = page.locator(`label:text-is("${label}") + input, #checkout-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
    await field.first().fill(value);
  };
  const quoteResponse = page.waitForResponse(async (response) => {
    if (!response.url().includes("/api/customer/checkout/quote") || !response.ok()) return false;
    const body = await response.json();
    return Number(body.quote?.shippingFee) === 40;
  }, { timeout: 15000 });
  await fillCheckout("First Name", "Itest");
  await fillCheckout("Last Name", "Customer");
  await fillCheckout("Email Address", "itest.customer@example.com");
  await fillCheckout("Street Address", "1 Test Lane");
  await fillCheckout("City", "Delhi");
  await fillCheckout("State", "Delhi");
  await fillCheckout("Pin Code", "110001");
  await fillCheckout("Phone Number", "9999999999");
  const quote = (await (await quoteResponse).json()).quote || {};
  const summary = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  record("checkout rendered", summary.includes("Order Summary") && !summary.includes("SkeletonBlock is not defined"));
  record("shipping calculation", Number(quote.shippingFee) === 40, `₹${quote.shippingFee}`);
  const gstText = summary.match(/GST.{0,40}/)?.[0] || "";
  record("GST calculation", /GST/.test(summary) && (/Included/i.test(gstText) || /₹/.test(gstText)), gstText || `tax ${quote.taxAmount}`);

  await page.locator("#checkout-discount-coupon, input[placeholder='WELCOME10']").first().fill("ITEST10");
  const couponQuote = page.waitForResponse((response) => response.url().includes("/api/customer/checkout/quote") && response.ok());
  await page.getByRole("button", { name: "Apply" }).click();
  const couponBody = (await (await couponQuote).json()).quote || {};
  const discountAmount = Number(couponBody.discountAmount);
  record("discount coupon", discountAmount > 0, `₹${discountAmount}`);

  const orderResponse = page.waitForResponse((response) => response.url().includes("/api/customer/orders") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Continue to Payment" }).click();
  const created = await orderResponse;
  const createdBody = await created.json();
  const orderId = createdBody.order?.id || createdBody.id || createdBody.order?.orderNumber || createdBody.orderNumber;
  const orderNumber = String(orderId || "");
  record("COD order creation", created.ok() && Boolean(orderNumber), `status ${created.status()} ${orderNumber}`);

  const replay = await page.request.post(created.url(), {
    data: created.request().postDataJSON(),
    headers: { Authorization: created.request().headers().authorization || "" },
  });
  const replayBody = await replay.json();
  const replayId = replayBody.order?.id || replayBody.id;
  record("duplicate order prevention", replay.ok() && replayId === orderId, `replay status ${replay.status()} id ${replayId}`);

  await page.goto(`${store}/orders`, { waitUntil: "domcontentloaded" });
  const historyHit = page.getByText(orderNumber).first();
  const historyVisible = await historyHit.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  record("order history", historyVisible, historyVisible ? orderNumber : (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 180));

  const online = await page.request.post(`${api}/api/customer/checkout/payments/razorpay/order`, {
    data: created.request().postDataJSON(),
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  record("online payment without credentials is rejected", online.status() >= 400, `status ${online.status()}`);

  await page.goto(`${store}/blog/itest-formatting`, { waitUntil: "domcontentloaded" });
  const heading = page.getByRole("heading", { name: "ITEST heading" });
  const blogVisible = await heading.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  const listVisible = blogVisible && await page.getByText("ITEST list item").count() > 0;
  record("blog formatting", blogVisible && listVisible, blogVisible ? "heading and list rendered" : (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 180));

  const admin = await browser.newPage();
  watch(admin);
  await admin.goto(`${adminUrl}/login`, { waitUntil: "domcontentloaded" });
  await admin.getByPlaceholder("Enter admin email").fill("itest.admin@example.com");
  await admin.getByPlaceholder("Enter password").fill("Itest-Admin-2026");
  await admin.getByRole("button", { name: "Login to Dashboard" }).click();
  await admin.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 10000 });
  const adminToken = await admin.evaluate(() => localStorage.getItem("lekhanmart_admin_token") || "");
  record("admin login", Boolean(adminToken), admin.url());
  await admin.goto(`${adminUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  record("admin dashboard", (await admin.locator("body").innerText()).includes("Dashboard") || (await admin.locator("h1, h2").count()) > 0, admin.url());

  const productName = `ITEST Browser ${Date.now()}`;
  await admin.goto(`${adminUrl}/add-product`, { waitUntil: "domcontentloaded" });
  await admin.getByPlaceholder("e.g. Gold Leaf Embossed Journal").fill(productName);
  await admin.getByPlaceholder("₹ 0.00").first().fill("125");
  await admin.getByPlaceholder("50").fill("6");
  await admin.getByPlaceholder("G-CRTN-001").fill(`ITEST-${Date.now()}`);
  await admin.getByPlaceholder("Search category...").fill("ITEST");
  const categoryOption = admin.locator("div.absolute.z-30 button").first();
  await categoryOption.waitFor({ timeout: 8000 });
  await categoryOption.click();
  await admin.getByPlaceholder("Search brand...").fill("ITEST");
  const brandOption = admin.locator("div.absolute.z-30 button").first();
  if (await brandOption.count()) await brandOption.click();
  const closeSearch = admin.getByRole("button", { name: "Close search" });
  if (await closeSearch.count()) await closeSearch.click();
  await admin.keyboard.press("Escape");
  await admin.getByRole("button", { name: "Save Product" }).last().click();
  const productSavePromise = admin.waitForResponse((response) => response.url().includes("/api/products") && response.request().method() === "POST", { timeout: 15000 });
  await admin.getByRole("button", { name: "YES" }).click();
  const productSave = await productSavePromise;
  record("product creation", productSave.ok(), `status ${productSave.status()}`);

  await admin.goto(`${adminUrl}/product`, { waitUntil: "domcontentloaded" });
  await admin.getByPlaceholder("Search name, SKU, barcode, or serial").fill(productName);
  await admin.getByText(productName).first().waitFor({ timeout: 10000 });
  await admin.getByRole("button", { name: "Edit" }).first().click();
  await admin.waitForURL((url) => url.pathname.includes("edit-product"), { timeout: 10000 });
  await admin.locator("label", { hasText: "MRP" }).locator("xpath=following-sibling::input").fill("130");
  await admin.getByRole("button", { name: /Save/ }).first().click();
  const editResponsePromise = admin.waitForResponse((response) => /\/api\/products/i.test(response.url()) && ["PUT", "PATCH", "POST"].includes(response.request().method()), { timeout: 15000 });
  const confirm = admin.getByRole("button", { name: "YES" });
  if (await confirm.count()) await confirm.click();
  const editResponse = await editResponsePromise;
  record("product editing", editResponse.ok(), `status ${editResponse.status()}`);

  const lookup = await (await admin.request.get(`${api}/api/admin/lookups/products?q=${encodeURIComponent("ITEST")}&limit=50`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })).json();
  const options = lookup.results || lookup.options || [];
  const linked = options.find((item) => /ITEST Linked/i.test(item.label || item.name || ""));
  const disposable = options.find((item) => /ITEST Disposable/i.test(item.label || item.name || ""));
  const blocked = await admin.request.delete(`${api}/api/products/${linked?.id || linked?.value || 0}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record("product delete HTTP 409", blocked.status() === 409, `status ${blocked.status()} id ${linked?.id || linked?.value || "missing"}`);
  const removed = await admin.request.delete(`${api}/api/products/${disposable?.id || disposable?.value || 0}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record("product deletion", removed.ok(), `status ${removed.status()}`);

  const createdRow = await productSave.json().catch(() => ({}));
  const archiveId = createdRow.id || createdRow.product?.id || productName;
  await admin.goto(`${adminUrl}/product`, { waitUntil: "domcontentloaded" });
  await admin.getByPlaceholder("Search name, SKU, barcode, or serial").fill(productName);
  await admin.locator("tbody input[type=checkbox]").first().check();
  const archived = admin.waitForResponse((response) => response.url().includes("/api/admin/bulk/website-products"));
  await admin.getByRole("button", { name: "Archive Selected" }).click();
  const archiveResponse = await archived;
  record("product archiving", archiveResponse.ok() && Boolean(archiveId), `status ${archiveResponse.status()}`);

  const categories = await (await page.request.get(`${api}/api/categories`)).json();
  const brands = await (await page.request.get(`${api}/api/brands`)).json();
  const category = (Array.isArray(categories) ? categories : categories.categories || []).find((item) => /ITEST/i.test(item.name || ""));
  const brand = (Array.isArray(brands) ? brands : brands.brands || []).find((item) => /ITEST/i.test(item.name || ""));
  const headers = ["Handle","Title","Body (HTML)","Vendor","Brand","Product Category","Parent Category","Subcategory","Category ID","Type","Tags","Published","Option1 Name","Option1 Value","Option2 Name","Option2 Value","Option3 Name","Option3 Value","Variant SKU","Busy Stock","Warehouse Stock","Shop Stock","Variant Price","Variant Compare At Price","Variant Barcode","Image Src","Image Position","Image Alt Text","HEIGHT (product.metafields.custom.height)","LENGTH (product.metafields.custom.length)","WIDTH (product.metafields.custom.width)","Variant Image","Variant Weight Unit","Cost per item","Reorder Level","Status","ID"];
  const row = ["itest-import-pen","ITEST Imported Pen","Synthetic import","Golden Creation", brand?.name || "", category?.name || "", "", "", category?.id || "", "Pen", "", "TRUE", "", "", "", "", "", "", `ITEST-IMP-${Date.now()}`, 0, 0, 3, 90, "", "", "", "", "", "", "", "", "", "g", 40, 1, "active", ""];
  const csvPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "itest-import.csv");
  fs.writeFileSync(csvPath, `${headers.join(",")}\n${row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")}\n`);
  const imported = admin.waitForResponse((response) => response.url().includes("/api/admin/products/import"));
  await admin.locator("input[type=file][accept*='csv']").setInputFiles(csvPath);
  const importResponse = await imported;
  const importText = await admin.locator("body").innerText();
  record("excel product import", importResponse.ok(), `status ${importResponse.status()}`);
  record("category and brand mapping", importResponse.ok() && Boolean(category?.name) && Boolean(brand?.name) && !/unmapped|category.*not found|brand.*not found/i.test(importText), `${category?.name || "no category"} / ${brand?.name || "no brand"}`);
  fs.unlinkSync(csvPath);

  await admin.goto(`${adminUrl}/add-product`, { waitUntil: "domcontentloaded" });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const upload = admin.waitForResponse((response) => response.url().includes("/api/admin/media/upload"), { timeout: 10000 });
  const droppedFiles = await admin.evaluate((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "itest.png", { type: "image/png" }));
    const label = [...document.querySelectorAll("label")].find((node) => node.textContent.includes("drag and drop"));
    const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
    label.dispatchEvent(event);
    return event.dataTransfer?.files?.length || 0;
  }, [...png]);
  if (!droppedFiles) {
    await admin.locator("label", { hasText: "drag and drop" }).locator("input[type=file]").setInputFiles({
      name: "itest.png",
      mimeType: "image/png",
      buffer: png,
    });
  }
  const uploadResponse = await upload;
  const uploadBody = await uploadResponse.json().catch(() => ({}));
  const uploadDetail = uploadBody.message || `status ${uploadResponse.status()}`;
  const uploadReached = uploadResponse.ok() || /Spaces is not configured/i.test(uploadDetail);
  record("image drag-and-drop upload", droppedFiles > 0 && uploadReached, `drop files ${droppedFiles}; ${uploadDetail}`);
  if (!droppedFiles) record("image upload control", uploadReached, uploadDetail);

  await admin.goto(`${adminUrl}/menus`, { waitUntil: "domcontentloaded" });
  const menuVisible = await admin.locator("p.font-semibold", { hasText: "ITEST Menu" }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  record("menu management", menuVisible, menuVisible ? "ITEST Menu is listed" : (await admin.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 180));
  await admin.goto(`${adminUrl}/add-blog`, { waitUntil: "domcontentloaded" });
  const editor = admin.locator("[contenteditable=true], textarea").first();
  await editor.click();
  await editor.fill("ITEST browser article");
  record("blog editor", (await editor.inputValue().catch(async () => editor.innerText())).includes("ITEST browser article"));

  await admin.goto(`${adminUrl}/orders`, { waitUntil: "domcontentloaded" });
  await admin.getByPlaceholder("Search orders...").fill(orderNumber);
  const rowSelect = admin.locator("tr", { hasText: orderNumber }).locator("select");
  await rowSelect.selectOption("Cancelled");
  await admin.getByPlaceholder("Cancellation reason").fill("Synthetic test cancellation");
  const cancelResponse = admin.waitForResponse((response) => response.url().includes("/status") && response.request().method() === "PUT");
  await admin.getByRole("button", { name: "Confirm" }).click();
  const cancelled = await cancelResponse;
  record("order cancellation", cancelled.ok(), `status ${cancelled.status()}`);
  const stockAfter = await (await page.request.get(`${api}/api/products/1`)).json();
  const closingStock = Number(stockAfter.stock_quantity ?? stockAfter.stock ?? stockAfter.product?.stock_quantity);
  record("stock restoration", closingStock === openingStock, `${openingStock} -> ${closingStock}`);
} catch (error) {
  record("browser run", false, error.message.slice(0, 500));
} finally {
  await browser.close();
}

const unexpectedConsole = consoleErrors.filter((line) => !/favicon|Download the React DevTools|requestStorageAccess/i.test(line));
console.log(`console_errors=${unexpectedConsole.length}`);
unexpectedConsole.slice(0, 12).forEach((line) => console.log(`console ${line}`));
console.log(`failed_api=${failedRequests.length}`);
failedRequests.slice(0, 20).forEach((line) => console.log(`api ${line}`));
if (results.some((item) => !item.ok)) process.exit(1);
