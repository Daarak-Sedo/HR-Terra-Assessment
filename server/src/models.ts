import mongoose, { Schema, Types } from "mongoose";

export const roles = [
  "PLATFORM_ADMIN",
  "COMPANY_ADMIN",
  "HR_MANAGER",
  "PAYROLL_MANAGER",
  "EMPLOYEE",
] as const;
export type Role = (typeof roles)[number];
export interface AuthContext {
  userId: string;
  companyId: string | null;
  role: Role;
  employeeId: string | null;
  name: string;
  email: string;
}

const companySchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    timezone: { type: String, default: "Asia/Dubai" },
    currency: { type: String, default: "AED" },
    attendanceGraceMinutes: { type: Number, default: 0 },
  },
  { timestamps: true },
);
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: roles, required: true },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true },
);
const employeeSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    employeeNumber: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: String,
    department: { type: String, required: true },
    jobTitle: { type: String, required: true },
    managerId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    joiningDate: { type: Date, default: Date.now },
    employmentType: {
      type: String,
      enum: ["Full-time", "Part-time", "Contractor", "Consultant"],
      default: "Full-time",
    },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    salaryStructureId: {
      type: Schema.Types.ObjectId,
      ref: "SalaryStructure",
      default: null,
    },
    shiftStart: { type: String, default: "09:00" },
    shiftEnd: { type: String, default: "17:00" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    salaryCents: { type: Number, select: false, default: 0 },
  },
  { timestamps: true },
);
employeeSchema.index({ companyId: 1, employeeNumber: 1 }, { unique: true });
employeeSchema.index({ companyId: 1, email: 1 }, { unique: true });
const candidateSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: String,
    position: { type: String, required: true },
    department: { type: String, required: true },
    salaryCents: { type: Number, required: true, min: 0 },
    proposedJoiningDate: Date,
    status: {
      type: String,
      enum: ["CANDIDATE", "OFFERED", "ACCEPTED", "CONVERTED"],
      default: "CANDIDATE",
    },
    conversionEmployeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
  },
  { timestamps: true },
);
candidateSchema.index({ companyId: 1, email: 1 }, { unique: true });
const attendanceSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    dateKey: { type: String, required: true },
    checkedInAt: { type: Date, required: true },
    checkedOutAt: Date,
    lateMinutes: { type: Number, default: 0 },
    earlyCheckoutMinutes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PRESENT", "LATE", "REVIEW"],
      required: true,
    },
    eventSource: {
      type: String,
      enum: ["WEB", "CAMERA", "MANUAL"],
      default: "WEB",
    },
  },
  { timestamps: true },
);
attendanceSchema.index(
  { companyId: 1, employeeId: 1, dateKey: 1 },
  { unique: true },
);
const cameraEventSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    eventId: { type: String, required: true },
    cameraId: { type: String, required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    outcome: {
      type: String,
      enum: [
        "CHECK_IN",
        "DUPLICATE",
        "UNKNOWN_EMPLOYEE",
        "LOW_CONFIDENCE",
        "REVIEW_REQUIRED",
        "REJECTED_STALE_EVENT",
        "REJECTED_INVALID_CAMERA",
      ],
      required: true,
    },
    confidence: Number,
    timestamp: Date,
  },
  { timestamps: true },
);
cameraEventSchema.index({ companyId: 1, eventId: 1 }, { unique: true });
const salarySchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    basicCents: { type: Number, required: true, min: 0 },
    housingCents: { type: Number, default: 0, min: 0 },
    transportCents: { type: Number, default: 0, min: 0 },
    otherAllowanceCents: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "AED" },
  },
  { timestamps: true },
);
const payrollItemSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    employeeName: { type: String, required: true },
    employeeNumber: { type: String, required: true },
    grossCents: { type: Number, required: true },
    deductionsCents: { type: Number, default: 0 },
    bonusCents: { type: Number, default: 0 },
    netCents: { type: Number, required: true },
  },
  { _id: false },
);
const payrollSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    period: { type: String, required: true },
    status: {
      type: String,
      enum: ["DRAFT", "APPROVED", "PROCESSING", "PAID", "FAILED"],
      default: "DRAFT",
    },
    items: { type: [payrollItemSchema], default: [] },
    totalCents: { type: Number, default: 0 },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: Date,
    providerReference: String,
    failureReason: String,
  },
  { timestamps: true },
);
payrollSchema.index({ companyId: 1, period: 1 }, { unique: true });
const paymentSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    payrollRunId: {
      type: Schema.Types.ObjectId,
      ref: "PayrollRun",
      required: true,
    },
    idempotencyKey: { type: String, required: true },
    amountCents: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
    },
    providerReference: String,
  },
  { timestamps: true },
);
paymentSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ companyId: 1, payrollRunId: 1 }, { unique: true });
const transactionSchema = new Schema(
  {
    operationKey: { type: String, required: true },
    direction: { type: String, enum: ["CREDIT", "DEBIT"], required: true },
    amountCents: { type: Number, required: true },
    memo: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);
const walletSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    ownerName: { type: String, required: true },
    balanceCents: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "AED" },
    transactions: { type: [transactionSchema], default: [] },
  },
  { timestamps: true },
);
const ticketSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ["PAYROLL", "ATTENDANCE", "HR", "VENDOR"],
      required: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_REVIEW", "RESOLVED"],
      default: "OPEN",
    },
    source: { type: String, enum: ["WEB", "AI"], default: "WEB" },
    idempotencyKey: String,
  },
  { timestamps: true },
);
ticketSchema.index(
  { companyId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true },
);
const auditSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const Company = mongoose.model("Company", companySchema);
export const User = mongoose.model("User", userSchema);
export const Employee = mongoose.model("Employee", employeeSchema);
export const Candidate = mongoose.model("Candidate", candidateSchema);
export const AttendanceRecord = mongoose.model(
  "AttendanceRecord",
  attendanceSchema,
);
export const CameraEvent = mongoose.model("CameraEvent", cameraEventSchema);
export const SalaryStructure = mongoose.model("SalaryStructure", salarySchema);
export const PayrollRun = mongoose.model("PayrollRun", payrollSchema);
export const Payment = mongoose.model("Payment", paymentSchema);
export const Wallet = mongoose.model("Wallet", walletSchema);
export const HRTicket = mongoose.model("HRTicket", ticketSchema);
export const AuditLog = mongoose.model("AuditLog", auditSchema);
export const objectId = (value: string): Types.ObjectId =>
  new Types.ObjectId(value);
