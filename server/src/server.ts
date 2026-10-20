import mongoose from "mongoose";
import app from "./app.js";
import { config } from "./config.js";

await mongoose.connect(config.MONGODB_URI, {
  autoIndex: config.NODE_ENV !== "production",
});
const server = app.listen(config.PORT, () =>
  console.log(`HR Terra API listening on http://localhost:${config.PORT}`),
);
const close = async (): Promise<void> => {
  server.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on("SIGINT", () => {
  void close();
});
process.on("SIGTERM", () => {
  void close();
});
