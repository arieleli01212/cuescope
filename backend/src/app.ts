import express from "express";
import cors from "cors";
import { env } from "@config/env";
import { authenticate } from "@middleware/authenticate";
import { errorHandler } from "@middleware/errorHandler";
import { asyncHandler } from "@utils/asyncHandler";
import categoryRoutes from "@routes/category.routes";
import transactionRoutes from "@routes/transaction.routes";
import { readVersionInfo } from "./version";

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
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
