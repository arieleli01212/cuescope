import { Request, Response } from "express";
import { transactionService } from "@services/transaction.service";
import { AppError } from "@utils/AppError";
import {
  CreateTransactionDto,
  ListTransactionsQuery,
  SummaryQuery,
  UpdateTransactionDto,
} from "@dto/transaction.dto";

function requireUser(req: Request) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const transactionController = {
  async create(req: Request, res: Response) {
    const user = requireUser(req);
    const dto = req.body as CreateTransactionDto;
    const transaction = await transactionService.create(user.id, dto);
    res.status(201).json({ data: transaction });
  },

  async update(req: Request, res: Response) {
    const dto = req.body as UpdateTransactionDto;
    const transaction = await transactionService.update(req.params.id, dto);
    res.status(200).json({ data: transaction });
  },

  async remove(req: Request, res: Response) {
    await transactionService.remove(req.params.id);
    res.status(204).send();
  },

  async list(req: Request, res: Response) {
    const query = req.query as unknown as ListTransactionsQuery;
    const transactions = await transactionService.list(query);
    res.status(200).json({ data: transactions });
  },

  async summary(req: Request, res: Response) {
    const query = req.query as unknown as SummaryQuery;
    const summary = await transactionService.summary(query.month);
    res.status(200).json({ data: summary });
  },
};
