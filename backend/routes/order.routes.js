import express from "express";

import {
  createOrder,
  downloadOrderInvoice,
  getCustomerOrders,
} from "../controllers/order.controller.js";

const router = express.Router();

router.post("/", createOrder);
router.get("/:orderNumber/invoice", downloadOrderInvoice);
router.get("/", getCustomerOrders);

export default router;
