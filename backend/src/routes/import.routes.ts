import { Router } from "express";

import { importController } from "@controllers/import.controller";
import { confirmImportSchema, importIdParamsSchema, previewImportSchema } from "@dto/import.dto";
import { validate } from "@middleware/validate";
import { asyncHandler } from "@utils/asyncHandler";

const router = Router();

router.post(
  "/preview",
  validate({ body: previewImportSchema }),
  asyncHandler(importController.preview),
);

router.post(
  "/",
  validate({ body: confirmImportSchema }),
  asyncHandler(importController.confirm),
);

router.delete(
  "/:id",
  validate({ params: importIdParamsSchema }),
  asyncHandler(importController.undo),
);

export default router;
