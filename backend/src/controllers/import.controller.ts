import { Request, Response } from "express";
import type { z } from "zod";

import { previewImportSchema } from "@dto/import.dto";
import { importService } from "@services/import.service";
import { AppError } from "@utils/AppError";

type PreviewImportDto = z.infer<typeof previewImportSchema>;

export const importController = {
  async preview(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    const preview = await importService.preview(req.user.id, req.body as PreviewImportDto);
    res.status(200).json({ data: preview });
  },
};
