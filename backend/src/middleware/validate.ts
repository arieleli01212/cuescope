import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";

interface ValidationSchemas {
  // ZodTypeAny (לא AnyZodObject) כי body יכול להיות עטוף ב-.refine()/.transform()
  // שמחזירים ZodEffects ולא ZodObject ישירות
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }
    if (schemas.query) {
      req.query = schemas.query.parse(req.query) as typeof req.query;
    }
    if (schemas.params) {
      req.params = schemas.params.parse(req.params) as typeof req.params;
    }
    next();
  };
}
