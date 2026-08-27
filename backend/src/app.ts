import express from "express";
import cors from "cors";
import { env } from "@config/env";
import { authenticate } from "@middleware/authenticate";
import { errorHandler } from "@middleware/errorHandler";
import { asyncHandler } from "@utils/asyncHandler";
import categoryRoutes from "@routes/category.routes";
import importRoutes from "@routes/import.routes";
import transactionRoutes from "@routes/transaction.routes";
import { readVersionInfo } from "./version";

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));

// Authenticate before parsing the larger normalized import payload. This keeps
// the extra parsing work and 8 MB allowance private to authenticated imports.
const importApi = express.Router();
importApi.use(asyncHandler(authenticate));
importApi.use(express.json({ limit: "8mb" }));
importApi.use(importRoutes);
app.use("/v1/imports", importApi);

app.use(express.json());

app.get("/health", (_req, res) => {
  const { version, commit, buildTime } = readVersionInfo();
  res.status(200).json({ status: "ok", version, commit, buildTime });
});

// כל מה שמתחת דורש X-API-Key תקין
app.get("/v1/me", asyncHandler(authenticate), (req, res) => res.status(200).json({ data: req.user }));
app.use("/v1/categories", asyncHandler(authenticate), categoryRoutes);
app.use("/v1/transactions", asyncHandler(authenticate), transactionRoutes);

// הדשבורד ה-web (HTML/JS סטטי) רץ בקונטיינר frontend נפרד ומגיש את עצמו
// דרך nginx, שגם מעביר (proxy) את קריאות ה-/v1 לשרת הזה - ר' frontend/nginx.conf.
// ה-backend הזה נשאר API בלבד, בלי הגשת קבצים סטטיים.

app.use(errorHandler);
