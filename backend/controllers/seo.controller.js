import {
  buildGoogleMerchantFeed,
  buildLlmsTxt,
  buildMetaCatalogFeed,
  buildRobotsTxt,
  buildSitemap,
} from "../services/seo.service.js";

function sendXml(res, xml, maxAge = 900) {
  res.set({
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": `public, max-age=${maxAge}`,
  });
  res.send(xml);
}

export async function getSitemap(req, res) {
  sendXml(res, await buildSitemap(req, "index"));
}

export async function getStaticSitemap(req, res) {
  sendXml(res, await buildSitemap(req, "static"));
}

export async function getProductSitemap(req, res) {
  sendXml(res, await buildSitemap(req, "products"));
}

export async function getCategorySitemap(req, res) {
  sendXml(res, await buildSitemap(req, "categories"));
}

export async function getBrandSitemap(req, res) {
  sendXml(res, await buildSitemap(req, "brands"));
}

export async function getCollectionSitemap(req, res) {
  sendXml(res, await buildSitemap(req, "collections"));
}

export async function getBundleSitemap(req, res) {
  sendXml(res, await buildSitemap(req, "bundles"));
}

export async function getBlogSitemap(req, res) {
  sendXml(res, await buildSitemap(req, "blog"));
}

export async function getImageSitemap(req, res) {
  sendXml(res, await buildSitemap(req, "images"));
}

export async function getRobotsTxt(req, res) {
  res.set({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=900",
  });
  res.send(await buildRobotsTxt(req));
}

export async function getLlmsTxt(req, res) {
  res.set({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
  res.send(await buildLlmsTxt(req));
}

export async function getGoogleMerchantFeed(req, res) {
  sendXml(res, await buildGoogleMerchantFeed(req), 900);
}

export async function getMetaCatalogFeed(req, res) {
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Cache-Control": "public, max-age=900",
  });
  res.send(await buildMetaCatalogFeed(req));
}
