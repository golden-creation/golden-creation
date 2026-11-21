export const mockCategories = [
  { id: 1, name: "Writing Essentials" },
  { id: 2, name: "Notebooks & Diaries" },
  { id: 3, name: "Office Supplies" },
  { id: 4, name: "Art & Craft" },
  { id: 5, name: "Premium Pens" },
  { id: 6, name: "School Stationery" },
  { id: 7, name: "Desk Accessories" },
  { id: 8, name: "Corporate Gifting" },
];

export const mockProducts = [
  {
    id: 1,
    name: "Parker Sonnet Fountain Pen",
    description: "Premium fountain pen for signatures, journaling, and daily writing.",
    price: 12499,
    category_id: 1,
    category_name: "Writing Essentials",
    image: "pen1.jpg",
    images: ["pen1.jpg", "pen2.jpeg", "pen3.jpeg"],
  },
  {
    id: 2,
    name: "Midori MD Notebook A5",
    description: "Minimal notebook with fountain-pen-friendly paper.",
    price: 2499,
    category_id: 2,
    category_name: "Notebooks & Diaries",
    image: "pen2.jpeg",
    images: ["pen2.jpeg", "pen1.jpg"],
  },
  {
    id: 3,
    name: "Executive Desk Planner",
    description: "A clean weekly planner designed for office and study workflows.",
    price: 1899,
    category_id: 3,
    category_name: "Office Supplies",
    image: "pen3.jpeg",
    images: ["pen3.jpeg", "pen1.jpg"],
  },
  {
    id: 4,
    name: "Calligraphy Practice Set",
    description: "Starter kit with nibs, ink, and premium sheets for lettering.",
    price: 3299,
    category_id: 4,
    category_name: "Art & Craft",
    image: "pen1.jpg",
    images: ["pen1.jpg", "pen3.jpeg"],
  },
  {
    id: 5,
    name: "Luxury Rollerball Pen",
    description: "Smooth premium rollerball pen with a balanced metal body.",
    price: 8999,
    category_id: 5,
    category_name: "Premium Pens",
    image: "pen2.jpeg",
    images: ["pen2.jpeg", "pen3.jpeg"],
  },
  {
    id: 6,
    name: "Student Success Kit",
    description: "A bundled set of pens, notebook, markers, and sticky notes.",
    price: 1599,
    category_id: 6,
    category_name: "School Stationery",
    image: "pen3.jpeg",
    images: ["pen3.jpeg", "pen2.jpeg"],
  },
  {
    id: 7,
    name: "Brass Desk Organizer",
    description: "Compact organizer for pens, clips, and cards.",
    price: 2799,
    category_id: 7,
    category_name: "Desk Accessories",
    image: "pen1.jpg",
    images: ["pen1.jpg", "pen2.jpeg"],
  },
  {
    id: 8,
    name: "Corporate Gift Hamper",
    description: "Premium stationery hamper for client gifting and teams.",
    price: 5499,
    category_id: 8,
    category_name: "Corporate Gifting",
    image: "pen2.jpeg",
    images: ["pen2.jpeg", "pen1.jpg"],
  },
  {
    id: 9,
    name: "Sketch and Write Bundle",
    description: "Mixed creativity kit with pencils, pens, and sketch sheets.",
    price: 2199,
    category_id: 4,
    category_name: "Art & Craft",
    image: "pen3.jpeg",
    images: ["pen3.jpeg", "pen1.jpg"],
  },
];

let nextProductId =
  mockProducts.reduce(
    (maxProductId, product) => Math.max(maxProductId, Number(product.id) || 0),
    0
  ) + 1;

let nextUserId = 1000;
const mockUsers = new Map();

function normaliseKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function getMockProducts(categoryId) {
  if (!categoryId) {
    return mockProducts;
  }

  return mockProducts.filter((product) => Number(product.category_id) === Number(categoryId));
}

export function getMockProductById(id) {
  return mockProducts.find((product) => Number(product.id) === Number(id)) || null;
}

export function createMockProduct(data) {
  const category = mockCategories.find(
    (item) => Number(item.id) === Number(data.category_id)
  );

  const image = data.image || "pen1.jpg";
  const product = {
    id: nextProductId++,
    name: data.name,
    description: data.description || "",
    price: Number(data.price),
    category_id: Number(data.category_id),
    category_name: category?.name || "Uncategorized",
    image,
    images: data.images?.length ? data.images : [image],
  };

  mockProducts.unshift(product);
  return product;
}

export function updateMockProduct(id, changes) {
  const product = getMockProductById(id);

  if (!product) {
    return null;
  }

  if (changes.category_id) {
    const category = mockCategories.find(
      (item) => Number(item.id) === Number(changes.category_id)
    );
    product.category_name = category?.name || product.category_name;
    product.category_id = Number(changes.category_id);
  }

  if (changes.name !== undefined) {
    product.name = changes.name;
  }

  if (changes.description !== undefined) {
    product.description = changes.description || "";
  }

  if (changes.price !== undefined) {
    product.price = Number(changes.price);
  }

  if (changes.image !== undefined) {
    product.image = changes.image || product.image;
  }

  if (changes.images?.length) {
    product.images = changes.images;
  } else if (!product.images?.length && product.image) {
    product.images = [product.image];
  }

  return product;
}

export function deleteMockProduct(id) {
  const index = mockProducts.findIndex((product) => Number(product.id) === Number(id));

  if (index === -1) {
    return null;
  }

  const [deletedProduct] = mockProducts.splice(index, 1);
  return deletedProduct;
}

export function upsertMockEmailOtp(email, otp) {
  const key = `email:${normaliseKey(email)}`;
  const existing = mockUsers.get(key);

  if (existing) {
    existing.otp = otp;
    existing.is_verified = false;
    return existing;
  }

  const user = {
    id: nextUserId++,
    name: "User",
    email,
    phone: null,
    otp,
    is_verified: false,
  };

  mockUsers.set(key, user);
  return user;
}

export function verifyMockEmailOtp(email, otp) {
  const key = `email:${normaliseKey(email)}`;
  const user = mockUsers.get(key);

  if (!user) {
    return { error: "User not found", status: 404 };
  }

  if (user.otp !== otp) {
    return { error: "Invalid OTP", status: 400 };
  }

  user.is_verified = true;
  user.otp = null;
  return { user };
}

export function upsertMockPhoneOtp(phone, otp) {
  const key = `phone:${normaliseKey(phone)}`;
  const existing = mockUsers.get(key);

  if (existing) {
    existing.otp = otp;
    existing.is_verified = false;
    return existing;
  }

  const user = {
    id: nextUserId++,
    name: "User",
    email: null,
    phone,
    otp,
    is_verified: false,
  };

  mockUsers.set(key, user);
  return user;
}

export function verifyMockPhoneOtp(phone, otp) {
  const key = `phone:${normaliseKey(phone)}`;
  const user = mockUsers.get(key);

  if (!user) {
    return { error: "User not found", status: 404 };
  }

  if (user.otp !== otp) {
    return { error: "Invalid OTP", status: 400 };
  }

  user.is_verified = true;
  user.otp = null;
  return { user };
}

export function findMockUser({ email, phone }) {
  if (email) {
    const emailUser = mockUsers.get(`email:${normaliseKey(email)}`);

    if (emailUser) {
      return emailUser;
    }
  }

  if (phone) {
    const phoneUser = mockUsers.get(`phone:${normaliseKey(phone)}`);

    if (phoneUser) {
      return phoneUser;
    }
  }

  return null;
}

export function updateMockUser({ id, name, email, phone }) {
  const user = [...mockUsers.values()].find(
    (item) => Number(item.id) === Number(id)
  );

  if (!user) {
    return null;
  }

  if (name !== undefined) {
    user.name = name;
  }

  if (email !== undefined) {
    user.email = email;
  }

  if (phone !== undefined) {
    user.phone = phone;
  }

  return user;
}

export const mockAdminProfile = {
  id: 1,
  name: "Alex Silva",
  roleTitle: "Senior Solutions Architect",
  email: "alex@email.com",
  phone: "+1 234 567 890",
  location: "California, USA",
  username: "asilva_admin",
  systemRole: "Lead Administrator",
  memberSince: "Oct 2021",
  securityScore: 98,
  lastActivity: "2h ago",
  activeTag: "verified",
  status: "Active",
  badge: "System Verified",
};

export const mockProfileActivities = [
  {
    id: 1,
    title: "Successful login from MacBook - Safari",
    time: "2 hrs ago",
    location: "San Francisco, US",
  },
  {
    id: 2,
    title: "Profile information updated",
    time: "Yesterday",
    location: "Remote Web App",
  },
  {
    id: 3,
    title: "Unusual Login Attempt Blocked",
    time: "3 days ago",
    location: "Stockholm, SE",
  },
  {
    id: 4,
    title: "New API Key Generated",
    time: "Last week",
    location: "Admin Console",
  },
];

export const mockAdminOrders = [
  {
    id: "GC-9284",
    customer: "Eleanor Vance",
    product: "Gilded Monogram Stationery Set",
    date: "Oct 24, 2023",
    amount: 1250,
    status: "Delivered",
  },
  {
    id: "GC-9285",
    customer: "Julian Thorne",
    product: "Bespoke Wax Seal Kit (Gold Leaf)",
    date: "Oct 24, 2023",
    amount: 420,
    status: "Pending",
  },
  {
    id: "GC-9286",
    customer: "Sophia Chen",
    product: "Hand-Bound Leather Artist Journal",
    date: "Oct 23, 2023",
    amount: 850,
    status: "Delivered",
  },
  {
    id: "GC-9287",
    customer: "Marcus Sterling",
    product: "Limited Edition Platinum Fountain Pen",
    date: "Oct 22, 2023",
    amount: 3400,
    status: "Cancelled",
  },
  {
    id: "GC-9288",
    customer: "Isabella Rossi",
    product: "Velvet Gift Wrapping Master Collection",
    date: "Oct 22, 2023",
    amount: 680,
    status: "Pending",
  },
];

export const mockBlogPosts = [
  {
    id: 1,
    title: "How to Scale Your SaaS Infrastructure in 2024",
    desc: "Scaling isn't just about adding more servers. It's about optimizing your architecture for resilience and growth.",
    author: "Sarah Chen",
    date: "Oct 12, 2024",
    category: "Tech",
  },
  {
    id: 2,
    title: "Mastering the Art of Customer Retention for SaaS",
    desc: "Churn is the silent killer of SaaS. Learn the psychological triggers that keep customers engaged.",
    author: "Marcus Thorne",
    date: "Oct 12, 2024",
    category: "SaaS",
  },
  {
    id: 3,
    title: "The Shift Towards Product-Led Growth in Sales",
    desc: "Sales-led growth is facing challenges. Explore why giants are adopting product-led strategies.",
    author: "Elena Rodriguez",
    date: "Oct 12, 2024",
    category: "Business",
  },
  {
    id: 4,
    title: "Effective B2B Marketing Strategies",
    desc: "You don't need a massive budget to dominate your niche. Discover high-leverage tactics.",
    author: "David Kim",
    date: "Oct 12, 2024",
    category: "Marketing",
  },
  {
    id: 5,
    title: "Why Developer Experience (DX) is Your Advantage",
    desc: "A happy developer is a productive developer. Improve internal tools for better results.",
    author: "Sarah Chen",
    date: "Oct 12, 2024",
    category: "Tech",
  },
  {
    id: 6,
    title: "Navigating Global Compliance: GDPR",
    desc: "Data privacy isn't optional. A guide for SaaS founders to build compliant systems.",
    author: "Marcus Thorne",
    date: "Oct 12, 2024",
    category: "Business",
  },
];

export const mockRecentBlogPosts = [
  { id: 1, title: "Building an API First Culture", time: "2 hours ago" },
  { id: 2, title: "The Hidden Costs of Microservices", time: "5 hours ago" },
  { id: 3, title: "UX Trends in Enterprise Dashboards", time: "1 day ago" },
];

export const mockBlogTags = [
  "Leadership",
  "Design",
  "Growth",
  "Security",
  "Web3",
  "Product",
  "Sales",
  "Strategy",
];

export const mockStaffMembers = [
  {
    id: "STF-901",
    name: "Alexander Wright",
    role: "Creative Director",
    email: "a.wright@studio.com",
    phone: "+91 98765 43210",
    status: "Active",
  },
  {
    id: "STF-902",
    name: "Elena Rossi",
    role: "Senior Architect",
    email: "elena.rossi@studio.com",
    phone: "+91 91234 56789",
    status: "Active",
  },
  {
    id: "STF-903",
    name: "Marcus Thorne",
    role: "Operations Lead",
    email: "m.thorne@studio.com",
    phone: "+91 99887 66554",
    status: "Pending",
  },
  {
    id: "STF-904",
    name: "Sophia Chen",
    role: "Junior Designer",
    email: "s.chen@studio.com",
    phone: "+91 90909 12345",
    status: "Active",
  },
  {
    id: "STF-905",
    name: "Julian Vance",
    role: "Technical Specialist",
    email: "j.vance@studio.com",
    phone: "+91 87654 32100",
    status: "Inactive",
  },
];

export const mockSuppliers = [
  {
    id: 1,
    name: "Summit Logistics",
    company: "Summit Global Inc.",
    email: "sarah@summit.com",
    status: "Active",
    date: "Oct 24, 2023",
  },
  {
    id: 2,
    name: "Azure Chemicals",
    company: "Azure Labs LLC",
    email: "mark@azure.io",
    status: "Pending",
    date: "Oct 20, 2023",
  },
  {
    id: 3,
    name: "Ironclad Forge",
    company: "Ironclad Manufacturing",
    email: "ops@ironclad.com",
    status: "Active",
    date: "Oct 18, 2023",
  },
  {
    id: 4,
    name: "Stellar Packaging",
    company: "Stellar Solutions",
    email: "billing@stellar.com",
    status: "Blocked",
    date: "Sep 29, 2023",
  },
  {
    id: 5,
    name: "Green Valley Farms",
    company: "Eco Agro Ltd",
    email: "orders@greenvalley.org",
    status: "Active",
    date: "Oct 26, 2023",
  },
];

export const mockGodowns = [
  {
    id: "GD-001",
    name: "Apex Central",
    location: "London, UK",
    capacity: "50,000 m2",
    used: "85%",
    status: "Operational",
    time: "2h ago",
  },
  {
    id: "GD-002",
    name: "Eastbay Hub",
    location: "New York, US",
    capacity: "120,000 m2",
    used: "92%",
    status: "Warning",
    time: "15m ago",
  },
  {
    id: "GD-003",
    name: "Pacific Port",
    location: "Singapore",
    capacity: "200,000 m2",
    used: "45%",
    status: "Operational",
    time: "1d ago",
  },
  {
    id: "GD-004",
    name: "Nordic Chill",
    location: "Oslo, NO",
    capacity: "30,000 m2",
    used: "98%",
    status: "Full",
    time: "5m ago",
  },
  {
    id: "GD-005",
    name: "Desert Logistics",
    location: "Dubai, UAE",
    capacity: "150,000 m2",
    used: "60%",
    status: "Maintenance",
    time: "3h ago",
  },
];

export const mockGodownActivity = [
  {
    id: 1,
    title: "Stock Replenishment",
    actor: "Elena Vance",
    description: "approved delivery of 4,000 units to Nordic Chill",
    time: "12m ago",
  },
  {
    id: 2,
    title: "Capacity Alert",
    actor: "System Monitor",
    description: "triggered alert for Eastbay Hub",
    time: "1h ago",
  },
  {
    id: 3,
    title: "Inventory Audit",
    actor: "Marcus Thorne",
    description: "verified stock at Apex Central",
    time: "3h ago",
  },
  {
    id: 4,
    title: "Facility Update",
    actor: "Sarah Chen",
    description: "updated Desert Logistics",
    time: "5h ago",
  },
];

export const mockReportsData = {
  salesSummary: {
    dailyTotalSales: 42300,
    totalOrders: 142,
    stockValuation: 845200,
    customerRepeatRate: 32.4,
    targetSales: 50000,
    repeatOrders: 84,
    avgTicket: 298,
  },
  dailySales: [
    { date: "2023-10-24", orders: 142, revenue: 42300, paymentSplit: "Cash: 30%, UPI: 70%" },
    { date: "2023-10-23", orders: 128, revenue: 38150, paymentSplit: "Cash: 45%, UPI: 55%" },
    { date: "2023-10-22", orders: 165, revenue: 48900, paymentSplit: "Cash: 20%, UPI: 80%" },
    { date: "2023-10-21", orders: 110, revenue: 31200, paymentSplit: "Cash: 50%, UPI: 50%" },
    { date: "2023-10-20", orders: 134, revenue: 39800, paymentSplit: "Cash: 35%, UPI: 65%" },
  ],
  fastMoving: [
    { name: "Pilot V5 Hi-Tecpoint (Blue)", category: "Pens", qtySold: 450, velocity: "High" },
    { name: "Classmate Octane Gel Pen", category: "Pens", qtySold: 380, velocity: "Steady" },
    { name: "JK Copier Paper A4 75GSM", category: "Paper", qtySold: 310, velocity: "High" },
    { name: "Camel Artist Watercolors", category: "Art", qtySold: 245, velocity: "Seasonal" },
    { name: "Faber-Castell Erasers (Pack 5)", category: "Misc", qtySold: 220, velocity: "Steady" },
  ],
  slowMoving: [
    { name: "Parker Quink Ink (Red)", stock: 15, lastSale: "45 days ago", aging: "90+ Days" },
    { name: "Casio Scientific Calculator", stock: 4, lastSale: "32 days ago", aging: "60+ Days" },
    { name: "Acrylic Paint Set (Large)", stock: 8, lastSale: "28 days ago", aging: "45+ Days" },
    { name: "Bond Paper Ream 100gsm", stock: 20, lastSale: "22 days ago", aging: "45+ Days" },
    { name: "Geometry Set Premium", stock: 12, lastSale: "15 days ago", aging: "30+ Days" },
  ],
  lowStockAlerts: [
    { name: "Staedtler Mars Lumograph", stock: "5 units", threshold: "20 units", gap: "Needs 15 more", action: "Critical" },
    { name: "Apsara Platinum Pencils", stock: "12 units", threshold: "50 units", gap: "Needs 38 more", action: "Low" },
    { name: "Cello Butterfly Blue", stock: "15 units", threshold: "100 units", gap: "Needs 85 more", action: "Critical" },
    { name: "Doms Drawing Book 20pg", stock: "8 units", threshold: "30 units", gap: "Needs 22 more", action: "Low" },
    { name: "Stick-On Notes (3x3)", stock: "10 units", threshold: "40 units", gap: "Needs 30 more", action: "Low" },
  ],
  taxSummary: {
    totalTaxCollected: 12450,
    cgst: 5602.5,
    sgst: 5602.5,
    igst: 1245,
    costPrice: 520200,
    sellingPrice: 845200,
    expectedProfit: 325000,
  },
  cashiers: [
    { id: "CS-01", name: "Rahul Sharma", bills: 450, sales: 142000 },
    { id: "CS-02", name: "Priya Verma", bills: 412, sales: 128500 },
    { id: "CS-03", name: "Amit Singh", bills: 385, sales: 118000 },
  ],
};

export const mockBillingDraft = {
  clientName: "Acme Corp",
  email: "billing@acme.com",
  phone: "+1 415 555 0199",
  address: "Market Street, San Francisco",
  invoiceNo: "INV-2024-001",
  currency: "USD",
  taxRate: 0.1,
  discount: 250,
  items: [
    { name: "SaaS Platform Development", qty: 1, price: 4500 },
    { name: "Cloud Infrastructure Setup", qty: 1, price: 1200 },
    { name: "UI/UX Maintenance (Monthly)", qty: 3, price: 500 },
  ],
  notes: "Thank you for your business.",
};

export const mockBillingActivity = [
  { id: "INV-2024-001", name: "Acme Corp", amount: 5200, status: "Paid" },
  { id: "INV-2024-002", name: "Global Tech", amount: 2450, status: "Pending" },
  { id: "INV-2024-003", name: "Starlight Media", amount: 7800, status: "Overdue" },
  { id: "INV-2024-004", name: "Nexus Systems", amount: 1100, status: "Paid" },
  { id: "INV-2024-005", name: "Riverstone Labs", amount: 3300, status: "Pending" },
];

export function getMockAdminProfile() {
  return mockAdminProfile;
}

export function updateMockAdminProfile(changes) {
  Object.assign(mockAdminProfile, changes);
  return mockAdminProfile;
}

export function getMockAdminOrders() {
  return mockAdminOrders;
}

export function getMockBlogPosts() {
  return mockBlogPosts;
}

export function createMockBlogPost(payload) {
  const nextPost = {
    id: Date.now(),
    title: payload.title || "Untitled Blog",
    desc: payload.desc || payload.description || "",
    author: payload.author || "Lekhanmart",
    date: new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    category: payload.category || "Store",
    status: payload.status || "Draft",
    read: payload.read || "5 MIN READ",
    views: "0",
    avg: "0%",
  };

  mockBlogPosts.unshift(nextPost);
  mockRecentBlogPosts.unshift({
    id: nextPost.id,
    title: nextPost.title,
    time: "Just now",
  });

  return nextPost;
}

export function deleteMockBlogPost(id) {
  const index = mockBlogPosts.findIndex(
    (post) => Number(post.id) === Number(id)
  );

  if (index === -1) {
    return null;
  }

  const [deleted] = mockBlogPosts.splice(index, 1);
  const recentIndex = mockRecentBlogPosts.findIndex(
    (post) => Number(post.id) === Number(id)
  );

  if (recentIndex !== -1) {
    mockRecentBlogPosts.splice(recentIndex, 1);
  }

  return deleted;
}

export function getMockRecentBlogPosts() {
  return mockRecentBlogPosts;
}

export function getMockBlogTags() {
  return mockBlogTags;
}

export function getMockStaffMembers() {
  return mockStaffMembers;
}

export function getMockSuppliers() {
  return mockSuppliers;
}

export function getMockGodowns() {
  return mockGodowns;
}

export function getMockGodownActivity() {
  return mockGodownActivity;
}

export function getMockReportsData() {
  return mockReportsData;
}

export function getMockBillingDraft() {
  return mockBillingDraft;
}

export function getMockBillingActivity() {
  return mockBillingActivity;
}

export function createMockInvoice(payload) {
  const subtotal = (payload.items || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
    0
  );
  const taxRate = Number(payload.taxRate) || 0;
  const discount = Number(payload.discount) || 0;
  const amount = subtotal + subtotal * taxRate - discount;
  const invoice = {
    id: payload.invoiceNo || `INV-${Date.now().toString().slice(-8)}`,
    name: payload.clientName || "New Client",
    amount,
    status: "Pending",
  };

  mockBillingActivity.unshift(invoice);
  Object.assign(mockBillingDraft, payload);
  return invoice;
}
