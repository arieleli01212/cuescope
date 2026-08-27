import { Router } from "express";
import { categoryController } from "@controllers/category.controller";
import { validate } from "@middleware/validate";
import { asyncHandler } from "@utils/asyncHandler";
import { categoryIdParamsSchema, createCategorySchema, updateCategorySchema } from "@dto/category.dto";

const router = Router();

router.get("/", asyncHandler(categoryController.list));
router.post("/", validate({ body: createCategorySchema }), asyncHandler(categoryController.create));
router.patch(
  "/:id",
  validate({ params: categoryIdParamsSchema, body: updateCategorySchema }),
  asyncHandler(categoryController.update)
);
router.delete(
  "/:id",
  validate({ params: categoryIdParamsSchema }),
  asyncHandler(categoryController.remove)
);

export default router;
