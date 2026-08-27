import { Request, Response } from "express";
import { categoryService } from "@services/category.service";
import { CreateCategoryDto, UpdateCategoryDto } from "@dto/category.dto";

export const categoryController = {
  async list(_req: Request, res: Response) {
    const categories = await categoryService.list();
    res.status(200).json({ data: categories });
  },

  async create(req: Request, res: Response) {
    const { name, group } = req.body as CreateCategoryDto;
    const category = await categoryService.create(name, group);
    res.status(201).json({ data: category });
  },

  async update(req: Request, res: Response) {
    const dto = req.body as UpdateCategoryDto;
    const category = await categoryService.update(req.params.id, dto);
    res.status(200).json({ data: category });
  },

  async remove(req: Request, res: Response) {
    await categoryService.remove(req.params.id);
    res.status(204).send();
  },
};
