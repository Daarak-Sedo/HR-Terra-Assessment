import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z, ZodError } from "zod";
import { config } from "./config.js";
import { AuthContext, Company, Role, User, roles } from "./models.js";

/* eslint-disable @typescript-eslint/no-namespace -- Express request augmentation requires a global namespace declaration. */
declare global {
  namespace Express {
    interface Request {
      authUser?: AuthContext;
      requestId?: string;
      tenantId?: string;
    }
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = req.signedCookies?.hrterra;
  if (!token)
    return next(
      new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue."),
    );
  try {
    const claims = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    if (typeof claims.sub !== "string" || !roles.includes(claims.role as Role))
      throw new Error("Invalid claims");
    void User.findById(claims.sub)
      .then((user) => {
        if (!user)
          return next(
            new HttpError(
              401,
              "UNAUTHENTICATED",
              "Please sign in to continue.",
            ),
          );
        req.authUser = {
          userId: user.id,
          companyId: user.companyId?.toString() ?? null,
          role: user.role as Role,
          employeeId: user.employeeId?.toString() ?? null,
          name: user.name,
          email: user.email,
        };
        if (
          user.role === "PLATFORM_ADMIN" &&
          typeof req.header("x-company-id") === "string"
        ) {
          const requested = req.header("x-company-id")!;
          if (!/^[a-f\d]{24}$/i.test(requested))
            return next(
              new HttpError(
                400,
                "INVALID_COMPANY",
                "The selected company is invalid.",
              ),
            );
          void Company.exists({ _id: requested })
            .then((found) => {
              if (!found)
                return next(
                  new HttpError(404, "NOT_FOUND", "Company not found."),
                );
              req.tenantId = requested;
              next();
            })
            .catch(next);
        } else {
          if (user.companyId) req.tenantId = user.companyId.toString();
          next();
        }
      })
      .catch(next);
  } catch {
    next(new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue."));
  }
}

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser)
      return next(
        new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue."),
      );
    if (!allowed.includes(req.authUser.role))
      return next(
        new HttpError(
          403,
          "FORBIDDEN",
          "You are not authorized to perform this action.",
        ),
      );
    next();
  };
}

export function requireTenant(req: Request): string {
  if (!req.authUser)
    throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  const tenantId = req.tenantId ?? req.authUser.companyId;
  if (!tenantId)
    throw new HttpError(
      400,
      "COMPANY_REQUIRED",
      "Select a company to continue.",
    );
  return tenantId;
}

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError)
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        error.issues.map((issue) => issue.message).join(" "),
      );
    throw error;
  }
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;
  const known = error instanceof HttpError ? error : null;
  const duplicateKey =
    error instanceof Error && "code" in error && error.code === 11000;
  const validationError =
    error instanceof Error && error.name === "ValidationError";
  const status =
    known?.status ?? (duplicateKey ? 409 : validationError ? 400 : 500);
  const code =
    known?.code ??
    (duplicateKey
      ? "CONFLICT"
      : validationError
        ? "VALIDATION_ERROR"
        : "INTERNAL_ERROR");
  const message =
    known?.message ??
    (duplicateKey
      ? "A record with this unique value already exists."
      : validationError
        ? "The submitted data is invalid."
        : "An unexpected error occurred.");
  if (status >= 500)
    console.error("request_error", {
      requestId: req.requestId,
      error: error instanceof Error ? error.message : "unknown",
    });
  res
    .status(status)
    .json({ error: { code, message, requestId: req.requestId ?? "unknown" } });
}
