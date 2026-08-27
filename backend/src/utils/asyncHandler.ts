import { NextFunction, Request, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";

/**
 * עוטף Controller אסינכרוני כדי שכל שגיאה תעבור אוטומטית ל-next(err).
 * גנרי (כמו Express עצמו) כדי ש-handlers עם טיפוסי params/body/query
 * ספציפיים יתאימו לו בלי שגיאות טיפוסים.
 */
export function asyncHandler<
  P = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = ParsedQs,
  Locals extends Record<string, unknown> = Record<string, unknown>
>(
  handler: (
    req: Request<P, ResBody, ReqBody, ReqQuery, Locals>,
    res: Response<ResBody, Locals>,
    next: NextFunction
  ) => Promise<unknown>
) {
  return (
    req: Request<P, ResBody, ReqBody, ReqQuery, Locals>,
    res: Response<ResBody, Locals>,
    next: NextFunction
  ): void => {
    handler(req, res, next).catch(next);
  };
}
