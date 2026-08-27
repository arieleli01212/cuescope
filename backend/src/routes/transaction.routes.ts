import { Router } from "express";
import { transactionController } from "@controllers/transaction.controller";
import { validate } from "@middleware/validate";
import { asyncHandler } from "@utils/asyncHandler";
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  summaryQuerySchema,
  transactionIdParamsSchema,
  updateTransactionSchema,
} from "@dto/transaction.dto";

const router = Router();

// "/summary" חייב להירשם *לפני* "/:id", אחרת Express יזהה "summary" כאילו הוא id
router.get("/summary", validate({ query: summaryQuerySchema }), asyncHandler(transactionController.summary));

router.get("/", validate({ query: listTransactionsQuerySchema }), asyncHandler(transactionController.list));
router.post("/", validate({ body: createTransactionSchema }), asyncHandler(transactionController.create));
router.patch(
  "/:id",
  validate({ params: transactionIdParamsSchema, body: updateTransactionSchema }),
  asyncHandler(transactionController.update)
);
router.delete(
  "/:id",
  validate({ params: transactionIdParamsSchema }),
  asyncHandler(transactionController.remove)
);

export default router;
