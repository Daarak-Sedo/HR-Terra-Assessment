import { lazy, Suspense, useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  Candidate,
  Dashboard,
  Employee,
  money,
  request,
  Ticket,
  User,
  Wallet,
  Payroll,
} from "./api";

const AttendanceChart = lazy(() => import("./components/AttendanceChart"));

const queryKey = ["session"];
function useSession() {
  return useQuery({
    queryKey,
    queryFn: () => request<{ user: User }>("/auth/me"),
    retry: false,
  });
}

export default function App() {
  const session = useSession();
  if (session.isLoading)
    return (
      <div className="loading-screen">
        <div className="brand-mark">t.</div>
        <span>Preparing your workspace</span>
      </div>
    );
  if (!session.data) return <Login />;
  return <Workspace user={session.data.user} />;
}

function Login() {
  const client = useQueryClient();
  const [email, setEmail] = useState("hr.alpha@hrterra.local");
  const [password, setPassword] = useState("TerraDemo!2026");
  const [error, setError] = useState("");
  const login = useMutation({
    mutationFn: () =>
      request<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (data) => {
      setError("");
      client.setQueryData(queryKey, data);
    },
  });
  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="login-brand">
          <span className="brand-mark">t.</span>
          <strong>
            terra<span>people, in sync</span>
          </strong>
        </div>
        <div className="visual-copy">
          <span className="eyebrow">PEOPLE OPERATIONS, IN ONE PLACE</span>
          <h1>
            Good work
            <br />
            starts with
            <br />
            <em>good people.</em>
          </h1>
          <p>
            A thoughtful workspace for your people, payroll and everyday
            operations.
          </p>
        </div>
        <div className="visual-footer">
          <span>HR Terra</span>
          <span>People operations, made clear.</span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-form">
          <div className="mobile-brand">
            <span className="brand-mark">t.</span> HR Terra
          </div>
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p className="muted">Enter your details below to continue.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              login.mutate();
            }}
          >
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error || login.error ? (
              <div className="form-error">
                {error || (login.error as Error).message}
              </div>
            ) : null}
            <button className="primary-btn wide" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
              <span>→</span>
            </button>
          </form>
          <div className="demo-note">
            <ShieldCheck size={16} />
            <span>
              <b>Demo access</b>
              <br />
              Use any seeded account. Password: <code>TerraDemo!2026</code>
            </span>
          </div>
          <div className="login-help">
            Need help signing in?{" "}
            <a href="mailto:support@hrterra.local">
              Contact your administrator
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

const navItems = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "People", path: "/employees", icon: Users },
  { label: "Hiring", path: "/hiring", icon: UserPlus },
  { label: "Attendance", path: "/attendance", icon: CalendarCheck },
  { label: "Payroll", path: "/payroll", icon: CreditCard },
  { label: "Wallets", path: "/wallets", icon: WalletCards },
  { label: "Support inbox", path: "/support", icon: MessageCircle },
];

function Workspace({ user }: { user: User }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState(user.companyId);
  const [searchOpen, setSearchOpen] = useState(false);
  const companies = useQuery({
    queryKey: ["companies"],
    queryFn: () =>
      request<{ data: { _id: string; name: string }[] }>("/companies"),
    enabled: user.role === "PLATFORM_ADMIN",
  });
  useEffect(() => {
    const firstCompanyId = companies.data?.data[0]?._id;
    if (user.role === "PLATFORM_ADMIN" && !companyId && firstCompanyId)
      setCompanyId(firstCompanyId);
  }, [user.role, companyId, companies.data]);
  const currentCompany = useQuery({
    queryKey: ["current-company", user.companyId],
    queryFn: () => request<{ data: { name: string } }>("/companies/current"),
    enabled: user.role !== "PLATFORM_ADMIN",
  });
  const logout = useMutation({
    mutationFn: () => request("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      window.location.reload();
    },
  });
  const active =
    navItems.find((item) => item.path === location.pathname)?.label ??
    "Overview";
  const allowedPaths: Record<User["role"], string[]> = {
    PLATFORM_ADMIN: navItems.map((item) => item.path),
    COMPANY_ADMIN: navItems.map((item) => item.path),
    HR_MANAGER: ["/", "/employees", "/hiring", "/attendance", "/support"],
    PAYROLL_MANAGER: [
      "/",
      "/employees",
      "/attendance",
      "/payroll",
      "/wallets",
      "/support",
    ],
    EMPLOYEE: ["/", "/attendance", "/support"],
  };
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="sidebar-brand">
          <span className="brand-mark">t.</span>
          <span>
            terra<small>PEOPLE OPERATIONS</small>
          </span>
        </Link>
        <div className="company-pill">
          <span className="company-icon">
            <Building2 size={16} />
          </span>
          <div>
            <small>WORKSPACE</small>
            <strong>
              {user.role === "PLATFORM_ADMIN"
                ? (companies.data?.data.find((c) => c._id === companyId)
                    ?.name ?? "Select company")
                : (currentCompany.data?.data.name ?? "Loading company…")}
            </strong>
          </div>
          {user.role === "PLATFORM_ADMIN" && <ChevronDown size={14} />}
        </div>
        {user.role === "PLATFORM_ADMIN" && (
          <select
            aria-label="Select company"
            value={companyId ?? ""}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">Choose a company</option>
            {companies.data?.data.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
        <div className="nav-section-label">WORKSPACE</div>
        <nav>
          {navItems
            .filter((item) => allowedPaths[user.role].includes(item.path))
            .map(({ label, path, icon: Icon }) => (
              <NavLink
                to={path}
                end={path === "/"}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
                key={path}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
                {label === "Support inbox" && <i className="nav-dot" />}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          {["PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"].includes(
            user.role,
          ) && (
            <NavLink to="/camera" className="nav-link">
              <Activity size={17} />
              <span>Camera events</span>
            </NavLink>
          )}
          {["COMPANY_ADMIN", "PLATFORM_ADMIN"].includes(user.role) && (
            <NavLink to="/audit" className="nav-link">
              <FileText size={17} />
              <span>Audit log</span>
            </NavLink>
          )}
          <a
            className="nav-link"
            href="http://localhost:4000/api/health/ready"
            target="_blank"
            rel="noreferrer"
          >
            <Settings size={17} />
            <span>System health</span>
          </a>
          <div className="sidebar-footer">
            <div className="avatar">{initials}</div>
            <div className="profile">
              <strong>{user.name}</strong>
              <small>{user.role.replace(/_/g, " ").toLowerCase()}</small>
            </div>
            <button
              className="icon-btn"
              title="Sign out"
              onClick={() => logout.mutate()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <b>/</b>
            <strong>{active}</strong>
          </div>
          <div className="top-actions">
            <button
              className="icon-btn"
              aria-label="Search"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Search size={18} />
            </button>
            <button
              className="icon-btn notification"
              aria-label="Notifications"
            >
              <Bell size={18} />
              <i />
            </button>
            <div className="top-avatar">{initials}</div>
          </div>
        </header>
        {searchOpen && (
          <div className="search-banner">
            <Search size={17} />
            <input
              autoFocus
              placeholder="Search employees, teams or roles…"
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchOpen(false);
              }}
            />
            <button className="icon-btn" onClick={() => setSearchOpen(false)}>
              <X size={16} />
            </button>
          </div>
        )}
        <section className="page-container">
          <Routes>
            <Route
              path="/"
              element={<DashboardPage user={user} companyId={companyId} />}
            />
            <Route
              path="/employees"
              element={<EmployeesPage user={user} companyId={companyId} />}
            />
            <Route
              path="/hiring"
              element={<HiringPage companyId={companyId} />}
            />
            <Route
              path="/attendance"
              element={<AttendancePage user={user} companyId={companyId} />}
            />
            <Route
              path="/payroll"
              element={<PayrollPage user={user} companyId={companyId} />}
            />
            <Route
              path="/wallets"
              element={<WalletsPage user={user} companyId={companyId} />}
            />
            <Route
              path="/support"
              element={<SupportPage companyId={companyId} />}
            />
            <Route
              path="/camera"
              element={<CameraPage companyId={companyId} />}
            />
            <Route
              path="/audit"
              element={<AuditPage companyId={companyId} />}
            />
            <Route
              path="*"
              element={
                <EmptyPage
                  title="Page not found"
                  detail="The page you are looking for is not available."
                />
              }
            />
          </Routes>
        </section>
      </main>
    </div>
  );
}

function useApiQuery<T>(key: string, path: string, companyId: string | null) {
  return useQuery({
    queryKey: [key, companyId],
    queryFn: () => request<{ data: T }>(path, {}, companyId),
    enabled: Boolean(companyId) || path === "/auth/me",
    refetchInterval: key === "dashboard" ? 30000 : false,
  });
}
function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function DashboardPage({
  user,
  companyId,
}: {
  user: User;
  companyId: string | null;
}) {
  const query = useApiQuery<Dashboard>("dashboard", "/dashboard", companyId);
  const data = query.data?.data;
  const stats = [
    {
      label: "Active people",
      value: data?.activeEmployees ?? "—",
      note: `${data?.employees ?? 0} total employees`,
      icon: Users,
      color: "sage",
    },
    {
      label: "Checked in today",
      value: data?.checkedIn ?? "—",
      note: `${data?.late ?? 0} arrived late`,
      icon: CalendarCheck,
      color: "blue",
    },
    {
      label: "Open positions",
      value: data?.openCandidates ?? "—",
      note: "Candidates in progress",
      icon: UserPlus,
      color: "gold",
    },
    {
      label: "Wallet balance",
      value:
        data?.walletBalanceCents === null
          ? "Restricted"
          : data
            ? money(data.walletBalanceCents ?? 0, data.currency)
            : "—",
      note: "Across company wallets",
      icon: WalletCards,
      color: "violet",
    },
  ];
  const visibleStats =
    data?.walletBalanceCents === null ? stats.slice(0, 3) : stats;
  const attendanceData = [
    {
      label: "On time",
      people: Math.max(0, (data?.checkedIn ?? 0) - (data?.late ?? 0)),
    },
    { label: "Late", people: data?.late ?? 0 },
    {
      label: "Not in",
      people: Math.max(
        0,
        (data?.activeEmployees ?? 0) - (data?.checkedIn ?? 0),
      ),
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow={new Intl.DateTimeFormat("en", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
          .format(new Date())
          .toUpperCase()}
        title={`Good morning, ${user.name.split(" ")[0]}.`}
        description="Here’s what’s happening across your people operations today."
        action={
          <button className="secondary-btn" onClick={() => query.refetch()}>
            <Activity size={16} /> Refresh data
          </button>
        }
      />
      {query.isError && (
        <div className="alert">{(query.error as Error).message}</div>
      )}
      <div className={`stat-grid${visibleStats.length === 3 ? " three" : ""}`}>
        {visibleStats.map(({ label, value, note, icon: Icon, color }) => (
          <article className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <div className={`stat-icon ${color}`}>
                <Icon size={17} />
              </div>
            </div>
            <strong className="stat-value">{value}</strong>
            <span className="stat-note">{note}</span>
          </article>
        ))}
      </div>
      <div className="content-grid">
        <section className="panel attendance-panel">
          <div className="panel-heading">
            <div>
              <h2>Attendance pulse</h2>
              <p>Today’s check-ins at a glance</p>
            </div>
            <span className="live-label">
              <i /> LIVE
            </span>
          </div>
          <div className="pulse-number">
            <strong>{data?.checkedIn ?? "—"}</strong>
            <span>people checked in</span>
          </div>
          <div className="pulse-bar">
            <span
              style={{
                width: `${data?.activeEmployees ? Math.min(100, (data.checkedIn / data.activeEmployees) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="pulse-foot">
            <span>0</span>
            <span>{data?.activeEmployees ?? 0} active people</span>
          </div>
          <div className="attendance-chart">
            <Suspense
              fallback={<div className="chart-loading">Loading chart…</div>}
            >
              <AttendanceChart data={attendanceData} />
            </Suspense>
          </div>
          <div className="attendance-insight">
            <div className="insight-icon">
              <CalendarCheck size={18} />
            </div>
            <div>
              <strong>{data?.late ?? 0} late arrivals</strong>
              <span>
                Attendance is calculated using your company’s local time.
              </span>
            </div>
            <Link to="/attendance">
              View attendance <span>→</span>
            </Link>
          </div>
        </section>
        <section className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <h2>Quick actions</h2>
              <p>Common tasks, right at hand</p>
            </div>
            <CircleHelp size={17} className="muted-icon" />
          </div>
          <div className="quick-list">
            {["PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"].includes(
              user.role,
            ) && (
              <Link to="/employees" className="quick-item">
                <span className="quick-icon sage">
                  <UserPlus size={18} />
                </span>
                <span>
                  <strong>Add a new person</strong>
                  <small>Create an employee profile</small>
                </span>
                <span className="arrow">↗</span>
              </Link>
            )}
            {["PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"].includes(
              user.role,
            ) && (
              <Link to="/hiring" className="quick-item">
                <span className="quick-icon gold">
                  <Users size={18} />
                </span>
                <span>
                  <strong>Review candidates</strong>
                  <small>Move hiring forward</small>
                </span>
                <span className="arrow">↗</span>
              </Link>
            )}
            {["PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"].includes(
              user.role,
            ) && (
              <Link to="/payroll" className="quick-item">
                <span className="quick-icon blue">
                  <CreditCard size={18} />
                </span>
                <span>
                  <strong>Review payroll</strong>
                  <small>
                    {data?.currentPayroll?.period ?? "No payroll run yet"}
                  </small>
                </span>
                <span className="arrow">↗</span>
              </Link>
            )}
            <Link to="/support" className="quick-item">
              <span className="quick-icon violet">
                <MessageCircle size={18} />
              </span>
              <span>
                <strong>Get people support</strong>
                <small>Questions and review requests</small>
              </span>
              <span className="arrow">↗</span>
            </Link>
          </div>
        </section>
      </div>
      <section className="panel lower-panel">
        <div className="panel-heading">
          <div>
            <h2>Payroll overview</h2>
            <p>Latest period status and team requests</p>
          </div>
          <Link className="text-link" to="/payroll">
            View payroll <span>→</span>
          </Link>
        </div>
        <div className="overview-row">
          <div className="overview-cell">
            <span className="cell-label">CURRENT PERIOD</span>
            <strong>{data?.currentPayroll?.period ?? "—"}</strong>
            <span className="cell-note">Latest payroll run</span>
          </div>
          <div className="overview-cell">
            <span className="cell-label">RUN STATUS</span>
            <strong>
              <span
                className={`status-tag ${data?.currentPayroll?.status?.toLowerCase() ?? "pending"}`}
              >
                {data?.currentPayroll?.status ?? "Not started"}
              </span>
            </strong>
            <span className="cell-note">State managed by payroll</span>
          </div>
          <div className="overview-cell">
            <span className="cell-label">TOTAL PAYROLL</span>
            <strong>
              {data?.currentPayroll
                ? money(data.currentPayroll.totalCents, data.currency)
                : "—"}
            </strong>
            <span className="cell-note">Snapshot amount</span>
          </div>
          <div className="overview-cell">
            <span className="cell-label">OPEN REQUESTS</span>
            <strong>{data?.openTickets ?? "—"}</strong>
            <span className="cell-note">Waiting for HR review</span>
          </div>
        </div>
      </section>
      <div className="page-footnote">
        <ShieldCheck size={15} /> Signed in with{" "}
        <b>{user.role.replace(/_/g, " ")}</b> access. Workspace data is scoped
        to your company.
      </div>
    </>
  );
}

const employeeSchema = z.object({
  employeeNumber: z.string().min(2, "Enter an employee number"),
  name: z.string().min(2, "Enter a name"),
  email: z.string().email("Enter a valid email"),
  department: z.string().min(2, "Enter a department"),
  jobTitle: z.string().min(2, "Enter a job title"),
  employmentType: z.enum([
    "Full-time",
    "Part-time",
    "Contractor",
    "Consultant",
  ]),
});
function EmployeesPage({
  user,
  companyId,
}: {
  user: User;
  companyId: string | null;
}) {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();
  const employees = useQuery({
    queryKey: ["employees", companyId, search],
    queryFn: () =>
      request<{ data: Employee[] }>(
        `/employees?search=${encodeURIComponent(search)}`,
        {},
        companyId,
      ),
    enabled: Boolean(companyId),
  });
  const form = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { employmentType: "Full-time" },
  });
  const create = useMutation({
    mutationFn: (body: z.infer<typeof employeeSchema>) =>
      request(
        "/employees",
        { method: "POST", body: JSON.stringify(body) },
        companyId,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setShowForm(false);
      form.reset();
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="PEOPLE DIRECTORY"
        title="People"
        description="Your team, all in one place. Keep employee details up to date."
        action={
          ["PLATFORM_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"].includes(
            user.role,
          ) ? (
            <button
              className="primary-btn"
              onClick={() => setShowForm(!showForm)}
            >
              <UserPlus size={16} /> Add person
            </button>
          ) : undefined
        }
      />
      {showForm && (
        <form
          className="panel form-panel"
          onSubmit={form.handleSubmit((data) => create.mutate(data))}
        >
          <div className="form-panel-heading">
            <div>
              <h2>Add employee</h2>
              <p>Start a new employee profile.</p>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close"
              onClick={() => setShowForm(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            {(
              [
                "employeeNumber",
                "name",
                "email",
                "department",
                "jobTitle",
              ] as const
            ).map((name) => (
              <label key={name}>
                {name === "employeeNumber"
                  ? "Employee number"
                  : name === "jobTitle"
                    ? "Job title"
                    : name[0]!.toUpperCase() + name.slice(1)}
                <input
                  {...form.register(name)}
                  placeholder={name === "employeeNumber" ? "TERRA-104" : ""}
                />
                {form.formState.errors[name] && (
                  <small className="field-error">
                    {form.formState.errors[name]?.message}
                  </small>
                )}
              </label>
            ))}
            <label>
              Employment type
              <select {...form.register("employmentType")}>
                <option>Full-time</option>
                <option>Part-time</option>
                <option>Contractor</option>
                <option>Consultant</option>
              </select>
            </label>
          </div>
          {create.error && (
            <div className="form-error">{(create.error as Error).message}</div>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button className="primary-btn" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Create profile"}
            </button>
          </div>
        </form>
      )}
      <div className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>
              All employees{" "}
              <span className="count-pill">
                {employees.data?.data.length ?? 0}
              </span>
            </h2>
            <p>Search your company directory</p>
          </div>
          <div className="table-search">
            <Search size={16} />
            <input
              placeholder="Search by name, email or team"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {employees.isLoading ? (
          <div className="empty-state">Loading employees…</div>
        ) : employees.isError ? (
          <div className="empty-state">
            {(employees.error as Error).message}
          </div>
        ) : employees.data?.data.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>EMPLOYEE ID</th>
                  <th>DEPARTMENT</th>
                  <th>ROLE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {employees.data.data.map((employee) => (
                  <tr key={employee._id}>
                    <td>
                      <div className="employee-cell">
                        <div className="avatar soft">
                          {employee.name
                            .split(" ")
                            .map((s) => s[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div>
                          <strong>{employee.name}</strong>
                          <small>{employee.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>{employee.employeeNumber}</td>
                    <td>{employee.department}</td>
                    <td>{employee.jobTitle}</td>
                    <td>
                      <span
                        className={`status-tag ${employee.status.toLowerCase()}`}
                      >
                        {employee.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPage
            title="No employees yet"
            detail="Create your first employee profile to get started."
          />
        )}
      </div>
    </>
  );
}

function HiringPage({ companyId }: { companyId: string | null }) {
  const client = useQueryClient();
  const candidates = useQuery({
    queryKey: ["candidates", companyId],
    queryFn: () => request<{ data: Candidate[] }>("/candidates", {}, companyId),
    enabled: Boolean(companyId),
  });
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const refresh = () => client.invalidateQueries({ queryKey: ["candidates"] });
  const create = useMutation({
    mutationFn: () =>
      request(
        "/candidates",
        {
          method: "POST",
          body: JSON.stringify({
            name,
            email,
            position,
            department,
            salaryCents: 0,
          }),
        },
        companyId,
      ),
    onSuccess: () => {
      refresh();
      setShow(false);
    },
  });
  const action = useMutation({
    mutationFn: ({
      id,
      step,
    }: {
      id: string;
      step: "offer" | "accept" | "convert";
    }) =>
      request(
        `/candidates/${id}/${step}`,
        { method: "POST", body: "{}" },
        companyId,
      ),
    onSuccess: refresh,
  });
  return (
    <>
      <PageHeading
        eyebrow="TALENT PIPELINE"
        title="Hiring"
        description="From first conversation to a new teammate."
        action={
          <button className="primary-btn" onClick={() => setShow(!show)}>
            <UserPlus size={16} /> Add candidate
          </button>
        }
      />
      {show && (
        <div className="panel compact-form">
          <h2>New candidate</h2>
          <div className="form-grid">
            {[
              ["Name", name, setName],
              ["Email", email, setEmail],
              ["Position", position, setPosition],
              ["Department", department, setDepartment],
            ].map(([label, value, setter]) => (
              <label key={label as string}>
                {label as string}
                <input
                  value={value as string}
                  onChange={(e) =>
                    (setter as (v: string) => void)(e.target.value)
                  }
                />
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="secondary-btn" onClick={() => setShow(false)}>
              Cancel
            </button>
            <button
              className="primary-btn"
              onClick={() => create.mutate()}
              disabled={create.isPending}
            >
              Save candidate
            </button>
          </div>
          {create.error && (
            <div className="form-error">{(create.error as Error).message}</div>
          )}
        </div>
      )}
      <div className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Candidate pipeline</h2>
            <p>Move candidates through the hiring process.</p>
          </div>
        </div>
        <div className="candidate-grid">
          {candidates.data?.data.map((candidate) => (
            <article className="candidate-card" key={candidate._id}>
              <div className="candidate-avatar">
                {candidate.name
                  .split(" ")
                  .map((s) => s[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <span className={`status-tag ${candidate.status.toLowerCase()}`}>
                {candidate.status}
              </span>
              <h3>{candidate.name}</h3>
              <p>
                {candidate.position} · {candidate.department}
              </p>
              <small>{candidate.email}</small>
              <div className="candidate-actions">
                {candidate.status === "CANDIDATE" && (
                  <button
                    className="secondary-btn small"
                    onClick={() =>
                      action.mutate({ id: candidate._id, step: "offer" })
                    }
                  >
                    Issue offer
                  </button>
                )}
                {candidate.status === "OFFERED" && (
                  <button
                    className="secondary-btn small"
                    onClick={() =>
                      action.mutate({ id: candidate._id, step: "accept" })
                    }
                  >
                    Accept offer
                  </button>
                )}
                {candidate.status === "ACCEPTED" && (
                  <button
                    className="primary-btn small"
                    onClick={() =>
                      action.mutate({ id: candidate._id, step: "convert" })
                    }
                  >
                    Convert to employee
                  </button>
                )}
                {candidate.status === "CONVERTED" && (
                  <span className="converted">
                    <Check size={14} /> Converted
                  </span>
                )}
              </div>
            </article>
          ))}
          {!candidates.data?.data.length && (
            <div className="empty-state">
              No candidates in this pipeline yet.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function AttendancePage({
  user,
  companyId,
}: {
  user: User;
  companyId: string | null;
}) {
  const client = useQueryClient();
  const employees = useQuery({
    queryKey: ["employees", companyId],
    queryFn: () => request<{ data: Employee[] }>("/employees", {}, companyId),
    enabled: Boolean(companyId),
  });
  const attendance = useQuery({
    queryKey: ["attendance", companyId],
    queryFn: () =>
      request<{ data: Record<string, unknown>[] }>(
        "/attendance",
        {},
        companyId,
      ),
    enabled: Boolean(companyId),
  });
  const [employeeId, setEmployeeId] = useState(user.employeeId ?? "");
  const selfOnly = ["EMPLOYEE", "PAYROLL_MANAGER"].includes(user.role);
  const targetEmployeeId = selfOnly ? (user.employeeId ?? "") : employeeId;
  const action = useMutation({
    mutationFn: (type: "check-in" | "check-out") =>
      request(
        `/attendance/${type}`,
        {
          method: "POST",
          body: JSON.stringify(
            targetEmployeeId ? { employeeId: targetEmployeeId } : {},
          ),
        },
        companyId,
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["attendance"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="TIME & ATTENDANCE"
        title="Attendance"
        description="Check-ins use company local time. Every calculation is validated on the server."
      />
      <div className="panel attendance-action">
        {!selfOnly && (
          <label>
            Select employee
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Choose a person</option>
              {employees.data?.data.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.name} · {e.employeeNumber}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="primary-btn"
          disabled={!targetEmployeeId || action.isPending}
          onClick={() => action.mutate("check-in")}
        >
          <ArrowDownRight size={16} /> Check in
        </button>
        <button
          className="secondary-btn"
          disabled={!targetEmployeeId || action.isPending}
          onClick={() => action.mutate("check-out")}
        >
          <ArrowUpRight size={16} /> Check out
        </button>
        {action.error && (
          <span className="form-error">{(action.error as Error).message}</span>
        )}
        {action.isSuccess && (
          <span className="success-inline">
            <Check size={15} /> Attendance saved
          </span>
        )}
      </div>
      <div className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Recent records</h2>
            <p>Latest attendance activity for your team.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th>DATE</th>
                <th>CHECK IN</th>
                <th>CHECK OUT</th>
                <th>LATE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {attendance.data?.data.map((record, index) => (
                <tr key={String(record._id ?? index)}>
                  <td>
                    {(record.employeeId as { name?: string })?.name ??
                      (user.role === "EMPLOYEE" ? user.name : "Employee")}
                  </td>
                  <td>{String(record.dateKey ?? "")}</td>
                  <td>
                    {record.checkedInAt
                      ? new Date(String(record.checkedInAt)).toLocaleTimeString(
                          [],
                          { hour: "2-digit", minute: "2-digit" },
                        )
                      : "—"}
                  </td>
                  <td>
                    {record.checkedOutAt
                      ? new Date(
                          String(record.checkedOutAt),
                        ).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td>{Number(record.lateMinutes ?? 0)} min</td>
                  <td>
                    <span
                      className={`status-tag ${String(record.status).toLowerCase()}`}
                    >
                      {String(record.status).toLowerCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!attendance.data?.data.length && (
          <div className="empty-state">No attendance records yet.</div>
        )}
      </div>
    </>
  );
}

function PayrollPage({
  user,
  companyId,
}: {
  user: User;
  companyId: string | null;
}) {
  const client = useQueryClient();
  const payroll = useQuery({
    queryKey: ["payroll", companyId],
    queryFn: () => request<{ data: Payroll[] }>("/payroll-runs", {}, companyId),
    enabled: Boolean(companyId),
  });
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [selected, setSelected] = useState<Payroll | null>(null);
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["payroll"] });
    client.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const create = useMutation({
    mutationFn: () =>
      request<{ data: Payroll }>(
        "/payroll-runs",
        { method: "POST", body: JSON.stringify({ period }) },
        companyId,
      ),
    onSuccess: (r) => {
      setSelected(r.data);
      refresh();
    },
  });
  const step = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "approve" | "process";
    }) =>
      request(
        `/payroll-runs/${id}/${action}`,
        {
          method: "POST",
          body: "{}",
          headers:
            action === "process" ? { "Idempotency-Key": `payroll-${id}` } : {},
        },
        companyId,
      ),
    onSuccess: refresh,
  });
  return (
    <>
      <PageHeading
        eyebrow="PAY & COMPENSATION"
        title="Payroll"
        description="Exact minor-unit amounts, approved state transitions and retry-safe processing."
        action={
          ["PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"].includes(
            user.role,
          ) ? (
            <div className="action-with-input">
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
              <button
                className="primary-btn"
                onClick={() => create.mutate()}
                disabled={create.isPending}
              >
                Create payroll
              </button>
            </div>
          ) : undefined
        }
      />
      {create.error && (
        <div className="alert">{(create.error as Error).message}</div>
      )}
      {step.error && (
        <div className="alert">{(step.error as Error).message}</div>
      )}
      <div className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Payroll runs</h2>
            <p>
              Active employees with configured salary are snapshotted at
              creation.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PERIOD</th>
                <th>EMPLOYEES</th>
                <th>TOTAL</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {payroll.data?.data.map((run) => (
                <tr key={run._id}>
                  <td>
                    <strong>{run.period}</strong>
                  </td>
                  <td>Snapshot</td>
                  <td>{money(run.totalCents)}</td>
                  <td>
                    <span className={`status-tag ${run.status.toLowerCase()}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="row-actions">
                    {run.status === "DRAFT" && (
                      <button
                        className="secondary-btn small"
                        onClick={() =>
                          step.mutate({ id: run._id, action: "approve" })
                        }
                      >
                        Approve
                      </button>
                    )}
                    {run.status === "APPROVED" && (
                      <button
                        className="primary-btn small"
                        onClick={() =>
                          step.mutate({ id: run._id, action: "process" })
                        }
                      >
                        Process payment
                      </button>
                    )}
                    {run.status === "PAID" && (
                      <span className="converted">
                        <Check size={14} /> Paid
                      </span>
                    )}
                    <button
                      className="text-link small"
                      onClick={() => setSelected(run)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!payroll.data?.data.length && (
          <div className="empty-state">No payroll runs yet.</div>
        )}
      </div>
      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-backdrop" />
          <Dialog.Content className="modal panel">
            <div className="form-panel-heading">
              <div>
                <span className="eyebrow">PAYROLL DETAIL</span>
                <Dialog.Title className="dialog-title">
                  {selected?.period} payroll
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="icon-btn" aria-label="Close payroll details">
                  <X size={17} />
                </button>
              </Dialog.Close>
            </div>
            <p className="muted">
              {selected ? money(selected.totalCents) : ""} · {selected?.status}
            </p>
            <p className="muted">
              Employee details are limited to payroll roles.
            </p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function WalletsPage({
  user,
  companyId,
}: {
  user: User;
  companyId: string | null;
}) {
  const client = useQueryClient();
  const wallets = useQuery({
    queryKey: ["wallets", companyId],
    queryFn: () => request<{ data: Wallet[] }>("/wallets", {}, companyId),
    enabled: Boolean(companyId),
  });
  const [selected, setSelected] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("DEBIT");
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const mutate = useMutation({
    mutationFn: () =>
      request(
        `/wallets/${selected}/transactions`,
        {
          method: "POST",
          headers: { "Idempotency-Key": operationKey },
          body: JSON.stringify({
            direction,
            amountCents: Math.round(Number(amount) * 100),
            memo,
          }),
        },
        companyId,
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["wallets"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
      setAmount("");
      setMemo("");
      setOperationKey(crypto.randomUUID());
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="CONTRACTOR PAYMENTS"
        title="Wallets"
        description="Wallet balance and its transaction ledger update together as a single atomic operation."
      />
      {["PLATFORM_ADMIN", "COMPANY_ADMIN", "PAYROLL_MANAGER"].includes(
        user.role,
      ) ? (
        <>
          {wallets.error && (
            <div className="alert">{(wallets.error as Error).message}</div>
          )}
          <div className="wallet-grid">
            {wallets.data?.data.map((wallet) => (
              <article className="wallet-card" key={wallet._id}>
                <div className="wallet-card-top">
                  <span className="quick-icon violet">
                    <WalletCards size={18} />
                  </span>
                  <span className="status-tag active">ACTIVE</span>
                </div>
                <span className="cell-label">{wallet.ownerName}</span>
                <strong>{money(wallet.balanceCents, wallet.currency)}</strong>
                <small>Available balance · {wallet.currency}</small>
              </article>
            ))}
          </div>
          <div className="panel compact-form">
            <h2>Record a wallet transaction</h2>
            <p className="muted">
              Use an idempotency key to safely retry a request.
            </p>
            <div className="form-grid">
              <label>
                Wallet
                <select
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setOperationKey(crypto.randomUUID());
                  }}
                >
                  <option value="">Choose wallet</option>
                  {wallets.data?.data.map((wallet) => (
                    <option key={wallet._id} value={wallet._id}>
                      {wallet.ownerName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select
                  value={direction}
                  onChange={(e) => {
                    setDirection(e.target.value as "CREDIT" | "DEBIT");
                    setOperationKey(crypto.randomUUID());
                  }}
                >
                  <option value="DEBIT">Debit</option>
                  <option value="CREDIT">Credit</option>
                </select>
              </label>
              <label>
                Amount (AED)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setOperationKey(crypto.randomUUID());
                  }}
                />
              </label>
              <label>
                Memo
                <input
                  value={memo}
                  onChange={(e) => {
                    setMemo(e.target.value);
                    setOperationKey(crypto.randomUUID());
                  }}
                  placeholder="e.g. Contractor services"
                />
              </label>
            </div>
            {mutate.error && (
              <div className="form-error">
                {(mutate.error as Error).message}
              </div>
            )}
            {mutate.isSuccess && (
              <div className="success-inline">
                <Check size={15} /> Transaction recorded
              </div>
            )}
            <div className="form-actions">
              <button
                className="primary-btn"
                disabled={!selected || !amount || !memo || mutate.isPending}
                onClick={() => mutate.mutate()}
              >
                Record transaction
              </button>
            </div>
          </div>
        </>
      ) : (
        <EmptyPage
          title="Restricted access"
          detail="Wallets are available to company and payroll administrators."
        />
      )}
    </>
  );
}

function SupportPage({ companyId }: { companyId: string | null }) {
  const client = useQueryClient();
  const tickets = useQuery({
    queryKey: ["tickets", companyId],
    queryFn: () => request<{ data: Ticket[] }>("/tickets", {}, companyId),
    enabled: Boolean(companyId),
  });
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const send = useMutation({
    mutationFn: () =>
      request<{ data: { response: string } }>(
        "/support/message",
        {
          method: "POST",
          headers: { "Idempotency-Key": requestKey },
          body: JSON.stringify({ message }),
        },
        companyId,
      ),
    onSuccess: (r) => {
      setReply(r.data.response);
      setMessage("");
      setRequestKey(crypto.randomUUID());
      client.invalidateQueries({ queryKey: ["tickets"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="PEOPLE SUPPORT"
        title="Support inbox"
        description="A shared support workflow for employee questions and review requests."
      />
      <div className="content-grid support-grid">
        <section className="panel chat-panel">
          <div className="panel-heading">
            <div>
              <h2>HR support assistant</h2>
              <p>Rule-based demo · human review included</p>
            </div>
            <span className="ai-badge">MOCK AI</span>
          </div>
          <div className="chat-message bot">
            <span className="chat-avatar">t.</span>
            <div>
              <span className="chat-name">Terra support</span>
              <p>
                Hi {"there"}! Tell me what you need help with. I can open a
                review request for payroll or attendance questions.
              </p>
            </div>
          </div>
          {reply && (
            <>
              <div className="chat-message user-message">
                <div>
                  <span className="chat-name">You</span>
                  <p>
                    {reply.includes("payroll") ? "Payroll review request" : ""}
                    {reply.includes("attendance")
                      ? "Attendance review request"
                      : ""}
                    {!reply.includes("payroll") && !reply.includes("attendance")
                      ? "HR request"
                      : ""}
                  </p>
                </div>
              </div>
              <div className="chat-message bot">
                <span className="chat-avatar">t.</span>
                <div>
                  <span className="chat-name">Terra support</span>
                  <p>{reply}</p>
                </div>
              </div>
            </>
          )}
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
              setReply("");
            }}
          >
            <input
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setRequestKey(crypto.randomUUID());
              }}
              placeholder="Type your question here…"
            />
            <button
              className="primary-btn"
              disabled={message.length < 2 || send.isPending}
            >
              Send <span>↑</span>
            </button>
          </form>
          {send.error && (
            <div className="form-error">{(send.error as Error).message}</div>
          )}
          <small className="chat-disclaimer">
            AI generated responses are clearly labeled. Consequential requests
            go to HR.
          </small>
        </section>
        <section className="panel ticket-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent requests</h2>
              <p>Team follow-ups and escalations</p>
            </div>
            <span className="count-pill">{tickets.data?.data.length ?? 0}</span>
          </div>
          <div className="ticket-list">
            {tickets.data?.data.map((ticket) => (
              <article className="ticket-row" key={ticket._id}>
                <span
                  className={`ticket-icon ${ticket.category.toLowerCase()}`}
                >
                  <FileText size={16} />
                </span>
                <div>
                  <strong>{ticket.title}</strong>
                  <p>{ticket.description}</p>
                  <small>
                    {new Date(ticket.createdAt).toLocaleDateString()} ·{" "}
                    {ticket.source === "AI"
                      ? "Support assistant"
                      : "Web request"}
                  </small>
                </div>
                <span className={`status-tag ${ticket.status.toLowerCase()}`}>
                  {ticket.status}
                </span>
              </article>
            ))}
            {!tickets.data?.data.length && (
              <div className="empty-state">
                No open requests. Ask a question to create one.
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function CameraPage({ companyId }: { companyId: string | null }) {
  const client = useQueryClient();
  const employees = useQuery({
    queryKey: ["employees", companyId],
    queryFn: () => request<{ data: Employee[] }>("/employees", {}, companyId),
    enabled: Boolean(companyId),
  });
  const events = useQuery({
    queryKey: ["camera", companyId],
    queryFn: () =>
      request<{ data: Record<string, unknown>[] }>(
        "/camera-events",
        {},
        companyId,
      ),
    enabled: Boolean(companyId),
  });
  const [employeeId, setEmployeeId] = useState("");
  const simulate = useMutation({
    mutationFn: () =>
      request(
        "/camera-events/simulate",
        {
          method: "POST",
          body: JSON.stringify({
            eventId: crypto.randomUUID(),
            cameraId: "demo-front-desk",
            employeeId,
            confidence: 0.96,
            timestamp: new Date().toISOString(),
          }),
        },
        companyId,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["camera"] }),
  });
  return (
    <>
      <PageHeading
        eyebrow="DEVICE EVENTS"
        title="Camera review"
        description="Simulated events enter the review queue. This demo does not perform face recognition."
      />
      <div className="panel compact-form">
        <h2>Simulate a camera event</h2>
        <div className="inline-controls">
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Choose employee</option>
            {employees.data?.data.map((e) => (
              <option key={e._id} value={e._id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            className="secondary-btn"
            disabled={!employeeId}
            onClick={() => simulate.mutate()}
          >
            Send simulated event
          </button>
          <span className="muted">Event is saved for human review.</span>
        </div>
        {simulate.error && (
          <div className="form-error">{(simulate.error as Error).message}</div>
        )}
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Recent camera events</h2>
            <p>No biometric images or templates are stored.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>EVENT</th>
                <th>CAMERA</th>
                <th>EMPLOYEE</th>
                <th>CONFIDENCE</th>
                <th>OUTCOME</th>
              </tr>
            </thead>
            <tbody>
              {events.data?.data.map((event, index) => (
                <tr key={String(event._id ?? index)}>
                  <td>{String(event.eventId)}</td>
                  <td>{String(event.cameraId)}</td>
                  <td>{String(event.employeeId ?? "Unknown")}</td>
                  <td>{Number(event.confidence) * 100}%</td>
                  <td>
                    <span className="status-tag review">
                      {String(event.outcome)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!events.data?.data.length && (
          <div className="empty-state">No camera events to review.</div>
        )}
      </section>
    </>
  );
}
function AuditPage({ companyId }: { companyId: string | null }) {
  const logs = useQuery({
    queryKey: ["audit", companyId],
    queryFn: () =>
      request<{ data: Record<string, unknown>[] }>(
        "/audit-logs",
        {},
        companyId,
      ),
    enabled: Boolean(companyId),
  });
  return (
    <>
      <PageHeading
        eyebrow="GOVERNANCE"
        title="Audit log"
        description="Recent sensitive actions in this company workspace."
      />
      <div className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>TIME</th>
                <th>ACTION</th>
                <th>RESOURCE</th>
                <th>ACTOR</th>
              </tr>
            </thead>
            <tbody>
              {logs.data?.data.map((log, index) => (
                <tr key={String(log._id ?? index)}>
                  <td>{new Date(String(log.createdAt)).toLocaleString()}</td>
                  <td>{String(log.action)}</td>
                  <td>
                    {String(log.resourceType)} · {String(log.resourceId ?? "")}
                  </td>
                  <td>{String(log.actorId ?? "System")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!logs.data?.data.length && (
          <div className="empty-state">No audit events yet.</div>
        )}
      </div>
    </>
  );
}
function EmptyPage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state empty-page">
      <span className="empty-symbol">
        <FileText size={23} />
      </span>
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}
