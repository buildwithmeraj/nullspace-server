import app from "./app";
import config from "./config";
import { connectDatabase } from "./models/db";
import { createServer } from "http";
import { initSocket } from "./socket";

async function main() {
  // Start HTTP server after critical dependencies (DB) are ready.
  const startServer = () => {
    const server = createServer(app);
    initSocket(server);
    server.listen(config.port, () => {
      console.log(`Server is listening on port ${config.port}`);
    });
  };

  try {
    await connectDatabase();
    console.log("Connected to MongoDB successfully");
    startServer();
  } catch (err) {
    // Fail fast: without DB the API cannot function correctly.
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  }
}

main();
