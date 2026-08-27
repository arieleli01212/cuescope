import { Router } from "express";

import { importController } from "@controllers/import.controller";
import { previewImportSchema } from "@dto/import.dto";
import { validate } from "@middleware/validate";
import { asyncHandler } from "@utils/asyncHandler";

const router = Router();

router.post(
  "/preview",
  validate({ body: previewImportSchema }),
  asyncHandler(importController.preview),
);

export default router;
