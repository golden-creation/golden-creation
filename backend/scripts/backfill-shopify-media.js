import { backfillRemoteMedia, remoteMediaStats } from "../services/remote-media.service.js";

const limitArg = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = Number(limitArg?.split("=")[1] || 100);

try {
  const results = await backfillRemoteMedia({ limit });
  const stats = await remoteMediaStats();
  console.log(JSON.stringify({ results, stats }, null, 2));
  process.exit(results.failed ? 2 : 0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
