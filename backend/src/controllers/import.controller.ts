import { Request, Response } from "express";
import type { z } from "zod";

import { confirmImportSchema, previewImportSchema } from "@dto/import.dto";
import { importService } from "@services/import.service";
import { AppError } from "@utils/AppError";

type PreviewImportDto = z.infer<typeof previewImportSchema>;
type ConfirmImportDto = z.infer<typeof confirmImportSchema>;

export const importController = {
  async preview(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const preview = await importService.preview(req.user.id, req.body as PreviewImportDto);
    res.status(200).json({ data: preview });
  },

  async confirm(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const result = await importService.confirm(req.user.id, req.body as ConfirmImportDto);
    res.status(201).json({ data: result });
  },

  async undo(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    await importService.undo(req.user.id, req.params.id);
    res.status(204).send();
  },
};
