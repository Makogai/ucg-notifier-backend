import { env } from "./config/env";
import { app } from "./app";
import { logInfo } from "./utils/logger";

app.listen(env.PORT, "0.0.0.0", () => {
  logInfo(`API listening on port ${env.PORT} (0.0.0.0)`);
});

