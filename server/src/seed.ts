import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { config } from "./config.js";
import {
  AttendanceRecord,
  Candidate,
  Company,
  Employee,
  PayrollRun,
  SalaryStructure,
  User,
  Wallet,
} from "./models.js";

await mongoose.connect(config.MONGODB_URI);
const alpha = await Company.findOneAndUpdate(
  { slug: "terra-alpha" },
  {
    $set: {
      name: "Terra Alpha",
      timezone: "Asia/Dubai",
      currency: "AED",
      attendanceGraceMinutes: 0,
    },
  },
  { upsert: true, new: true },
);
const beta = await Company.findOneAndUpdate(
  { slug: "terra-beta" },
  {
    $set: {
      name: "Terra Beta",
      timezone: "Asia/Dubai",
      currency: "AED",
      attendanceGraceMinutes: 5,
    },
  },
  { upsert: true, new: true },
);
const passwordHash = await bcrypt.hash(config.DEMO_PASSWORD, 12);
const ensureUser = async (
  email: string,
  name: string,
  role: string,
  companyId: mongoose.Types.ObjectId | null,
  employeeId: mongoose.Types.ObjectId | null = null,
) =>
  User.findOneAndUpdate(
    { email },
    { $set: { name, role, companyId, employeeId, passwordHash } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

for (const [company, prefix, display] of [
  [alpha, "alpha", "Terra Alpha"],
  [beta, "beta", "Terra Beta"],
] as const) {
  const dept = prefix === "alpha" ? "People & Culture" : "Operations";
  const [hrEmployee, payrollEmployee, staff] = await Promise.all([
    Employee.findOneAndUpdate(
      { companyId: company._id, employeeNumber: `${prefix.toUpperCase()}-001` },
      {
        $set: {
          name: "Aisha Khan",
          email: `hr.${prefix}@hrterra.local`,
          department: dept,
          jobTitle: "HR Manager",
          status: "ACTIVE",
          salaryCents: 1250000,
          shiftStart: "09:00",
          shiftEnd: "17:00",
        },
      },
      { upsert: true, new: true },
    ),
    Employee.findOneAndUpdate(
      { companyId: company._id, employeeNumber: `${prefix.toUpperCase()}-002` },
      {
        $set: {
          name: "Omar Ali",
          email: `payroll.${prefix}@hrterra.local`,
          department: "Finance",
          jobTitle: "Payroll Manager",
          status: "ACTIVE",
          salaryCents: 1400000,
          shiftStart: "09:00",
          shiftEnd: "17:00",
        },
      },
      { upsert: true, new: true },
    ),
    Employee.findOneAndUpdate(
      { companyId: company._id, employeeNumber: `${prefix.toUpperCase()}-003` },
      {
        $set: {
          name: "Maya Noor",
          email: `employee.${prefix}@hrterra.local`,
          department: dept,
          jobTitle: "People Associate",
          status: "ACTIVE",
          salaryCents: 900000,
          shiftStart: "09:00",
          shiftEnd: "17:00",
        },
      },
      { upsert: true, new: true },
    ),
  ]);
  await Promise.all([
    ensureUser(
      `admin.${prefix}@hrterra.local`,
      `${display} Admin`,
      "COMPANY_ADMIN",
      company._id,
    ),
    ensureUser(
      `hr.${prefix}@hrterra.local`,
      "Aisha Khan",
      "HR_MANAGER",
      company._id,
      hrEmployee._id,
    ),
    ensureUser(
      `payroll.${prefix}@hrterra.local`,
      "Omar Ali",
      "PAYROLL_MANAGER",
      company._id,
      payrollEmployee._id,
    ),
    ensureUser(
      `employee.${prefix}@hrterra.local`,
      "Maya Noor",
      "EMPLOYEE",
      company._id,
      staff._id,
    ),
  ]);
  await SalaryStructure.findOneAndUpdate(
    { companyId: company._id, name: "Standard Monthly" },
    {
      $set: {
        basicCents: 900000,
        housingCents: 150000,
        transportCents: 50000,
        otherAllowanceCents: 0,
        currency: "AED",
      },
    },
    { upsert: true, new: true },
  );
  await Candidate.findOneAndUpdate(
    { companyId: company._id, email: `candidate.${prefix}@hrterra.local` },
    {
      $set: {
        name: `${display} Candidate`,
        position: "Product Designer",
        department: "Product",
        salaryCents: 1100000,
        status: "CANDIDATE",
      },
    },
    { upsert: true, new: true },
  );
  const period = new Date().toISOString().slice(0, 7);
  const employees = await Employee.find({
    companyId: company._id,
    status: "ACTIVE",
  }).select("+salaryCents");
  const items = employees.map((employee) => ({
    employeeId: employee._id,
    employeeName: employee.name,
    employeeNumber: employee.employeeNumber,
    grossCents: employee.salaryCents,
    deductionsCents: 0,
    bonusCents: 0,
    netCents: employee.salaryCents,
  }));
  await PayrollRun.findOneAndUpdate(
    { companyId: company._id, period },
    {
      $setOnInsert: {
        status: "DRAFT",
        items,
        totalCents: items.reduce((sum, item) => sum + item.netCents, 0),
      },
    },
    { upsert: true, new: true },
  );
  await Wallet.findOneAndUpdate(
    { companyId: company._id, ownerName: "Terra Operations" },
    {
      $setOnInsert: {
        balanceCents: 5000000,
        currency: "AED",
        transactions: [],
      },
    },
    { upsert: true, new: true },
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: company.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await AttendanceRecord.findOneAndUpdate(
    { companyId: company._id, employeeId: staff._id, dateKey: today },
    {
      $setOnInsert: {
        checkedInAt: new Date(),
        status: "PRESENT",
        lateMinutes: 0,
      },
    },
    { upsert: true, new: true },
  );
}
await ensureUser(
  "platform.admin@hrterra.local",
  "Platform Admin",
  "PLATFORM_ADMIN",
  null,
);
console.log(
  `Seeded Terra Alpha and Terra Beta. Demo password: ${config.DEMO_PASSWORD}`,
);
console.log(
  "Accounts: platform.admin@hrterra.local, admin.alpha@hrterra.local, hr.alpha@hrterra.local, payroll.alpha@hrterra.local, employee.alpha@hrterra.local (same prefix pattern for beta).",
);
await mongoose.disconnect();
