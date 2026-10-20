import crypto from "node:crypto";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { z } from "zod";
import { config } from "./config.js";
import {
  AttendanceRecord,
  AuditLog,
  CameraEvent,
  Candidate,
  Company,
  Employee,
  HRTicket,
  Payment,
  PayrollRun,
  SalaryStructure,
  User,
  Wallet,
  objectId,
} from "./models.js";
import {
  asyncRoute,
  errorHandler,
  HttpError,
  requireAuth,
  requireRole,
  requireTenant,
  validate,
} from "./middleware.js";
import { calculateLateMinutes, calculatePayroll } from "./payroll.js";

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  req.requestId =
    req.header("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
});
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  const origins = config.CORS_ORIGIN.split(",").map((entry) => entry.trim());
  const origin = req.header("origin");
  if (origin && !origins.includes(origin))
    return next(
      new HttpError(403, "ORIGIN_DENIED", "This origin is not allowed."),
    );
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Company-Id, Idempotency-Key, X-Request-Id",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use((await import("helmet")).default());
app.use((await import("cookie-parser")).default(config.COOKIE_SECRET));
app.use(
  pinoHttp({
    level: config.LOG_LEVEL,
    redact: ["req.headers.cookie", "req.headers.authorization"],
  }),
);

const api = express.Router();
const mutationOrigin = (
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction,
): void => {
  const origin = req.header("origin");
  if (
    origin &&
    !config.CORS_ORIGIN.split(",")
      .map((entry) => entry.trim())
      .includes(origin)
  )
    return next(
      new HttpError(403, "ORIGIN_DENIED", "This origin is not allowed."),
    );
  if (
    ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
    req.signedCookies?.hrterra &&
    !origin
  )
    return next(
      new HttpError(
        403,
        "CSRF_CHECK_FAILED",
        "Authenticated browser requests must include an allowed origin.",
      ),
    );
  next();
};
const audit = async (
  req: express.Request,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata: Record<string, unknown> = {},
): Promise<void> => {
  await AuditLog.create({
    companyId: req.tenantId ? objectId(req.tenantId) : null,
    actorId: req.authUser ? objectId(req.authUser.userId) : null,
    action,
    resourceType,
    resourceId,
    metadata: { requestId: req.requestId, ...metadata },
  });
};
const isObjectId = (value: string): boolean => /^[a-f\d]{24}$/i.test(value);
const nonnegativeCents = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger);
const positiveCents = z.number().int().positive().refine(Number.isSafeInteger);
const routeId = (req: express.Request): string => {
  const value = req.params.id;
  if (typeof value !== "string" || !isObjectId(value))
    throw new HttpError(404, "NOT_FOUND", "Resource not found.");
  return value;
};
const getOwnedEmployee = async (req: express.Request, employeeId: string) => {
  const tenant = requireTenant(req);
  const employee = await Employee.findOne({
    _id: employeeId,
    companyId: tenant,
  });
  if (!employee) throw new HttpError(404, "NOT_FOUND", "Employee not found.");
  if (
    req.authUser?.role === "EMPLOYEE" &&
    req.authUser.employeeId !== employee.id
  )
    throw new HttpError(404, "NOT_FOUND", "Employee not found.");
  return employee;
};

app.get("/api/health/live", (_req, res) => res.json({ status: "live" }));
app.get(
  "/api/health/ready",
  asyncRoute(async (_req, res) => {
    const healthy =
      (await import("mongoose")).default.connection.readyState === 1;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "healthy" : "unavailable",
      database: healthy ? "healthy" : "unavailable",
    });
  }),
);

api.post(
  "/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  asyncRoute(async (req, res) => {
    const body = validate(
      z.object({
        email: z
          .string()
          .email()
          .transform((value) => value.toLowerCase()),
        password: z.string().min(1),
      }),
      req.body,
    );
    const user = await User.findOne({ email: body.email }).select(
      "+passwordHash",
    );
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash)))
      throw new HttpError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    const token = jwt.sign({ role: user.role }, config.JWT_SECRET, {
      subject: user.id,
      expiresIn: "8h",
    });
    res.cookie("hrterra", token, {
      httpOnly: true,
      signed: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/",
    });
    req.authUser = {
      userId: user.id,
      companyId: user.companyId?.toString() ?? null,
      role: user.role,
      employeeId: user.employeeId?.toString() ?? null,
      name: user.name,
      email: user.email,
    };
    if (user.companyId) req.tenantId = user.companyId.toString();
    await audit(req, "AUTH_LOGIN", "User", user.id);
    res.json({ user: req.authUser });
  }),
);
api.post("/auth/logout", (_req, res) => {
  res.clearCookie("hrterra", {
    httpOnly: true,
    signed: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.status(204).end();
});
api.get("/auth/me", requireAuth, (req, res) =>
  res.json({ user: req.authUser }),
);

api.get(
  "/companies",
  requireAuth,
  requireRole("PLATFORM_ADMIN"),
  asyncRoute(async (_req, res) => {
    res.json({
      data: await Company.find()
        .select("name slug timezone currency")
        .sort({ name: 1 }),
    });
  }),
);
api.get(
  "/companies/current",
  requireAuth,
  asyncRoute(async (req, res) => {
    if (req.authUser?.role === "PLATFORM_ADMIN")
      throw new HttpError(
        400,
        "COMPANY_REQUIRED",
        "Platform admins must select a company.",
      );
    const company = await Company.findById(requireTenant(req)).select(
      "name slug timezone currency",
    );
    if (!company) throw new HttpError(404, "NOT_FOUND", "Company not found.");
    res.json({ data: company });
  }),
);
api.get(
  "/employees",
  requireAuth,
  asyncRoute(async (req, res) => {
    const tenant = requireTenant(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter: Record<string, unknown> = { companyId: tenant };
    if (req.authUser?.role === "EMPLOYEE") filter._id = req.authUser.employeeId;
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const escaped = req.query.search
        .trim()
        .slice(0, 80)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: new RegExp(escaped, "i") },
        { email: new RegExp(escaped, "i") },
        { employeeNumber: new RegExp(escaped, "i") },
        { department: new RegExp(escaped, "i") },
      ];
    }
    if (
      typeof req.query.status === "string" &&
      ["ACTIVE", "INACTIVE"].includes(req.query.status)
    )
      filter.status = req.query.status;
    const [data, total] = await Promise.all([
      Employee.find(filter)
        .select("-salaryCents")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Employee.countDocuments(filter),
    ]);
    res.json({
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  }),
);
const employeeInput = z.object({
  employeeNumber: z.string().min(2).max(30),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  department: z.string().min(2).max(80),
  jobTitle: z.string().min(2).max(80),
  employmentType: z
    .enum(["Full-time", "Part-time", "Contractor", "Consultant"])
    .default("Full-time"),
  salaryCents: nonnegativeCents.default(0),
  shiftStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("09:00"),
  shiftEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("17:00"),
});
api.post(
  "/employees",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"),
  asyncRoute(async (req, res) => {
    const data = validate(employeeInput, req.body);
    const tenant = requireTenant(req);
    if (
      (data.salaryCents ?? 0) > 0 &&
      !["COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(req.authUser?.role ?? "")
    )
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Only a company admin can set salary data.",
      );
    const employee = await Employee.create({
      ...data,
      salaryCents: data.salaryCents ?? 0,
      companyId: objectId(tenant),
      email: data.email.toLowerCase(),
    });
    await audit(req, "EMPLOYEE_CREATED", "Employee", employee.id);
    res.status(201).json({
      data: await Employee.findById(employee.id).select("-salaryCents"),
    });
  }),
);
api.get(
  "/employees/:id",
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = routeId(req);
    const employee = await getOwnedEmployee(req, id);
    res.json({ data: employee });
  }),
);
api.patch(
  "/employees/:id",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"),
  asyncRoute(async (req, res) => {
    const id = routeId(req);
    const patch = validate(
      employeeInput.partial().omit({ salaryCents: true }),
      req.body,
    );
    const tenant = requireTenant(req);
    const employee = await Employee.findOneAndUpdate(
      { _id: id, companyId: tenant },
      { $set: patch },
      { new: true, runValidators: true },
    ).select("-salaryCents");
    if (!employee) throw new HttpError(404, "NOT_FOUND", "Employee not found.");
    await audit(req, "EMPLOYEE_UPDATED", "Employee", employee.id);
    res.json({ data: employee });
  }),
);
api.post(
  "/employees/:id/deactivate",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"),
  asyncRoute(async (req, res) => {
    const employee = await Employee.findOneAndUpdate(
      { _id: routeId(req), companyId: requireTenant(req) },
      { $set: { status: "INACTIVE" } },
      { new: true },
    ).select("-salaryCents");
    if (!employee) throw new HttpError(404, "NOT_FOUND", "Employee not found.");
    await audit(req, "EMPLOYEE_DEACTIVATED", "Employee", employee.id);
    res.json({
      data: employee,
      policy:
        "Inactive employees are excluded from payroll runs created after deactivation.",
    });
  }),
);

api.get(
  "/candidates",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"),
  asyncRoute(async (req, res) => {
    res.json({
      data: await Candidate.find({ companyId: requireTenant(req) }).sort({
        createdAt: -1,
      }),
    });
  }),
);
api.post(
  "/candidates",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"),
  asyncRoute(async (req, res) => {
    const data = validate(
      z.object({
        name: z.string().min(2),
        email: z.string().email(),
        phone: z.string().optional(),
        position: z.string().min(2),
        department: z.string().min(2),
        salaryCents: nonnegativeCents,
        proposedJoiningDate: z.coerce.date().optional(),
      }),
      req.body,
    );
    const candidate = await Candidate.create({
      ...data,
      companyId: objectId(requireTenant(req)),
    });
    await audit(req, "CANDIDATE_CREATED", "Candidate", candidate.id);
    res.status(201).json({ data: candidate });
  }),
);
api.post(
  "/candidates/:id/offer",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"),
  asyncRoute(async (req, res) => {
    const candidate = await Candidate.findOneAndUpdate(
      { _id: routeId(req), companyId: requireTenant(req), status: "CANDIDATE" },
      { $set: { status: "OFFERED" } },
      { new: true },
    );
    if (!candidate)
      throw new HttpError(
        409,
        "INVALID_STATE",
        "Candidate is not eligible for an offer.",
      );
    res.json({ data: candidate });
  }),
);
api.post(
  "/candidates/:id/accept",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"),
  asyncRoute(async (req, res) => {
    const candidate = await Candidate.findOneAndUpdate(
      { _id: routeId(req), companyId: requireTenant(req), status: "OFFERED" },
      { $set: { status: "ACCEPTED" } },
      { new: true },
    );
    if (!candidate)
      throw new HttpError(
        409,
        "INVALID_STATE",
        "Candidate has no pending offer.",
      );
    res.json({ data: candidate });
  }),
);
api.post(
  "/candidates/:id/convert",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"),
  asyncRoute(async (req, res) => {
    const tenant = requireTenant(req);
    const id = routeId(req);
    let candidate = await Candidate.findOne({ _id: id, companyId: tenant });
    if (!candidate)
      throw new HttpError(404, "NOT_FOUND", "Candidate not found.");
    if (candidate.status === "ACCEPTED" && !candidate.conversionEmployeeId) {
      candidate =
        (await Candidate.findOneAndUpdate(
          {
            _id: id,
            companyId: tenant,
            status: "ACCEPTED",
            conversionEmployeeId: null,
          },
          {
            $set: {
              status: "CONVERTED",
              conversionEmployeeId: new (
                await import("mongoose")
              ).default.Types.ObjectId(),
            },
          },
          { new: true },
        )) ?? (await Candidate.findOne({ _id: id, companyId: tenant }));
    }
    if (
      !candidate ||
      candidate.status !== "CONVERTED" ||
      !candidate.conversionEmployeeId
    )
      throw new HttpError(
        409,
        "INVALID_STATE",
        "Candidate must accept an offer before conversion.",
      );
    let employee = await Employee.findOne({
      _id: candidate.conversionEmployeeId,
      companyId: tenant,
    });
    if (!employee) {
      try {
        employee = await Employee.create({
          _id: candidate.conversionEmployeeId,
          companyId: objectId(tenant),
          employeeNumber: `CAND-${candidate.id.toUpperCase()}`,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          department: candidate.department,
          jobTitle: candidate.position,
          joiningDate: candidate.proposedJoiningDate ?? new Date(),
          employmentType: "Full-time",
          status: "ACTIVE",
          salaryCents: candidate.salaryCents,
        });
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === 11000
        ))
          throw error;
        employee = await Employee.findOne({
          _id: candidate.conversionEmployeeId,
          companyId: tenant,
        });
      }
    }
    if (!employee)
      throw new HttpError(
        500,
        "CONVERSION_FAILED",
        "Employee conversion could not be completed.",
      );
    await audit(req, "CANDIDATE_CONVERTED", "Employee", employee.id, {
      candidateId: candidate.id,
    });
    res.json({
      data: await Employee.findById(employee.id).select("-salaryCents"),
      repeated: candidate.updatedAt.getTime() < Date.now() - 1000,
    });
  }),
);

const companyDateKey = (date: Date, timezone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const localClock = (date: Date, timezone: string): number => {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .split(":");
  return Number(p[0]) * 60 + Number(p[1]);
};
api.get(
  "/attendance",
  requireAuth,
  asyncRoute(async (req, res) => {
    const filter: Record<string, unknown> = { companyId: requireTenant(req) };
    if (["EMPLOYEE", "PAYROLL_MANAGER"].includes(req.authUser?.role ?? ""))
      filter.employeeId = req.authUser!.employeeId;
    res.json({
      data: await AttendanceRecord.find(filter)
        .populate("employeeId", "name employeeNumber department")
        .sort({ dateKey: -1 })
        .limit(100),
    });
  }),
);
api.post(
  "/attendance/check-in",
  requireAuth,
  asyncRoute(async (req, res) => {
    const schema = z.object({
      employeeId: z
        .string()
        .regex(/^[a-f\d]{24}$/i)
        .optional(),
    });
    const body = validate(schema, req.body ?? {});
    const employeeId = ["EMPLOYEE", "PAYROLL_MANAGER"].includes(
      req.authUser?.role ?? "",
    )
      ? req.authUser!.employeeId
      : body.employeeId;
    if (!employeeId)
      throw new HttpError(400, "EMPLOYEE_REQUIRED", "Choose an employee.");
    const employee = await getOwnedEmployee(req, employeeId);
    if (employee.status !== "ACTIVE")
      throw new HttpError(
        409,
        "INACTIVE_EMPLOYEE",
        "Inactive employees cannot check in.",
      );
    const tenant = requireTenant(req);
    const company = await Company.findById(tenant);
    if (!company) throw new HttpError(404, "NOT_FOUND", "Company not found.");
    const now = new Date();
    const dateKey = companyDateKey(now, company.timezone);
    const [shiftH, shiftM] = employee.shiftStart.split(":").map(Number);
    const lateMinutes = calculateLateMinutes(
      localClock(now, company.timezone),
      shiftH! * 60 + shiftM!,
      company.attendanceGraceMinutes,
    );
    try {
      const record = await AttendanceRecord.create({
        companyId: objectId(tenant),
        employeeId: employee._id,
        dateKey,
        checkedInAt: now,
        lateMinutes,
        status: lateMinutes > 0 ? "LATE" : "PRESENT",
      });
      await audit(req, "ATTENDANCE_CHECK_IN", "AttendanceRecord", record.id);
      return res.status(201).json({ data: record });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === 11000)
        throw new HttpError(
          409,
          "ALREADY_CHECKED_IN",
          "An attendance record already exists for this employee today.",
        );
      throw error;
    }
  }),
);
api.post(
  "/attendance/check-out",
  requireAuth,
  asyncRoute(async (req, res) => {
    const body = validate(
      z.object({
        employeeId: z
          .string()
          .regex(/^[a-f\d]{24}$/i)
          .optional(),
      }),
      req.body ?? {},
    );
    const employeeId = ["EMPLOYEE", "PAYROLL_MANAGER"].includes(
      req.authUser?.role ?? "",
    )
      ? req.authUser!.employeeId
      : body.employeeId;
    if (!employeeId)
      throw new HttpError(400, "EMPLOYEE_REQUIRED", "Choose an employee.");
    const employee = await getOwnedEmployee(req, employeeId);
    const company = await Company.findById(requireTenant(req));
    if (!company) throw new HttpError(404, "NOT_FOUND", "Company not found.");
    const now = new Date();
    const dateKey = companyDateKey(now, company.timezone);
    const [endH, endM] = employee.shiftEnd.split(":").map(Number);
    const early = Math.max(
      0,
      endH! * 60 + endM! - localClock(now, company.timezone),
    );
    const record = await AttendanceRecord.findOneAndUpdate(
      {
        companyId: requireTenant(req),
        employeeId: employee._id,
        dateKey,
        checkedOutAt: null,
      },
      { $set: { checkedOutAt: now, earlyCheckoutMinutes: early } },
      { new: true },
    );
    if (!record)
      throw new HttpError(
        409,
        "CHECK_IN_REQUIRED",
        "A current attendance record is required before checkout.",
      );
    await audit(req, "ATTENDANCE_CHECK_OUT", "AttendanceRecord", record.id);
    res.json({ data: record });
  }),
);

api.get(
  "/camera-events",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"),
  asyncRoute(async (req, res) => {
    res.json({
      data: await CameraEvent.find({ companyId: requireTenant(req) })
        .sort({ createdAt: -1 })
        .limit(100),
    });
  }),
);
api.post(
  "/camera-events/simulate",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"),
  asyncRoute(async (req, res) => {
    const input = validate(
      z.object({
        eventId: z.string().min(1).max(100),
        cameraId: z.string().min(1).max(100),
        employeeId: z.string().regex(/^[a-f\d]{24}$/i),
        confidence: z.number().min(0).max(1),
        timestamp: z.coerce.date(),
      }),
      req.body,
    );
    const tenant = requireTenant(req);
    const company = await Company.findById(tenant);
    if (!company) throw new HttpError(404, "NOT_FOUND", "Company not found.");
    let outcome:
      | "CHECK_IN"
      | "DUPLICATE"
      | "UNKNOWN_EMPLOYEE"
      | "LOW_CONFIDENCE"
      | "REVIEW_REQUIRED"
      | "REJECTED_STALE_EVENT"
      | "REJECTED_INVALID_CAMERA" = "REVIEW_REQUIRED";
    const duplicate = await CameraEvent.findOne({
      companyId: tenant,
      eventId: input.eventId,
    });
    if (duplicate) return res.json({ data: duplicate, repeated: true });
    const employee = await Employee.findOne({
      _id: input.employeeId,
      companyId: tenant,
      status: "ACTIVE",
    });
    if (
      input.cameraId !== "demo-front-desk" &&
      input.cameraId !== `${company.slug}-front-desk`
    )
      outcome = "REJECTED_INVALID_CAMERA";
    else if (!employee) outcome = "UNKNOWN_EMPLOYEE";
    else if (
      input.timestamp.getTime() < Date.now() - 10 * 60 * 1000 ||
      input.timestamp.getTime() > Date.now() + 60_000
    )
      outcome = "REJECTED_STALE_EVENT";
    else if (input.confidence < 0.9) outcome = "LOW_CONFIDENCE";
    else if (
      await AttendanceRecord.exists({
        companyId: tenant,
        employeeId: employee._id,
        dateKey: companyDateKey(input.timestamp, company.timezone),
      })
    )
      outcome = "DUPLICATE";
    else outcome = "REVIEW_REQUIRED"; // Simulations are always reviewable; they never silently record biometric attendance.
    let event;
    try {
      event = await CameraEvent.create({
        ...input,
        companyId: objectId(tenant),
        employeeId: employee?._id ?? null,
        outcome,
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === 11000) {
        const repeated = await CameraEvent.findOne({
          companyId: tenant,
          eventId: input.eventId,
        });
        if (repeated) return res.json({ data: repeated, repeated: true });
      }
      throw error;
    }
    await audit(req, "CAMERA_EVENT_REVIEW", "CameraEvent", event.id, {
      outcome,
    });
    res.status(201).json({ data: event });
  }),
);

api.get(
  "/salary-structures",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"),
  asyncRoute(async (req, res) => {
    res.json({
      data: await SalaryStructure.find({ companyId: requireTenant(req) }),
    });
  }),
);
api.post(
  "/salary-structures",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"),
  asyncRoute(async (req, res) => {
    const body = validate(
      z.object({
        name: z.string().min(2),
        basicCents: nonnegativeCents,
        housingCents: nonnegativeCents.default(0),
        transportCents: nonnegativeCents.default(0),
        otherAllowanceCents: nonnegativeCents.default(0),
      }),
      req.body,
    );
    const data = await SalaryStructure.create({
      ...body,
      companyId: objectId(requireTenant(req)),
      currency: config.DEFAULT_CURRENCY,
    });
    await audit(req, "SALARY_STRUCTURE_CREATED", "SalaryStructure", data.id);
    res.status(201).json({ data });
  }),
);
api.get(
  "/payroll-runs",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"),
  asyncRoute(async (req, res) => {
    res.json({
      data: await PayrollRun.find({ companyId: requireTenant(req) })
        .select("-items")
        .sort({ period: -1 }),
    });
  }),
);
api.get(
  "/payroll-runs/:id",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"),
  asyncRoute(async (req, res) => {
    const run = await PayrollRun.findOne({
      _id: routeId(req),
      companyId: requireTenant(req),
    });
    if (!run) throw new HttpError(404, "NOT_FOUND", "Payroll run not found.");
    res.json({ data: run });
  }),
);
api.post(
  "/payroll-runs",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"),
  asyncRoute(async (req, res) => {
    const { period } = validate(
      z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
      req.body,
    );
    const tenant = requireTenant(req);
    const employees = await Employee.find({
      companyId: tenant,
      status: "ACTIVE",
    }).select("+salaryCents");
    const items = employees
      .filter((employee) => employee.salaryCents > 0)
      .map((employee) => {
        const calculated = calculatePayroll({
          basicCents: employee.salaryCents,
        });
        return {
          employeeId: employee._id,
          employeeName: employee.name,
          employeeNumber: employee.employeeNumber,
          ...calculated,
        };
      });
    if (!items.length)
      throw new HttpError(
        409,
        "NO_ELIGIBLE_EMPLOYEES",
        "No active employees have a configured salary.",
      );
    try {
      const run = await PayrollRun.create({
        companyId: objectId(tenant),
        period,
        items,
        totalCents: items.reduce((sum, item) => sum + item.netCents, 0),
      });
      await audit(req, "PAYROLL_DRAFT_CREATED", "PayrollRun", run.id);
      return res.status(201).json({ data: run });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === 11000)
        throw new HttpError(
          409,
          "PERIOD_EXISTS",
          "A payroll run already exists for this period.",
        );
      throw error;
    }
  }),
);
api.post(
  "/payroll-runs/:id/approve",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"),
  asyncRoute(async (req, res) => {
    const run = await PayrollRun.findOneAndUpdate(
      { _id: routeId(req), companyId: requireTenant(req), status: "DRAFT" },
      {
        $set: {
          status: "APPROVED",
          approvedBy: objectId(req.authUser!.userId),
          approvedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!run)
      throw new HttpError(
        409,
        "INVALID_STATE",
        "Only draft payroll runs can be approved.",
      );
    await audit(req, "PAYROLL_APPROVED", "PayrollRun", run.id);
    res.json({ data: run });
  }),
);
api.post(
  "/payroll-runs/:id/process",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"),
  asyncRoute(async (req, res) => {
    const tenant = requireTenant(req);
    const key = req.header("idempotency-key");
    if (!key || key.length > 128)
      throw new HttpError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Provide an Idempotency-Key header.",
      );
    let run = await PayrollRun.findOne({
      _id: routeId(req),
      companyId: tenant,
    });
    if (!run) throw new HttpError(404, "NOT_FOUND", "Payroll run not found.");
    if (run.status === "PAID") return res.json({ data: run, repeated: true });
    if (run.status === "APPROVED")
      run =
        (await PayrollRun.findOneAndUpdate(
          { _id: run.id, companyId: tenant, status: "APPROVED" },
          { $set: { status: "PROCESSING" } },
          { new: true },
        )) ?? run;
    if (run.status !== "PROCESSING")
      throw new HttpError(
        409,
        "INVALID_STATE",
        "Only approved payroll can be processed.",
      );
    let payment = await Payment.findOne({
      companyId: tenant,
      payrollRunId: run._id,
    });
    if (!payment)
      payment = await Payment.create({
        companyId: objectId(tenant),
        payrollRunId: run._id,
        idempotencyKey: key,
        amountCents: run.totalCents,
        status: "PENDING",
      });
    if (payment.idempotencyKey !== key)
      throw new HttpError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This payroll run is already associated with another idempotency key.",
      );
    // Provider adapter is deterministic in development. Retries reuse the same key and reference.
    const providerReference = `mock_${run.id}_${key.slice(0, 12)}`;
    payment = await Payment.findByIdAndUpdate(
      payment.id,
      { $set: { status: "PAID", providerReference } },
      { new: true },
    );
    run = await PayrollRun.findByIdAndUpdate(
      run.id,
      { $set: { status: "PAID", providerReference } },
      { new: true },
    );
    await audit(req, "PAYROLL_PAYMENT_COMPLETED", "PayrollRun", run?.id, {
      amountCents: payment?.amountCents,
    });
    res.json({ data: run, payment, provider: "mock" });
  }),
);

api.get(
  "/wallets",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"),
  asyncRoute(async (req, res) => {
    res.json({
      data: await Wallet.find({ companyId: requireTenant(req) }).select(
        "-transactions",
      ),
    });
  }),
);
api.post(
  "/wallets/:id/transactions",
  requireAuth,
  requireRole("PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"),
  asyncRoute(async (req, res) => {
    const { direction, amountCents, memo } = validate(
      z.object({
        direction: z.enum(["CREDIT", "DEBIT"]),
        amountCents: positiveCents,
        memo: z.string().min(2).max(200),
      }),
      req.body,
    );
    const tenant = requireTenant(req);
    const key = req.header("idempotency-key");
    if (!key || key.length > 128)
      throw new HttpError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Provide an Idempotency-Key header.",
      );
    const wallet = await Wallet.findOne({
      _id: routeId(req),
      companyId: tenant,
    });
    if (!wallet) throw new HttpError(404, "NOT_FOUND", "Wallet not found.");
    const previous = wallet.transactions.find(
      (entry) => entry.operationKey === key,
    );
    if (previous) {
      if (
        previous.direction !== direction ||
        previous.amountCents !== amountCents ||
        previous.memo !== memo
      )
        throw new HttpError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This idempotency key was already used for a different transaction.",
        );
      return res.json({ data: wallet, repeated: true });
    }
    const balanceDelta = direction === "CREDIT" ? amountCents : -amountCents;
    const updated = await Wallet.findOneAndUpdate(
      {
        _id: wallet.id,
        companyId: tenant,
        balanceCents:
          direction === "DEBIT" ? { $gte: amountCents } : { $gte: 0 },
        "transactions.operationKey": { $ne: key },
      },
      {
        $inc: { balanceCents: balanceDelta },
        $push: {
          transactions: {
            operationKey: key,
            direction,
            amountCents,
            memo,
            actorId: objectId(req.authUser!.userId),
            createdAt: new Date(),
          },
        },
      },
      { new: true },
    );
    if (!updated) {
      const repeat = await Wallet.findOne({
        _id: wallet.id,
        companyId: tenant,
      });
      const prior = repeat?.transactions.find(
        (entry) => entry.operationKey === key,
      );
      if (
        prior &&
        prior.direction === direction &&
        prior.amountCents === amountCents &&
        prior.memo === memo
      )
        return res.json({ data: repeat, repeated: true });
      if (prior)
        throw new HttpError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This idempotency key was already used for a different transaction.",
        );
      throw new HttpError(
        409,
        "INSUFFICIENT_FUNDS",
        "The transaction would exceed the available wallet balance.",
      );
    }
    await audit(req, `WALLET_${direction}`, "Wallet", updated.id, {
      amountCents,
      operationKey: key,
    });
    res.json({ data: updated });
  }),
);

api.get(
  "/tickets",
  requireAuth,
  asyncRoute(async (req, res) => {
    const filter: Record<string, unknown> = { companyId: requireTenant(req) };
    if (req.authUser?.role === "EMPLOYEE")
      filter.employeeId = req.authUser.employeeId;
    res.json({
      data: await HRTicket.find(filter).sort({ createdAt: -1 }).limit(100),
    });
  }),
);
api.post(
  "/tickets",
  requireAuth,
  asyncRoute(async (req, res) => {
    const { title, description, category } = validate(
      z.object({
        title: z.string().min(3).max(120),
        description: z.string().min(5).max(2000),
        category: z.enum(["PAYROLL", "ATTENDANCE", "HR", "VENDOR"]),
      }),
      req.body,
    );
    const employeeId =
      req.authUser?.role === "EMPLOYEE" ? req.authUser.employeeId : null;
    const ticket = await HRTicket.create({
      companyId: objectId(requireTenant(req)),
      employeeId: employeeId ? objectId(employeeId) : null,
      title,
      description,
      category,
      source: "WEB",
    });
    await audit(req, "TICKET_CREATED", "HRTicket", ticket.id);
    res.status(201).json({ data: ticket });
  }),
);
api.post(
  "/support/message",
  requireAuth,
  asyncRoute(async (req, res) => {
    const { message } = validate(
      z.object({ message: z.string().min(2).max(2000) }),
      req.body,
    );
    const normalized = message.toLowerCase();
    const category = /salary|payroll|payslip|deduction/.test(normalized)
      ? "PAYROLL"
      : /check.?in|check.?out|attendance|late/.test(normalized)
        ? "ATTENDANCE"
        : "HR";
    const title =
      category === "PAYROLL"
        ? "Payroll question"
        : category === "ATTENDANCE"
          ? "Attendance review request"
          : "HR support request";
    const key = req.header("idempotency-key");
    let ticket = key
      ? await HRTicket.findOne({
          companyId: requireTenant(req),
          idempotencyKey: key,
        })
      : null;
    if (ticket && ticket.description !== message)
      throw new HttpError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This idempotency key was already used for a different support request.",
      );
    if (!ticket)
      ticket = await HRTicket.create({
        companyId: objectId(requireTenant(req)),
        employeeId: req.authUser?.employeeId
          ? objectId(req.authUser.employeeId)
          : null,
        title,
        description: message,
        category,
        source: "AI",
        idempotencyKey: key,
      });
    const response =
      category === "PAYROLL"
        ? "I opened a payroll review request for HR. The support assistant does not access salary data directly."
        : category === "ATTENDANCE"
          ? "I opened an attendance review request for HR."
          : "I opened an HR support request. A team member can review it.";
    await audit(req, "SUPPORT_REQUEST_CREATED", "HRTicket", ticket.id, {
      category,
    });
    res.json({
      data: {
        ticket,
        response,
        generatedBy: "deterministic-mock",
        escalated: true,
      },
    });
  }),
);

api.get(
  "/dashboard",
  requireAuth,
  asyncRoute(async (req, res) => {
    const tenant = requireTenant(req);
    const companyId = objectId(tenant);
    const company = await Company.findById(tenant);
    const dateKey = companyDateKey(
      new Date(),
      company?.timezone ?? config.DEFAULT_TIMEZONE,
    );
    const isEmployee = req.authUser?.role === "EMPLOYEE";
    const mayViewFinancials =
      req.authUser?.role === "COMPANY_ADMIN" ||
      req.authUser?.role === "PAYROLL_MANAGER" ||
      req.authUser?.role === "PLATFORM_ADMIN";
    const employeeFilter: Record<string, unknown> = { companyId };
    const attendanceFilter: Record<string, unknown> = { companyId, dateKey };
    const ticketFilter: Record<string, unknown> = {
      companyId,
      status: { $in: ["OPEN", "IN_REVIEW"] },
    };
    if (isEmployee) {
      employeeFilter._id = req.authUser?.employeeId;
      attendanceFilter.employeeId = req.authUser?.employeeId;
      ticketFilter.employeeId = req.authUser?.employeeId;
    }
    const [
      employees,
      active,
      candidates,
      checkedIn,
      late,
      payroll,
      pendingTickets,
      cameraReview,
      wallets,
    ] = await Promise.all([
      Employee.countDocuments(employeeFilter),
      Employee.countDocuments({ ...employeeFilter, status: "ACTIVE" }),
      isEmployee
        ? Promise.resolve(0)
        : Candidate.countDocuments({
            companyId,
            status: { $in: ["CANDIDATE", "OFFERED", "ACCEPTED"] },
          }),
      AttendanceRecord.countDocuments({
        ...attendanceFilter,
        checkedOutAt: null,
      }),
      AttendanceRecord.countDocuments({ ...attendanceFilter, status: "LATE" }),
      mayViewFinancials
        ? PayrollRun.findOne({ companyId })
            .sort({ period: -1 })
            .select("period status totalCents")
        : Promise.resolve(null),
      HRTicket.countDocuments(ticketFilter),
      isEmployee
        ? Promise.resolve(0)
        : CameraEvent.countDocuments({ companyId, outcome: "REVIEW_REQUIRED" }),
      mayViewFinancials
        ? Wallet.aggregate([
            { $match: { companyId } },
            { $group: { _id: null, totalCents: { $sum: "$balanceCents" } } },
          ])
        : Promise.resolve([]),
    ]);
    res.json({
      data: {
        employees,
        activeEmployees: active,
        openCandidates: candidates,
        checkedIn,
        late,
        currentPayroll: payroll,
        openTickets: pendingTickets,
        cameraReview,
        walletBalanceCents: mayViewFinancials
          ? (wallets[0]?.totalCents ?? 0)
          : null,
        currency: company?.currency ?? config.DEFAULT_CURRENCY,
      },
    });
  }),
);
api.get(
  "/audit-logs",
  requireAuth,
  requireRole("COMPANY_ADMIN", "PLATFORM_ADMIN"),
  asyncRoute(async (req, res) => {
    res.json({
      data: await AuditLog.find({ companyId: requireTenant(req) })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    });
  }),
);

app.use("/api/v1", mutationOrigin, api);
app.use((_req, res) =>
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Route not found." } }),
);
app.use(errorHandler);

export default app;
