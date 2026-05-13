import "./config/env.js";
import { connectDB } from "./config/db.js";
import { createHttpServer } from "./server.js";
import { startDeletedPostPurgeLoop } from "./services/postDeletion.js";
import { startUnverifiedUserPurgeLoop } from "./services/unverifiedUserPurge.js";
import { startUploadReminderLoop } from "./services/uploadReminderLoop.js";
import { startDocumentRequestBountyLoop } from "./services/documentRequestBounty.js";

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

await connectDB();
startDeletedPostPurgeLoop();
startUnverifiedUserPurgeLoop();
startUploadReminderLoop();
startDocumentRequestBountyLoop();

const httpServer = await createHttpServer();

httpServer.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;

  console.log(
    `🚀 Material Crate GraphQL running at http://${displayHost}:${PORT}/graphql`,
  );
  console.log(
    `🔄 Realtime post activity ready at http://${displayHost}:${PORT}/socket.io`,
  );
});
