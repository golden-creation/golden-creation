import { regenerateReadyCatalogs } from "../controllers/sales.controller.js";

try {
  const count = await regenerateReadyCatalogs();
  console.log(`Regenerated ${count} ready catalog(s).`);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
