import { app } from "./app";
import { env } from "@config/env";

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`cuescope-backend listening on :${env.PORT} (${env.NODE_ENV})`);
});
