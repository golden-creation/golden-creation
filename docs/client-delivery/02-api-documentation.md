# Golden Creation API Documentation

Client: Golden Creation  
Owner: Mr. Ajay Malhotra  
Delivery partner: Natho Asto Global Tech  
Responsible person: Mr. Mridul Dubey

## 1. Base URLs

Production:

- Storefront/API host: `https://goldencreation.in`
- Admin UI host: `https://admin.goldencreation.in`

Local default:

- API: `http://localhost:5000`
- Storefront dev: `http://localhost:5173`
- Admin dev: Vite dev port as configured locally

## 2. Response Format

Successful responses are JSON unless the endpoint streams a file.

Typical success:

```json
{
  "message": "Saved successfully",
  "data": {}
}
```

Typical validation/auth error:

```json
{
  "message": "Authentication is required"
}
```

File download endpoints return binary content with `Content-Disposition: attachment`.

## 3. Authentication

Customer-protected endpoints:

```http
Authorization: Bearer <customer_access_token>
```

Admin-protected endpoints:

```http
Authorization: Bearer <admin_jwt_token>
```

Public write endpoints protected by reCAPTCHA accept one of:

- `recaptchaToken`
- `recaptcha_token`
- `x-recaptcha-token` header

Example:

```json
{
  "email": "customer@example.com",
  "recaptchaToken": "google-recaptcha-token"
}
```

## 4. Public Storefront APIs

### Health

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Service health check. |

### Products

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/products` | Public | Product list/search/filter. |
| `GET` | `/api/products/variant-filters` | Public | Variant filter metadata. |
| `GET` | `/api/products/:id` | Public | Product detail by numeric ID or slug-compatible identifier. |
| `GET` | `/api/products/:id/variants` | Public | Product variant detail. |
| `PUT` | `/api/products/:id/variants` | Internal/Admin expected | Replace/update product variants. |
| `GET` | `/api/products/:id/reviews` | Public | Published product reviews. |
| `POST` | `/api/products/:id/reviews` | Public + reCAPTCHA | Create product review. |
| `POST` | `/api/products` | Internal/Admin expected | Create product. |
| `PUT` | `/api/products/:id` | Internal/Admin expected | Update product. |
| `DELETE` | `/api/products/:id` | Delete approval | Delete product. |

`GET /api/products` query parameters:

| Name | Type | Notes |
| --- | --- | --- |
| `q` / `search` | string | Search product name, SKU, tags where supported. |
| `category` / `category_id` / `categoryId` | number/string | Category filter. |
| `brands` / `brand_id` / `brandId` | number/string/list | Brand filter. |
| `tags` / `tag` | string/list | Tag filter. |
| `sort` | string | Sort mode. |
| `page` | number | Page number. |
| `limit` | number | Page size. |

Product create/update payload:

```json
{
  "name": "Parker Vector Gold Roller Ball Pen",
  "slug": "parker-vector-gold-roller-ball-pen-19432",
  "description": "Product description",
  "price": 450,
  "old_price": 599,
  "category_id": 12,
  "brand_id": 4,
  "sku": "GC-19432",
  "barcode": "8900000000000",
  "stock_quantity": 25,
  "status": "Active",
  "featured": true,
  "gst_inclusive": true,
  "dimension_unit": "cm",
  "length": 12,
  "breadth": 2,
  "height": 1,
  "tags": [1, 2, 3],
  "image": "https://cdn.example/products/main.jpg",
  "images": [
    {
      "url": "https://cdn.example/products/main.jpg",
      "altText": "Parker Vector gold roller ball pen",
      "isPrimary": true,
      "sortOrder": 0
    }
  ],
  "hasVariants": true,
  "variantOptions": [
    { "name": "Color", "values": ["Gold", "Blue"] }
  ],
  "variants": [
    {
      "sku": "GC-19432-GOLD",
      "price": 450,
      "stock": 10,
      "status": "Active",
      "visibility": "Visible",
      "image": "https://cdn.example/products/gold.jpg",
      "dimensions": { "unit": "cm", "length": 12, "breadth": 2, "height": 1 },
      "attributes": { "Color": "Gold" }
    }
  ],
  "meta_title": "Parker Vector Gold Roller Ball Pen",
  "meta_description": "Buy Parker Vector Gold Roller Ball Pen from Golden Creation.",
  "seo_description": "Long SEO description",
  "focus_keyword": "Parker roller ball pen",
  "search_keywords": "pen, roller ball, parker",
  "canonical_url": "",
  "robots_directive": "index,follow",
  "og_image": "https://cdn.example/products/main.jpg",
  "schema_override_json": ""
}
```

Product review payload:

```json
{
  "rating": 5,
  "title": "Excellent product",
  "comment": "Good packaging and quality.",
  "name": "Customer Name",
  "email": "customer@example.com",
  "phone": "9876543210",
  "recaptchaToken": "token"
}
```

### Categories And Brands

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/categories` | Public | Category tree/list. |
| `POST` | `/api/categories` | Internal/Admin expected | Create category. |
| `GET` | `/api/brands` | Public | Brand list. |
| `GET` | `/api/brands/featured` | Public | Featured brands. |
| `GET` | `/api/brands/search?q=` | Public | Brand search. |
| `GET` | `/api/brands/:slug` | Public | Brand detail. |

Category payload:

```json
{
  "name": "Office Stationery",
  "slug": "office-stationery",
  "parent_id": null,
  "description": "Office stationery products",
  "image": "https://cdn.example/categories/office.jpg",
  "status": "Active"
}
```

Brand payload:

```json
{
  "name": "Parker",
  "slug": "parker",
  "description": "Premium writing instruments",
  "logo": "https://cdn.example/brands/parker.png",
  "featured": true,
  "status": "Active"
}
```

### Merchandising

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/tags` | Public | Active tags. |
| `GET` | `/api/tags/:slug/products` | Public | Products by tag. |
| `GET` | `/api/collections` | Public | Active collections. |
| `GET` | `/api/collections/:slug` | Public | Collection detail/products. |
| `GET` | `/api/menus/navbar` | Public | Dynamic navbar menus. |

### Bundles

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/bundles` | Public | Bundle list. |
| `GET` | `/api/bundles/:slug` | Public | Bundle detail. |

### Discounts

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/discounts/validate` | Public | Validate coupon/cart discount. |
| `POST` | `/api/discounts/applicable` | Public | Return applicable discounts. |

Discount validation payload:

```json
{
  "code": "WELCOME10",
  "items": [
    {
      "productId": 19432,
      "variantId": null,
      "quantity": 2,
      "price": 450,
      "categoryId": 12,
      "brandId": 4
    }
  ],
  "customer": {
    "email": "customer@example.com",
    "phone": "9876543210"
  }
}
```

### Checkout And Payments

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/checkout/quote` | Public | Server-authoritative checkout quote. |
| `POST` | `/api/checkout/payments/razorpay/order` | Public | Create Razorpay checkout order. |
| `POST` | `/api/checkout/payments/razorpay/verify` | Public | Verify Razorpay payment signature. |
| `GET` | `/api/checkout/payments/:orderNumber/status` | Public | Payment/order payment status. |
| `POST` | `/api/payments/razorpay/webhook` | Razorpay webhook | Raw body webhook receiver. |

Checkout quote payload:

```json
{
  "items": [
    {
      "productId": 19432,
      "variantId": null,
      "quantity": 1,
      "itemType": "Product"
    }
  ],
  "customer": {
    "firstName": "Amit",
    "lastName": "Yadav",
    "email": "amit@example.com",
    "phone": "9876543210",
    "phoneNumber": "9876543210",
    "streetAddress": "Gurugram address",
    "city": "Gurugram",
    "state": "Haryana",
    "zipCode": "122011"
  },
  "paymentMethod": "Full COD",
  "discountCode": "WELCOME10"
}
```

Quote response:

```json
{
  "quote": {
    "items": [
      {
        "productId": 19432,
        "variantId": null,
        "name": "Parker Vector Gold Roller Ball Pen",
        "itemType": "Product",
        "quantity": 1,
        "price": 450,
        "lineTotal": 450,
        "gstInclusive": true,
        "gstRate": 18,
        "gstAmount": 0
      }
    ],
    "subtotal": 450,
    "discountAmount": 0,
    "discountedSubtotal": 450,
    "shippingFee": 59,
    "shippingRule": { "id": 1, "name": "Standard Shipping" },
    "taxAmount": 0,
    "totalAmount": 509,
    "discountCode": "",
    "paymentOptions": {
      "fullCod": { "enabled": true, "amountOnline": 0, "amountCod": 509 },
      "partialCod": { "enabled": false, "amountOnline": 101.8, "amountCod": 407.2, "percentage": 20 },
      "fullOnline": { "enabled": true, "amountOnline": 509, "amountCod": 0 }
    }
  }
}
```

Razorpay order payload:

```json
{
  "paymentMode": "Full Online",
  "items": [
    { "productId": 19432, "variantId": null, "quantity": 1, "itemType": "Product" }
  ],
  "customer": {
    "firstName": "Amit",
    "email": "amit@example.com",
    "phoneNumber": "9876543210",
    "streetAddress": "Gurugram address",
    "city": "Gurugram",
    "state": "Haryana",
    "zipCode": "122011"
  },
  "discountCode": ""
}
```

Razorpay verification payload:

```json
{
  "razorpay_order_id": "order_xxxxxx",
  "razorpay_payment_id": "pay_xxxxxx",
  "razorpay_signature": "signature"
}
```

### Orders

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/orders` | Public | Create order from quoted cart payload. |
| `GET` | `/api/orders?email=&phone=` | Public/customer lookup | Customer order list. |
| `GET` | `/api/orders/:orderNumber/invoice?email=&phone=` | Public/customer lookup | Download invoice PDF. |

Order create payload is the same base structure as checkout quote, plus any shipping/payment fields required by the UI.

### Customer Account APIs

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/send-otp` | reCAPTCHA | Send customer email OTP. |
| `POST` | `/api/auth/verify-otp` | Public | Verify email OTP and create session. |
| `POST` | `/api/auth/send-otp-mobile` | reCAPTCHA | Send mobile OTP. |
| `POST` | `/api/auth/verify-otp-mobile` | Public | Verify mobile OTP and create session. |
| `GET` | `/api/auth/google` | Public | Start Google OAuth flow. |
| `GET` | `/api/auth/google/callback` | Google redirect | Complete OAuth callback. |
| `POST` | `/api/auth/google/session` | Public | Exchange frontend Google token for session. |
| `POST` | `/api/auth/google/mobile` | Public/mobile | Native Google login with ID token. |
| `GET` | `/api/auth/me` | Customer bearer | Current customer profile. |
| `PUT` | `/api/auth/me` | Customer bearer | Update profile. |
| `DELETE` | `/api/auth/me/image` | Customer bearer | Remove profile image. |
| `POST` | `/api/customer/session/refresh` | Public | Rotate refresh token. |
| `POST` | `/api/customer/session/logout` | Customer bearer | Revoke session. |
| `GET` | `/api/customer/state` | Customer bearer | Cart, wishlist, addresses. |
| `GET` | `/api/customer/cart` | Customer bearer | Cart items. |
| `PUT` | `/api/customer/cart/items/:cartKey` | Customer bearer | Add/update cart item. |
| `DELETE` | `/api/customer/cart/items/:cartKey` | Customer bearer | Remove cart item. |
| `DELETE` | `/api/customer/cart` | Customer bearer | Clear cart. |
| `GET` | `/api/customer/wishlist` | Customer bearer | Wishlist. |
| `PUT` | `/api/customer/wishlist/:productId` | Customer bearer | Add wishlist item. |
| `DELETE` | `/api/customer/wishlist/:productId` | Customer bearer | Remove wishlist item. |
| `GET` | `/api/customer/addresses` | Customer bearer | Address list. |
| `POST` | `/api/customer/addresses` | Customer bearer | Create address. |
| `PUT` | `/api/customer/addresses/:id` | Customer bearer | Update address. |
| `DELETE` | `/api/customer/addresses/:id` | Customer bearer | Delete address. |
| `PUT` | `/api/customer/addresses/:id/default` | Customer bearer | Set default address. |
| `POST` | `/api/customer/media/profile` | Customer bearer multipart | Upload profile image. |
| `POST` | `/api/customer/orders` | Customer bearer | Create order with customer attached. |
| `GET` | `/api/customer/orders` | Customer bearer | Customer orders. |
| `GET` | `/api/customer/orders/:orderNumber/invoice` | Customer bearer | Download invoice. |
| `GET` | `/api/customer/returns` | Customer bearer | Customer returns. |
| `POST` | `/api/customer/returns` | Customer bearer | Create return. |
| `POST` | `/api/customer/products/:id/reviews` | Customer bearer | Create review as logged-in customer. |
| `POST` | `/api/customer/checkout/quote` | Customer bearer | Authenticated quote. |
| `POST` | `/api/customer/checkout/payments/razorpay/order` | Customer bearer | Authenticated Razorpay order. |
| `POST` | `/api/customer/checkout/payments/razorpay/verify` | Customer bearer | Authenticated payment verification. |
| `GET` | `/api/customer/checkout/payments/:orderNumber/status` | Customer bearer | Authenticated payment status. |

OTP payload:

```json
{ "email": "customer@example.com", "recaptchaToken": "token" }
```

OTP verify payload:

```json
{
  "email": "customer@example.com",
  "otp": "123456",
  "deviceName": "Chrome on Windows",
  "deviceId": "optional-device-id"
}
```

Cart item payload:

```json
{
  "itemType": "Product",
  "productId": 19432,
  "variantId": null,
  "name": "Parker Vector Gold Roller Ball Pen",
  "image": "https://cdn.example/product.jpg",
  "category": "Premium Pens",
  "price": 450,
  "oldPrice": 599,
  "quantity": 1,
  "metadata": {}
}
```

Address payload:

```json
{
  "name": "Amit Yadav",
  "tag": "HOME",
  "line1": "House/street",
  "line2": "Landmark",
  "city": "Gurugram",
  "state": "Haryana",
  "postalCode": "122011",
  "phone": "9876543210",
  "isPrimary": true
}
```

### Contact, Corporate, Newsletter, Blog, Returns

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/contact/enquiries` | reCAPTCHA | Contact form lead. |
| `POST` | `/api/corporate/enquiries` | reCAPTCHA | Corporate enquiry. |
| `POST` | `/api/customer/corporate-enquiries` | Customer bearer | Corporate enquiry with customer attached. |
| `POST` | `/api/newsletter/subscribe` | Public | Subscribe. |
| `POST` | `/api/newsletter/unsubscribe` | Public | Unsubscribe. |
| `GET` | `/api/blog` | Public | Blog list. |
| `GET` | `/api/blog/:slug` | Public | Blog detail. |
| `POST` | `/api/returns` | Public | Return request. |
| `GET` | `/api/returns` | Public/query | Return list/status lookup. |

Contact enquiry payload:

```json
{
  "name": "Customer Name",
  "email": "customer@example.com",
  "phone": "9876543210",
  "subject": "Product enquiry",
  "message": "I need details about bulk notebooks.",
  "recaptchaToken": "token"
}
```

Corporate enquiry payload:

```json
{
  "companyName": "ABC Pvt Ltd",
  "contactName": "Amit Yadav",
  "email": "amit@example.com",
  "phone": "9876543210",
  "whatsapp": "9876543210",
  "enquiryType": "Bulk order",
  "budgetRange": "25000-50000",
  "timeline": "This month",
  "products": ["Pens", "Diaries"],
  "message": "Need branded gifting options.",
  "recaptchaToken": "token"
}
```

Newsletter payload:

```json
{ "email": "customer@example.com" }
```

Return request payload:

```json
{
  "orderNumber": "GC-1234567890",
  "email": "customer@example.com",
  "phone": "9876543210",
  "reason": "Damaged item",
  "message": "Package was damaged."
}
```

### Media

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/media/upload` | reCAPTCHA multipart | Public media upload to Spaces. |

Multipart fields:

- `file`: uploaded file.
- `folder`: logical folder, for example `contact`, `products`, `profiles`.
- `ownerType`, `ownerId`: optional reference metadata.
- `altText`, `titleText`, `caption`, `description`, `seoFilename`: optional SEO metadata.

### Content Pages And Reviews

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/content/pages/:slug` | Public | Static page content. |
| `GET` | `/api/google-reviews` | Public | Google review panel data. |

### SEO, Sitemaps, Feeds

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/sitemap.xml` | Public | Sitemap index. |
| `GET` | `/sitemap-static.xml` | Public | Static page sitemap. |
| `GET` | `/sitemap-products-1.xml` | Public | Product sitemap. |
| `GET` | `/sitemap-categories.xml` | Public | Category sitemap. |
| `GET` | `/sitemap-brands.xml` | Public | Brand sitemap. |
| `GET` | `/sitemap-collections.xml` | Public | Collection sitemap. |
| `GET` | `/sitemap-bundles.xml` | Public | Bundle sitemap. |
| `GET` | `/sitemap-blog.xml` | Public | Blog sitemap. |
| `GET` | `/sitemap-images.xml` | Public | Image sitemap. |
| `GET` | `/robots.txt` | Public | Search crawler rules. |
| `GET` | `/llms.txt` | Public | AI-readable site summary. |
| `GET` | `/feeds/google-merchant.xml` | Public | Google Merchant feed. |
| `GET` | `/feeds/meta-catalog.csv` | Public | Meta catalog feed. |

## 5. Admin APIs

All endpoints below are under:

```text
/api/admin
```

Except login and password reset, all require:

```http
Authorization: Bearer <admin_jwt_token>
```

### Admin Login And Security

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/admin/login` | Public | Admin/staff login. |
| `POST` | `/api/admin/login/verify-otp` | Public | Verify 2FA login OTP. |
| `POST` | `/api/admin/password-reset/request` | Public | Send password reset OTP. |
| `POST` | `/api/admin/password-reset/verify` | Public | Verify OTP and set new password. |
| `GET` | `/api/admin/profile` | Admin | Current admin profile. |
| `PUT` | `/api/admin/profile` | Admin | Update profile. |
| `POST` | `/api/admin/profile/upload-image` | Admin multipart | Upload admin/staff profile image. |
| `POST` | `/api/admin/logout` | Admin | Logout/revoke current session. |
| `PUT` | `/api/admin/security/two-factor` | Admin | Enable/disable 2FA. |
| `POST` | `/api/admin/security/request-otp` | Admin | Request security OTP. |
| `POST` | `/api/admin/security/reset-api` | Admin | Reset API access token/key. |
| `POST` | `/api/admin/security/terminate-sessions` | Admin | Terminate other sessions. |
| `PUT` | `/api/admin/security/change-password` | Admin | Change password with OTP. |

Login payload:

```json
{
  "email": "goldencreation@lekhanmart.in",
  "password": "current-password"
}
```

2FA verification payload:

```json
{
  "challengeId": "otp-challenge-id",
  "otp": "123456"
}
```

Password reset request:

```json
{ "email": "goldencreation@lekhanmart.in" }
```

Password reset verify:

```json
{
  "email": "goldencreation@lekhanmart.in",
  "otp": "123456",
  "newPassword": "NewStrongPassword@123"
}
```

Profile update:

```json
{
  "name": "Ajay Malhotra",
  "phone": "+91 87459 35729",
  "location": "Gurugram, India",
  "profileImage": "https://cdn.example/admin/profile.png"
}
```

Change password:

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password",
  "otp": "123456"
}
```

### Dashboard, Search, Notifications

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/dashboard` | Admin | Dashboard metrics. |
| `GET` | `/api/admin/search?q=` | Admin | Global admin search. |
| `GET` | `/api/admin/notifications` | Super Admin | Notifications. |
| `PUT` | `/api/admin/notifications/read` | Super Admin | Mark all read. |
| `PUT` | `/api/admin/notifications/:id/read` | Super Admin | Mark one read. |
| `POST` | `/api/admin/notifications/refresh-low-stock` | Super Admin | Regenerate low-stock notifications. |

### Products, Import, Export, Categories

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/categories` | Admin | Category list. |
| `POST` | `/api/admin/categories` | Admin | Create category. |
| `PUT` | `/api/admin/categories/:id` | Admin | Update category. |
| `DELETE` | `/api/admin/categories/:id` | Delete approval | Delete category. |
| `POST` | `/api/admin/products/import` | Admin | Import product workbook rows. |
| `GET` | `/api/admin/exports/:type` | Admin | Export workbook. |
| `GET` | `/api/admin/lookups/:type` | Admin | Lookup options. |

Export types include module-specific values such as `website-products`, `discounts`, and supported admin workbook types.

Product import payload:

```json
{
  "rows": [
    {
      "ID": 19432,
      "Handle": "parker-vector-gold-roller-ball-pen",
      "Title": "Parker Vector Gold Roller Ball Pen",
      "Variant SKU": "GC-19432",
      "Variant Inventory Qty": 12,
      "Warehouse Stock": 5,
      "Shop Stock": 7,
      "Variant Price": 450,
      "Image Src": "https://example.com/source-image.jpg",
      "Status": "active"
    }
  ]
}
```

Lookup types:

- `products`
- `categories`
- `brands`
- `tags`
- `collections`
- Other supported module lookups returned by backend.

### Brands

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/brands` | Admin | Brand list. |
| `POST` | `/api/admin/brands` | Admin | Create brand. |
| `GET` | `/api/admin/brands/:id` | Admin | Brand detail. |
| `PUT` | `/api/admin/brands/:id` | Admin | Update brand. |
| `PATCH` | `/api/admin/brands/:id/status` | Admin | Update status. |
| `PATCH` | `/api/admin/brands/:id/featured` | Admin | Update featured flag. |
| `DELETE` | `/api/admin/brands/:id` | Delete approval | Delete brand. |
| `PUT` | `/api/admin/brands/:id/restore` | Admin | Restore brand. |

Status payload:

```json
{ "status": "Active" }
```

Featured payload:

```json
{ "featured": true }
```

### Tags And Collections

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/tags` | Admin | Tag list. |
| `POST` | `/api/admin/tags` | Admin | Create tag. |
| `PUT` | `/api/admin/tags/:id` | Admin | Update tag. |
| `PATCH` | `/api/admin/tags/:id/status` | Admin | Update tag status. |
| `DELETE` | `/api/admin/tags/:id` | Delete approval | Delete tag. |
| `POST` | `/api/admin/tags/bulk-delete` | Delete approval | Bulk delete tags. |
| `GET` | `/api/admin/collections` | Admin | Collection list. |
| `POST` | `/api/admin/collections/preview` | Admin | Preview rule-based collection. |
| `POST` | `/api/admin/collections` | Admin | Create collection. |
| `GET` | `/api/admin/collections/:id` | Admin | Collection detail. |
| `PUT` | `/api/admin/collections/:id` | Admin | Update collection. |
| `PATCH` | `/api/admin/collections/:id/status` | Admin | Update collection status. |
| `DELETE` | `/api/admin/collections/:id` | Delete approval | Delete collection. |

Tag payload:

```json
{ "name": "Trending Items", "slug": "trending-items", "status": "Active" }
```

Collection payload:

```json
{
  "name": "Best Sellers",
  "slug": "best-sellers",
  "description": "Popular products",
  "status": "Active",
  "type": "Manual",
  "productIds": [19432, 19433],
  "rules": []
}
```

### Menus

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/menus` | Admin | Menu list. |
| `GET` | `/api/admin/menus/references` | Admin | Linkable categories/brands/collections. |
| `POST` | `/api/admin/menus` | Admin | Create menu. |
| `PUT` | `/api/admin/menus/reorder` | Admin | Reorder menus. |
| `PUT` | `/api/admin/menus/:id` | Admin | Update menu. |
| `POST` | `/api/admin/menus/:id/duplicate` | Admin | Duplicate menu. |
| `DELETE` | `/api/admin/menus/:id` | Delete approval | Delete menu. |

Menu payload:

```json
{
  "label": "Premium Pens",
  "type": "category",
  "href": "/category/premium-pens",
  "referenceId": 12,
  "parentId": null,
  "sortOrder": 1,
  "status": "Active",
  "image": "https://cdn.example/menu/pens.jpg"
}
```

### Inventory, Warehouse, Shop

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/inventory` | Admin | Legacy inventory summary. |
| `GET` | `/api/admin/inventory/catalog` | Admin | Unified catalog stock list. |
| `GET` | `/api/admin/inventory/products/:id/stock` | Admin | Product stock detail/audit. |
| `PUT` | `/api/admin/inventory/products/:id/stock` | Admin | Update website/warehouse/shop stock. |
| `GET` | `/api/admin/warehouse` | Admin | Warehouse dashboard/data. |
| `POST` | `/api/admin/warehouse/products` | Admin | Create warehouse product. |
| `POST` | `/api/admin/warehouse/stock` | Admin | Create/update warehouse stock. |
| `POST` | `/api/admin/warehouse/movements` | Admin | Create stock movement. |
| `PUT` | `/api/admin/warehouse/movements/:id/approval` | Admin | Approve movement. |
| `GET` | `/api/admin/catalogs/:catalog` | Admin | Operational catalog by `warehouse` or `store`. |
| `POST` | `/api/admin/catalogs/warehouse/products` | Admin | Save warehouse catalog product data. |
| `POST` | `/api/admin/catalogs/store/products` | Admin | Save shop catalog product data. |
| `POST` | `/api/admin/catalogs/store/import` | Admin | Import shop catalog rows. |
| `POST` | `/api/admin/catalogs/:catalog/stock` | Admin | Save operational stock. |
| `POST` | `/api/admin/catalogs/:catalog/movements` | Admin | Create operational stock movement. |
| `PUT` | `/api/admin/catalogs/:catalog/movements/:id/approval` | Super Admin | Approve operational movement. |

Inventory catalog query:

| Name | Type | Notes |
| --- | --- | --- |
| `catalog` | `website` / `warehouse` / `shop` | Selected tab. |
| `q` | string | Search. |
| `categoryId` | number | Category filter. |
| `brandId` | number | Brand filter. |
| `stockStatus` | string | `all`, `balanced`, `mismatched`, `zero`, `low`, `in_stock`. |
| `page` | number | Page number. |
| `limit` | number | Page size. |

Stock update payload:

```json
{
  "bucket": "website",
  "mode": "set",
  "quantity": 12,
  "reorderLevel": 0,
  "reason": "Physical stock count correction"
}
```

Other modes:

```json
{ "bucket": "warehouse", "mode": "increase", "quantity": 5, "reason": "New stock received" }
```

```json
{ "bucket": "shop", "mode": "decrease", "quantity": 2, "reason": "Manual correction" }
```

Movement payload:

```json
{
  "productId": 19432,
  "quantity": 10,
  "movementType": "inward",
  "source": "supplier",
  "destination": "warehouse",
  "notes": "Stock received"
}
```

### Orders, Returns, Shipping, Payments

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/orders` | Admin | Order list. |
| `POST` | `/api/admin/orders` | Admin | Create admin order. |
| `GET` | `/api/admin/orders/:id` | Admin | Order detail. |
| `PUT` | `/api/admin/orders/:id/status` | Admin | Update order status. |
| `PUT` | `/api/admin/orders/:id/shipment` | Admin | Update shipment details. |
| `PUT` | `/api/admin/orders/:id/cod-collected` | Admin | Mark COD balance collected. |
| `GET` | `/api/admin/returns` | Admin | Returns list. |
| `POST` | `/api/admin/returns` | Admin | Create return request. |
| `PUT` | `/api/admin/returns/:id` | Admin | Update return request. |
| `GET` | `/api/admin/shipping` | Admin | Shipping rules/settings. |
| `POST` | `/api/admin/shipping/rules` | Admin | Create shipping rule. |
| `PUT` | `/api/admin/shipping/rules/:id` | Admin | Update shipping rule. |
| `DELETE` | `/api/admin/shipping/rules/:id` | Delete approval | Delete shipping rule. |
| `GET` | `/api/admin/payments` | Admin | Payment dashboard. |
| `GET` | `/api/admin/payment-settings` | Admin | Payment settings. |
| `PUT` | `/api/admin/payment-settings` | Admin | Update payment settings. |
| `POST` | `/api/admin/payment-settings/partial-cod-rules` | Admin | Save partial COD override rule. |
| `DELETE` | `/api/admin/payment-settings/partial-cod-rules/:id` | Delete approval | Delete partial COD rule. |
| `PUT` | `/api/admin/payments/gst-return/:id` | Admin | Update GST return payment status. |

Order status payload:

```json
{
  "status": "Dispatched",
  "remarks": "Packed and shipped",
  "fulfillmentStockSource": "warehouse"
}
```

Shipment payload:

```json
{
  "carrier": "Standard Express",
  "trackingId": "GC-40726915414",
  "trackingUrl": "https://tracking.example/GC-40726915414",
  "dispatchedAt": "2026-09-10T10:00:00.000Z",
  "expectedDeliveryAt": "2026-09-14T10:00:00.000Z"
}
```

Shipping rule payload:

```json
{
  "name": "Free Shipping Above 999",
  "priority": 10,
  "method": "standard",
  "fee": 0,
  "minimumOrderAmount": 999,
  "status": "Active",
  "targets": [
    { "targetType": "global", "targetId": null }
  ],
  "locations": [
    { "locationType": "all_india", "locationValue": "" }
  ]
}
```

Payment settings payload:

```json
{
  "fullOnlineEnabled": true,
  "fullCodEnabled": true,
  "partialCodEnabled": true,
  "partialCodDefaultPercentage": 20,
  "razorpayEnabled": true
}
```

Partial COD rule payload:

```json
{
  "targetType": "product",
  "targetId": 19432,
  "percentage": 30,
  "status": "Active"
}
```

### Discounts

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/discounts` | Admin | Discount list. |
| `GET` | `/api/admin/discounts/export` | Admin | Export discounts workbook. |
| `GET` | `/api/admin/discounts/analytics` | Admin | Discount usage analytics. |
| `POST` | `/api/admin/discounts` | Admin | Create discount. |
| `GET` | `/api/admin/discounts/:id` | Admin | Discount detail. |
| `PUT` | `/api/admin/discounts/:id` | Admin | Update discount. |
| `PATCH` | `/api/admin/discounts/:id/status` | Admin | Update status. |
| `POST` | `/api/admin/discounts/:id/duplicate` | Admin | Duplicate discount. |
| `DELETE` | `/api/admin/discounts/:id` | Delete approval | Delete discount. |

Discount payload:

```json
{
  "name": "Welcome 10",
  "code": "WELCOME10",
  "type": "percentage",
  "value": 10,
  "method": "coupon",
  "startsAt": "2026-09-10T00:00:00.000Z",
  "endsAt": "2026-12-31T23:59:59.000Z",
  "status": "Active",
  "usageLimit": 1000,
  "perCustomerLimit": 1,
  "conditions": [
    { "field": "minimum_order_amount", "operator": ">=", "value": 999 }
  ]
}
```

### Staff, Roles, Customers, Activity

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/roles` | Admin | Roles list. |
| `POST` | `/api/admin/roles` | Admin | Create role. |
| `GET` | `/api/admin/staff` | Admin | Staff list. |
| `POST` | `/api/admin/staff` | Admin | Create staff. |
| `GET` | `/api/admin/staff/:id` | Admin | Staff profile. |
| `PUT` | `/api/admin/staff/:id` | Admin | Update staff. |
| `DELETE` | `/api/admin/staff/:id` | Delete approval | Delete staff. |
| `GET` | `/api/admin/activity` | Super Admin | Activity log. |
| `GET` | `/api/admin/customers` | Admin | Customer list. |
| `POST` | `/api/admin/customers` | Admin | Create customer. |
| `GET` | `/api/admin/customers/:id` | Admin | Customer detail. |
| `DELETE` | `/api/admin/customers/:id` | Delete approval | Delete customer. |

Staff payload:

```json
{
  "name": "Staff Name",
  "email": "staff@goldencreation.in",
  "phone": "9876543210",
  "role": "Admin",
  "password": "StrongPassword@123",
  "status": "Active",
  "permissions": ["dashboard", "products", "inventory"]
}
```

Role payload:

```json
{
  "name": "Inventory Manager",
  "permissions": ["dashboard", "products", "inventory", "warehouse"]
}
```

### Lead And Sales Catalog Management

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/salesmen` | Admin | Salesman lookup. |
| `GET` | `/api/admin/leads` | Admin | Leads list. |
| `GET` | `/api/admin/leads/export` | Admin | Export leads workbook. |
| `POST` | `/api/admin/leads` | Admin | Create lead. |
| `GET` | `/api/admin/leads/:id` | Admin | Lead detail. |
| `PUT` | `/api/admin/leads/:id` | Admin | Update lead. |
| `GET` | `/api/admin/sales-catalog-products` | Admin | Product search for catalogs. |
| `GET` | `/api/admin/sales-catalogs` | Admin | Sales catalog list. |
| `POST` | `/api/admin/sales-catalogs` | Admin | Create catalog. |
| `GET` | `/api/admin/sales-catalogs/:id` | Admin | Catalog detail. |
| `PUT` | `/api/admin/sales-catalogs/:id` | Admin | Update catalog. |
| `POST` | `/api/admin/sales-catalogs/:id/duplicate` | Admin | Duplicate catalog. |
| `POST` | `/api/admin/sales-catalogs/:id/generate` | Admin | Generate PDF. |
| `GET` | `/api/admin/sales-catalogs/:id/download` | Admin | Download PDF. |
| `POST` | `/api/admin/sales-catalogs/:id/archive` | Admin | Archive catalog. |
| `DELETE` | `/api/admin/sales-catalogs/:id` | Delete approval | Delete catalog. |
| `POST` | `/api/admin/sales-catalogs/:id/share` | Admin | Record catalog share. |
| `GET` | `/api/catalogs/share/:token` | Public token | Stream shared catalog PDF. |

Lead payload:

```json
{
  "leadName": "ABC Stationery Buyer",
  "leadSource": "IndiaMART",
  "meetingAt": "2026-09-15T10:00:00.000Z",
  "place": "Gurugram",
  "companyName": "ABC Pvt Ltd",
  "contactPerson": "Amit",
  "phone": "9876543210",
  "whatsapp": "9876543210",
  "email": "amit@example.com",
  "notes": "Interested in corporate gifting",
  "status": "New",
  "ownerId": null
}
```

Sales catalog payload:

```json
{
  "name": "Corporate Pens Catalog",
  "leadId": 12,
  "status": "Draft",
  "products": [
    { "productId": 19432, "variantId": null, "quantity": 1, "sortOrder": 1 }
  ],
  "notes": "Shared after first call"
}
```

### Media, Drive, SEO

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/admin/media/upload` | Admin multipart | Upload media to Spaces. |
| `POST` | `/api/admin/media/video-upload-url` | Admin | Create signed video upload URL. |
| `POST` | `/api/admin/media/video-upload-complete` | Admin | Register uploaded video. |
| `DELETE` | `/api/admin/media` | Delete approval | Delete media reference/object safely. |
| `GET` | `/api/admin/media/migration` | Admin | Remote media migration report. |
| `POST` | `/api/admin/media/migration/run` | Admin | Run media migration batch. |
| `GET` | `/api/admin/drive` | Admin | Drive files/folders. |
| `POST` | `/api/admin/drive/folders` | Admin | Create folder. |
| `PUT` | `/api/admin/drive/folders/:id` | Admin | Update folder. |
| `DELETE` | `/api/admin/drive/folders/:id` | Delete approval/admin | Delete folder. |
| `POST` | `/api/admin/drive/files` | Admin multipart | Upload drive file. |
| `PUT` | `/api/admin/drive/files/:id` | Admin | Update file metadata/move. |
| `DELETE` | `/api/admin/drive/files/:id` | Delete approval/admin | Delete file. |
| `GET` | `/api/admin/seo/settings` | Admin | SEO settings. |
| `PUT` | `/api/admin/seo/settings` | Super Admin | Update SEO settings. |
| `GET` | `/api/admin/seo/scripts` | Admin | Script list. |
| `POST` | `/api/admin/seo/scripts` | Super Admin | Create script/meta injection. |
| `PUT` | `/api/admin/seo/scripts/:id` | Super Admin | Update script/meta injection. |
| `DELETE` | `/api/admin/seo/scripts/:id` | Super Admin | Delete script. |
| `GET` | `/api/admin/seo/products/:id` | Admin | Product SEO detail. |
| `PUT` | `/api/admin/seo/products/:id` | Admin | Update product SEO. |
| `GET` | `/api/admin/seo/blogs/:id` | Admin | Blog SEO detail. |
| `PUT` | `/api/admin/seo/blogs/:id` | Admin | Update blog SEO. |
| `GET` | `/api/admin/seo/media/:id` | Admin | Media SEO detail. |
| `PUT` | `/api/admin/seo/media/:id` | Admin | Update media SEO. |
| `GET` | `/api/admin/seo/audit` | Admin | SEO audit counts. |
| `GET` | `/api/admin/seo/feed-status` | Admin | Feed URLs/counts. |

Signed video upload URL payload:

```json
{
  "fileName": "blog-video.mp4",
  "mimeType": "video/mp4",
  "folder": "blog-videos"
}
```

SEO settings payload:

```json
{
  "site_title": "Golden Creation",
  "default_meta_title": "Golden Creation | Office Stationery & Gift Items",
  "default_meta_description": "Shop office stationery, art supplies, premium pens, and corporate gifts.",
  "canonical_base_url": "https://goldencreation.in",
  "default_social_image": "https://cdn.example/social.jpg",
  "search_console_verification": "verification-token",
  "gtm_container_id": "GTM-XXXXXXX",
  "ga4_measurement_id": "G-XXXXXXXXXX",
  "google_ads_conversion_id": "AW-XXXXXXXXX",
  "google_ads_purchase_label": "purchase-label",
  "google_merchant_center_id": "merchant-id",
  "meta_pixel_id": "pixel-id",
  "meta_capi_dataset_id": "dataset-id",
  "meta_catalog_id": "catalog-id",
  "allow_ai_crawlers": "true"
}
```

SEO script payload:

```json
{
  "name": "Google Ads verification tag",
  "slot": "global_head",
  "content": "<meta name=\"google-site-verification\" content=\"...\">",
  "status": "Active"
}
```

Allowed slots include:

- `global_head`
- `body_start`
- `home`
- `product`
- `category`
- `collection`
- `brand`
- `blog`
- `checkout`
- `order_success`

Product SEO payload:

```json
{
  "slug": "parker-vector-gold-roller-ball-pen-19432",
  "metaTitle": "Parker Vector Gold Roller Ball Pen",
  "metaDescription": "Buy Parker Vector Gold Roller Ball Pen from Golden Creation.",
  "seoDescription": "Detailed SEO copy.",
  "focusKeyword": "Parker roller ball pen",
  "searchKeywords": "parker, pen, roller ball",
  "canonicalUrl": "",
  "robotsDirective": "index,follow",
  "ogImage": "https://cdn.example/product.jpg",
  "schemaOverrideJson": "",
  "images": [
    { "id": 1, "altText": "Parker Vector Gold Roller Ball Pen product image" }
  ]
}
```

Drive folder payload:

```json
{
  "name": "Catalog PDFs",
  "parentId": null
}
```

Drive file update payload:

```json
{
  "name": "September Catalog.pdf",
  "folderId": 5,
  "description": "Updated catalog file"
}
```

### Store Settings, Tax, Blog, Billing, Suppliers

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/store-settings` | Admin | Store settings. |
| `PUT` | `/api/admin/store-settings/:key` | Admin | Update setting. |
| `GET` | `/api/admin/tax-rules` | Admin | Category GST rules. |
| `POST` | `/api/admin/tax-rules` | Admin | Create GST rule. |
| `PUT` | `/api/admin/tax-rules/:id` | Admin | Update GST rule. |
| `DELETE` | `/api/admin/tax-rules/:id` | Delete approval | Delete GST rule. |
| `GET` | `/api/store/tax-rules` | Public | Public/store tax rules. |
| `GET` | `/api/admin/blog` | Admin | Blog list. |
| `POST` | `/api/admin/blog` | Admin | Create blog. |
| `PUT` | `/api/admin/blog/:id` | Admin | Update blog. |
| `DELETE` | `/api/admin/blog/:id` | Delete approval | Delete blog. |
| `GET` | `/api/admin/billing` | Admin | Billing data. |
| `POST` | `/api/admin/billing` | Admin | Create bill. |
| `POST` | `/api/admin/billing/:id/send` | Admin | Send bill by configured channel. |
| `GET` | `/api/admin/billing/:id/pdf` | Admin | Download Performa Invoice PDF. |
| `GET` | `/api/admin/suppliers` | Admin | Supplier list/data. |
| `POST` | `/api/admin/suppliers` | Admin | Create supplier. |
| `PUT` | `/api/admin/suppliers/:id` | Admin | Update supplier. |
| `DELETE` | `/api/admin/suppliers/:id` | Delete approval | Delete supplier. |
| `GET` | `/api/admin/reports` | Admin | Reports data. |
| `GET` | `/api/admin/godowns` | Admin | Godown list. |
| `GET` | `/api/admin/hr` | Admin | HR summary. |
| `GET` | `/api/admin/newsletter` | Admin | Newsletter subscribers. |
| `PUT` | `/api/admin/newsletter/:id` | Admin | Update subscriber. |
| `GET` | `/api/admin/contact-enquiries` | Admin | Contact enquiries. |
| `PATCH` | `/api/admin/contact-enquiries/:id` | Admin | Update enquiry status/notes. |
| `GET` | `/api/admin/corporate-enquiries` | Admin | Corporate enquiries. |
| `GET` | `/api/admin/corporate-enquiries/:id` | Admin | Corporate enquiry detail. |
| `PUT` | `/api/admin/corporate-enquiries/:id` | Admin | Update corporate enquiry. |
| `GET` | `/api/admin/removal-requests` | Super Admin | Removal requests. |
| `PUT` | `/api/admin/removal-requests/:id/decision` | Super Admin | Approve/reject deletion. |

Tax rule payload:

```json
{
  "categoryId": 12,
  "taxName": "GST",
  "taxRate": 18,
  "status": "Active"
}
```

Blog payload:

```json
{
  "slug": "best-office-stationery-for-work",
  "title": "Best Office Stationery for Work",
  "excerpt": "Short summary",
  "content": "<p>Rich HTML content</p>",
  "coverImage": "https://cdn.example/blog/cover.jpg",
  "featuredMediaType": "image",
  "featuredVideoUrl": "",
  "videoPoster": "",
  "mediaGallery": [],
  "category": "Guides",
  "tags": ["office", "stationery"],
  "featured": true,
  "status": "Published",
  "author": "Golden Creation",
  "publishedAt": "2026-09-10T00:00:00.000Z",
  "metaTitle": "Best Office Stationery for Work",
  "metaDescription": "A guide to useful office stationery products.",
  "canonicalUrl": "",
  "robotsDirective": "index,follow",
  "ogImage": "https://cdn.example/blog/cover.jpg",
  "focusKeyword": "office stationery",
  "schemaOverrideJson": ""
}
```

Billing payload:

```json
{
  "customerName": "ABC Pvt Ltd",
  "customerPhone": "9876543210",
  "customerEmail": "accounts@abc.com",
  "billingAddress": "Gurugram, Haryana",
  "gstin": "06XXXXXXXXXXXXX",
  "items": [
    {
      "description": "Flair Ball Pen 3mm",
      "hsnSac": "9608",
      "quantity": 1,
      "unit": "Pcs.",
      "listPrice": 100,
      "discount": 0,
      "gstInclusive": true,
      "cgstRate": 0,
      "sgstRate": 0,
      "amount": 100
    }
  ],
  "notes": "Optional notes"
}
```

Removal decision payload:

```json
{
  "decision": "approved",
  "remarks": "Approved by Super Admin"
}
```

Use `rejected` for rejection.

## 6. File Upload Contract

Multipart upload endpoints use:

```http
Content-Type: multipart/form-data
Authorization: Bearer <token when protected>
```

Fields:

- `file`: required binary file.
- `folder`: logical destination folder.
- `ownerType`: optional entity owner.
- `ownerId`: optional owner ID.
- `altText`: optional image alt text.
- `titleText`: optional title.
- `caption`: optional caption.
- `description`: optional description.
- `seoFilename`: optional SEO-safe file name.

## 7. Webhook Contract

Razorpay webhook:

```http
POST /api/payments/razorpay/webhook
Content-Type: application/json
X-Razorpay-Signature: <signature>
X-Razorpay-Event-Id: <event-id>
```

Important:

- Raw body is required for signature verification.
- Duplicate webhook event IDs are recorded and ignored idempotently.
- Supported payment success/failure events update payment ledger and order state.

