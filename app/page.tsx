"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode, RefObject } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  fetchApprovalActions,
  fetchAssets,
  fetchDailyReports,
  fetchDepartments,
  fetchLeads,
  fetchNotifications,
  fetchProfile,
  fetchProfiles,
  getSessionUser,
  profileToSession,
  signInWithPassword,
  signOut,
  type DepartmentRow
} from "@/lib/ims/data";
import { groupBySubsidiary, SubsidiaryDepartmentFields } from "@/app/components/org-select";
import { applyReportDecision, createAsset, createDailyReport, createMarketingLead } from "@/lib/ims/writes";
import { PeopleOffice } from "@/app/components/people-office";
import { AdminDashboard } from "@/app/components/admin-dashboard";
import { KpiOffice } from "@/app/components/kpi-office";

type Role =
  | "chairman"
  | "managing-director"
  | "executive-director"
  | "general-manager"
  | "director-of-administration"
  | "human-resources"
  | "department-head"
  | "manager"
  | "marketing-officer";
type Department = string;
type SubmissionStatus = "Draft" | "Pending Chairman Review" | "Approved" | "Returned";
type Tone = "blue" | "green" | "amber" | "red" | "slate";
type PageId =
  | "Executive Dashboard"
  | "Approval Queue"
  | "Department Reports"
  | "Assets"
  | "Users"
  | "Operations Overview"
  | "Department Compliance"
  | "Exceptions"
  | "Marketing Pipeline"
  | "Daily Submission"
  | "My Reports"
  | "Returned Items"
  | "Client Visits"
  | "Proposals"
  | "Quotations"
  | "Lead Assignment"
  | "Staff Register"
  | "Leave"
  | "Letters"
  | "Admin Dashboard"
  | "Directorate KPIs";

type Session = {
  role: Role;
  name: string;
  department?: Department;
  userId?: string;
  departmentId?: string;
};

type DepartmentSubmission = {
  id: string;
  dbId?: string;
  department: Department;
  departmentId?: string;
  subsidiary?: string;
  submittedBy: string;
  date: string;
  revenue: number;
  activeOperations: number;
  cashIn: number;
  expenses: number;
  assetsFlagged: number;
  inquiries?: number;
  attendance?: number;
  jobsCompleted?: string;
  jobsInProgress?: string;
  equipmentStatus?: string[];
  departmentUpdate?: string;
  currentProjects?: string;
  upcomingProjects?: string;
  growthIdeas?: string;
  challenges?: string;
  summary: string;
  status: SubmissionStatus;
  priority: "Normal" | "Attention" | "Critical";
  parentReportId?: string | null;
};

type ApprovalAction = {
  id: string;
  reportId: string;
  department: Department;
  subsidiary?: string;
  actor: string;
  action: Exclude<SubmissionStatus, "Draft">;
  previousStatus: SubmissionStatus;
  comment: string;
  createdAt: string;
};

type ImsNotification = {
  id: string;
  reportId: string;
  department: Department;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

type MarketingLead = {
  id: string;
  client: string;
  visitDate: string;
  proposal: string;
  quotation: number;
  assignedDepartment: Department;
  status: "New" | "Quoted" | "Assigned" | "Follow-up";
};

type ExecutiveSummaryReport = {
  id: string;
  department: Department;
  submittedBy: string;
  date: string;
  status: SubmissionStatus;
  priority: DepartmentSubmission["priority"];
  revenue: number;
  cashIn: number;
  expenses: number;
  activeOperations: number;
  assetsFlagged: number;
  inquiries?: number;
  attendance?: number;
  jobsCompleted?: string;
  summary: string;
  departmentUpdate?: string;
  currentProjects?: string;
  upcomingProjects?: string;
  growthIdeas?: string;
  challenges?: string;
};

type ExecutiveSummaryData = {
  generatedAt: string;
  dateLabel: string;
  departmentsReporting: number;
  departmentsTotal: number;
  pendingApprovals: number;
  totalRevenue: number;
  totalCash: number;
  totalExpenses: number;
  alerts: number;
  revenueByDepartment: Array<{
    department: Department;
    reportCount: number;
    revenue: number;
    cashIn: number;
    expenses: number;
    operations: number;
    alerts: number;
  }>;
  reportsByDepartment: Array<{
    department: Department;
    reports: ExecutiveSummaryReport[];
  }>;
};

type AssetRecord = {
  asset_id: string;
  name: string;
  classification: string;
  purchase_date: string;
  supplier_name: string;
  serial_number: string;
  department_id: Department;
  custodian_name: string;
  warranty_expiration: string;
  maintenance_schedule_interval: string;
  location: string;
  status: "Operational" | "Maintenance Required" | "Critical Fault" | "Leased" | "Under Construction";
  book_value: number;
};

const roleLabels: Record<Role, string> = {
  chairman: "Board Chairman",
  "managing-director": "Managing Director",
  "executive-director": "Executive Director",
  "general-manager": "General Manager",
  "director-of-administration": "Director of Administration",
  "human-resources": "Central Human Resources",
  "department-head": "Unit head",
  manager: "Manager",
  "marketing-officer": "Business Development & Marketing Officer"
};

function writesDepartmentReports(role: Role) {
  return role === "department-head" || role === "manager";
}

function placeLabel(department?: string, subsidiary?: string) {
  if (subsidiary && department) return `${subsidiary} · ${department}`;
  return department || "";
}

const departments: Department[] = [
  "Corporate Administration",
  "Microcredit & Thrift",
  "Renewable Energy",
  "ICT",
  "Printing",
  "Media",
  "Real Estate",
  "Logistics"
];


const rolePages: Record<Role, PageId[]> = {
  chairman: ["Executive Dashboard", "Approval Queue", "Department Reports", "Staff Register", "Leave", "Letters", "Assets", "Users"],
  "managing-director": ["Staff Register", "Leave", "Letters"],
  "executive-director": ["Leave", "Directorate KPIs", "Staff Register"],
  "general-manager": ["Operations Overview", "Department Compliance", "Exceptions", "Marketing Pipeline", "Staff Register", "Assets", "Users"],
  "director-of-administration": ["Admin Dashboard", "Directorate KPIs", "Staff Register", "Leave", "Letters", "Users"],
  "human-resources": ["Staff Register", "Leave", "Letters"],
  "department-head": ["Daily Submission", "My Reports", "Returned Items", "Directorate KPIs"],
  manager: ["Daily Submission", "My Reports", "Returned Items", "Directorate KPIs"],
  "marketing-officer": ["Client Visits", "Proposals", "Quotations", "Lead Assignment"]
};

const mobileFieldRoles: Role[] = ["department-head", "manager", "marketing-officer"];

const mobileNavLabels: Partial<Record<PageId, string>> = {
  "Daily Submission": "Submit",
  "My Reports": "Reports",
  "Returned Items": "Returned",
  "Directorate KPIs": "KPIs",
  "Client Visits": "Visits",
  Proposals: "Proposals",
  Quotations: "Quotes",
  "Lead Assignment": "Leads"
};

function isMobileFieldRole(role: Role) {
  return mobileFieldRoles.includes(role);
}

const departmentBlueprints: Partial<
  Record<
    Department,
    {
      completedLabel: string;
      progressLabel: string;
      equipmentLabel: string;
      completedOptions: string[];
      equipmentOptions: string[];
      equipmentInput: "select" | "checklist";
      progressPlaceholder: string;
    }
  >
> = {
  Media: {
    completedLabel: "Jobs Completed Today",
    progressLabel: "Jobs in Progress",
    equipmentLabel: "Equipment Status Updates",
    equipmentInput: "select",
    completedOptions: [
      "Video Production",
      "Editing",
      "Documentary",
      "Corporate Promo",
      "TV & Online Program",
      "Event Coverage",
      "Wedding",
      "Conference",
      "Livestream Run",
      "Photography Shoot",
      "Studio Recording",
      "Podcast Session",
      "Content Creation",
      "PR Release"
    ],
    equipmentOptions: [
      "Cinema Camera #1",
      "DSLR Body #2",
      "Zoom Lenses",
      "Wireless Mic Kits",
      "Studio Mixer",
      "LED Panels",
      "ATEM Video Switcher",
      "Editing Workstation #1",
      "Editing Workstation #2"
    ],
    progressPlaceholder: "Post-production color grading ongoing for Church Documentaries, currently at 70%."
  },
  ICT: {
    completedLabel: "Jobs Completed Today",
    progressLabel: "Jobs in Progress",
    equipmentLabel: "Equipment/System Status",
    equipmentInput: "checklist",
    completedOptions: [
      "Software Feature Deployed",
      "Mobile App Build Compiled",
      "Website Design Finalized",
      "Hosting Setup Completed",
      "AI Solution Deployed",
      "Digital Transformation Task",
      "Database Maintenance",
      "Cloud Service Configured",
      "Network Mapping Task",
      "Tech Support Ticket Resolved",
      "Computer Repair Sign-off"
    ],
    equipmentOptions: [
      "Cloud Servers",
      "Database Instances",
      "tanjurieltmc.com System Sync",
      "Starlink Gateway",
      "Local Routers & Switches",
      "Development Workstations",
      "CCTV Test Bench",
      "NYSC Roster Uptime"
    ],
    progressPlaceholder: "Next.js frontend integration for client portal ongoing; Flutter staging build updates running."
  },
  Logistics: {
    completedLabel: "Jobs Completed Today",
    progressLabel: "Jobs in Progress",
    equipmentLabel: "Equipment/Fleet Status",
    equipmentInput: "select",
    completedOptions: [
      "Courier Parcels Delivered",
      "Goods Heavy Cargo Hauls",
      "Passenger Intercity Trips",
      "Bus Hirings Finalized",
      "Vehicle Rentals Concluded",
      "Fleet Vehicle Serviced",
      "Vehicle Tracking Module Installed"
    ],
    equipmentOptions: [
      "Corporate Bus #01",
      "Corporate Bus #02",
      "Corporate Sedan #01",
      "Dispatch Motorcycle Fleet",
      "Workshop Diagnostics Scanner",
      "GPS Server Connection"
    ],
    progressPlaceholder: "Bus #04 on active return trip from Abuja; 3 courier riders active on inner-city Jos distribution loops."
  },
  "Renewable Energy": {
    completedLabel: "Jobs Completed Today",
    progressLabel: "Jobs in Progress",
    equipmentLabel: "Equipment/Tools Status",
    equipmentInput: "checklist",
    completedOptions: [
      "Solar System Sizing Design",
      "Solar Street Light Installed",
      "Residential System Installation",
      "Commercial Inverter Setup",
      "Battery Bank Calibration",
      "Electrical Conduit Wiring",
      "Industrial Electrical Commissioning",
      "Smart Home Device Mounted",
      "Access Control Integration",
      "Energy Audit Completed",
      "Preventive Maintenance Signed"
    ],
    equipmentOptions: [
      "Digital Multimeters",
      "Clamp Meters",
      "Battery Capacity Tester",
      "Rotary Hammer Drills",
      "Safety Harnesses & Rigging Gear",
      "Component Test Bench"
    ],
    progressPlaceholder: "Phase 3: Cable routing and inverter staging ongoing for 10kVA residential client project."
  },
  Printing: {
    completedLabel: "Jobs Completed Today",
    progressLabel: "Jobs in Progress",
    equipmentLabel: "Equipment/Machinery Status",
    equipmentInput: "select",
    completedOptions: [
      "Books Printed",
      "Magazines",
      "Annual Reports",
      "Exercise Books",
      "Church Materials",
      "Posters",
      "Flyers",
      "Brochures",
      "Calendars",
      "Diaries",
      "Certificates",
      "ID Cards",
      "Letterheads",
      "Receipt Books",
      "Banners",
      "Vehicle Branding",
      "T-Shirts",
      "Caps",
      "Souvenirs"
    ],
    equipmentOptions: [
      "Digital Printer",
      "Color Press",
      "B&W Production Unit",
      "Large-Format Printer",
      "Guillotine Paper Cutter",
      "Laminating Machine",
      "Spiral Binder",
      "Perfect Binding Machine",
      "Heat Press Machine"
    ],
    progressPlaceholder: "Currently printing 1,200 copies of Church Bulletins; binding phase for Annual Reports starts tomorrow."
  },
  "Real Estate": {
    completedLabel: "Jobs Completed Today",
    progressLabel: "Jobs in Progress",
    equipmentLabel: "Property Portfolio Status",
    equipmentInput: "select",
    completedOptions: [
      "Property Acquisition Logged",
      "Title Documentation Filed",
      "C of O Clearance Obtained",
      "Land Bank Survey Concluded",
      "Layout Mapping Completed",
      "Tenant Onboarding",
      "Lease Agreement Signed",
      "Rent Collected",
      "Structural Inspection Signed"
    ],
    equipmentOptions: [
      "Commercial Plazas",
      "Residential Layout Blocks",
      "Undeveloped Land Holdings",
      "Leased Holdings",
      "Units Under Active Renovation"
    ],
    progressPlaceholder: "Commercial Plaza Unit C structural finishing ongoing; boundary fence construction running at layout site."
  },
  "Microcredit & Thrift": {
    completedLabel: "Jobs Completed Today",
    progressLabel: "Jobs in Progress",
    equipmentLabel: "System & Account Status",
    equipmentInput: "checklist",
    completedOptions: [
      "New Account Opened",
      "Thrift Deposit Batched",
      "Loan Verification Completed",
      "Executive Approval Form Forwarded",
      "Loan Disbursement Executed",
      "Recovery Schedule Finalized",
      "System Balance Reconciled"
    ],
    equipmentOptions: [
      "Core Banking Cloud Database",
      "Teller Terminal Inflows",
      "tanjurieltmc.com API Bridge",
      "Active Defaulter Alert Flag",
      "Liquidity Pool Reserve Balance"
    ],
    progressPlaceholder: "Processing 14 group thrift application portfolios; auditing loan repayment arrears schedules for Branch X."
  }
};

function formatNaira(value: number) {
  return `NGN ${value.toLocaleString("en-NG")}`;
}

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Home() {
  const supabaseReady = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(supabaseReady);
  const [submissions, setSubmissions] = useState<DepartmentSubmission[]>([]);
  const [approvalActions, setApprovalActions] = useState<ApprovalAction[]>([]);
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [assetRows, setAssetRows] = useState<AssetRecord[]>([]);
  const [dbNotifications, setDbNotifications] = useState<ImsNotification[]>([]);
  const [departmentRows, setDepartmentRows] = useState<DepartmentRow[]>([]);
  const [busyMessage, setBusyMessage] = useState("");
  const [summaryData, setSummaryData] = useState<ExecutiveSummaryData | null>(null);
  const [showSummaryPreview, setShowSummaryPreview] = useState(false);
  const [activePage, setActivePage] = useState<PageId>("Executive Dashboard");
  const [selectedSubsidiary, setSelectedSubsidiary] = useState<string>("All");
  const [selectedDepartment, setSelectedDepartment] = useState<Department | "All">("All");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [returnTargetId, setReturnTargetId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const autoAlertedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabaseReady) {
      setAuthLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const user = await getSessionUser();
        if (!user || cancelled) {
          if (!cancelled) setAuthLoading(false);
          return;
        }
        const profile = await fetchProfile(user.id);
        if (!profile || !profile.is_active || cancelled) {
          if (!cancelled) setAuthLoading(false);
          return;
        }
        const next = profileToSession(profile);
        setSession({
          role: next.role,
          name: next.name,
          department: next.department as Department | undefined,
          userId: next.userId,
          departmentId: next.departmentId ?? undefined
        });
        setActivePage(rolePages[next.role][0]);
      } catch {
        // Stay on login if restore fails
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseReady]);

  useEffect(() => {
    if (!supabaseReady || !session?.userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [reportRows, actionRows, leadRows, noteRows, assetData, deptData] = await Promise.all([
          fetchDailyReports(),
          fetchApprovalActions(),
          fetchLeads(),
          fetchNotifications(),
          fetchAssets(),
          fetchDepartments()
        ]);
        if (cancelled) return;
        setSubmissions(reportRows as DepartmentSubmission[]);
        setApprovalActions(actionRows as ApprovalAction[]);
        setLeads(leadRows as MarketingLead[]);
        setDbNotifications(noteRows as ImsNotification[]);
        setAssetRows(assetData as AssetRecord[]);
        setDepartmentRows(deptData);
      } catch (error) {
        console.error("Failed to load IMS data", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseReady, session?.userId]);

  async function handleLogout() {
    if (supabaseReady) {
      try {
        await signOut();
      } catch {
        // ignore
      }
    }
    setSession(null);
    setShowNotifications(false);
  }

  const metrics = useMemo(() => {
    const submitted = submissions.filter((item) => item.status !== "Draft");
    const approved = submissions.filter((item) => item.status === "Approved");
    const pending = submissions.filter((item) => item.status === "Pending Chairman Review");
    const drafts = submissions.filter((item) => item.status === "Draft");
    const returned = submissions.filter((item) => item.status === "Returned");
    const totalRevenue = submitted.reduce((sum, item) => sum + item.revenue, 0);
    const totalCash = submitted.reduce((sum, item) => sum + item.cashIn, 0);
    const totalExpenses = submitted.reduce((sum, item) => sum + item.expenses, 0);
    const alerts = submitted.reduce((sum, item) => sum + item.assetsFlagged, 0);
    return { submitted, approved, pending, drafts, returned, totalRevenue, totalCash, totalExpenses, alerts };
  }, [submissions]);

  const notifications = dbNotifications;

  const selectedReport = selectedReportId
    ? submissions.find((submission) => submission.id === selectedReportId)
    : undefined;
  const returnTarget = returnTargetId
    ? submissions.find((submission) => submission.id === returnTargetId)
    : undefined;
  const canReceiveNotifications =
    writesDepartmentReports(session?.role ?? "chairman") || session?.role === "general-manager";
  const sessionNotifications =
    session && writesDepartmentReports(session.role) && session.department
      ? notifications.filter((notification) => notification.department === session.department)
      : session?.role === "general-manager"
        ? notifications
        : [];

  useEffect(() => {
    if (!session || !canReceiveNotifications) {
      autoAlertedSessionRef.current = null;
      return;
    }
    const sessionKey = `${session.role}:${session.department ?? "all"}:${session.name}`;
    if (autoAlertedSessionRef.current === sessionKey) return;
    if (sessionNotifications.length > 0) {
      autoAlertedSessionRef.current = sessionKey;
      setShowNotifications(true);
    }
  }, [session, canReceiveNotifications, sessionNotifications.length]);

  async function refreshImsData() {
    const [reportRows, actionRows, leadRows, noteRows, assetData, deptData] = await Promise.all([
      fetchDailyReports(),
      fetchApprovalActions(),
      fetchLeads(),
      fetchNotifications(),
      fetchAssets(),
      fetchDepartments()
    ]);
    setSubmissions(reportRows as DepartmentSubmission[]);
    setApprovalActions(actionRows as ApprovalAction[]);
    setLeads(leadRows as MarketingLead[]);
    setDbNotifications(noteRows as ImsNotification[]);
    setAssetRows(assetData as AssetRecord[]);
    setDepartmentRows(deptData);
  }

  function departmentIdByName(name: string) {
    return (
      departmentRows.find((item) => item.id === name)?.id ??
      departmentRows.find((item) => item.name === name)?.id ??
      departmentRows.find((item) => placeLabel(item.name, item.subsidiaryName ?? undefined) === name)?.id
    );
  }

  async function updateSubmissionStatus(id: string, status: Exclude<SubmissionStatus, "Draft">, comment?: string) {
    const currentSubmission = submissions.find((submission) => submission.id === id);
    if (!currentSubmission?.dbId || !session?.userId) {
      throw new Error("Report is missing database identity. Refresh and try again.");
    }
    const decisionComment =
      comment ||
      (status === "Approved"
        ? `Approved by ${session.name}.`
        : `Returned for department correction by ${session.name}.`);

    setBusyMessage("Saving decision...");
    try {
      await applyReportDecision({
        dbReportId: currentSubmission.dbId,
        previousStatus: currentSubmission.status,
        nextStatus: status,
        actorId: session.userId,
        comment: decisionComment
      });
      await refreshImsData();
    } finally {
      setBusyMessage("");
    }
  }

  async function addSubmission(submission: DepartmentSubmission) {
    if (!session?.userId || !session.departmentId) {
      throw new Error("Department profile is incomplete. Ask the Chairman to assign your department.");
    }
    setBusyMessage(submission.status === "Draft" ? "Saving draft..." : "Submitting report...");
    try {
      const created = await createDailyReport({
        displayCode: submission.id,
        departmentId: session.departmentId,
        submittedBy: session.userId,
        reportingDate: submission.date,
        status: submission.status,
        priority: submission.priority,
        revenue: submission.revenue,
        inquiries: submission.inquiries ?? 0,
        attendance: submission.attendance ?? 0,
        activeOperations: submission.activeOperations,
        cashIn: submission.cashIn,
        expenses: submission.expenses,
        assetsFlagged: submission.assetsFlagged,
        jobsCompleted: submission.jobsCompleted,
        jobsInProgress: submission.jobsInProgress,
        equipmentStatus: submission.equipmentStatus,
        departmentUpdate: submission.departmentUpdate,
        currentProjects: submission.currentProjects,
        upcomingProjects: submission.upcomingProjects,
        growthIdeas: submission.growthIdeas,
        challenges: submission.challenges,
        summary: submission.summary,
        parentReportId: submission.parentReportId ?? null
      });
      await refreshImsData();
      return created;
    } finally {
      setBusyMessage("");
    }
  }

  async function addLead(lead: MarketingLead) {
    if (!session?.userId) throw new Error("You must be signed in to save marketing leads.");
    const assignedDepartmentId = departmentIdByName(lead.assignedDepartment);
    if (!assignedDepartmentId) throw new Error("Assigned department was not found.");
    setBusyMessage("Saving marketing lead...");
    try {
      await createMarketingLead({
        client: lead.client,
        visitDate: lead.visitDate,
        proposal: lead.proposal,
        quotation: lead.quotation,
        assignedDepartmentId,
        assignedBy: session.userId,
        status: lead.status
      });
      await refreshImsData();
    } finally {
      setBusyMessage("");
    }
  }

  async function addAssetRecord(asset: AssetRecord) {
    const departmentId = departmentIdByName(asset.department_id);
    if (!departmentId) throw new Error("Asset department was not found.");
    setBusyMessage("Saving asset...");
    try {
      await createAsset({
        assetId: asset.asset_id,
        name: asset.name,
        classification: asset.classification,
        purchaseDate: asset.purchase_date || null,
        supplierName: asset.supplier_name,
        serialNumber: asset.serial_number,
        departmentId,
        custodianName: asset.custodian_name,
        warrantyExpiration: asset.warranty_expiration === "N/A" ? null : asset.warranty_expiration || null,
        maintenanceInterval: asset.maintenance_schedule_interval,
        location: asset.location,
        status: asset.status,
        bookValue: asset.book_value
      });
      await refreshImsData();
    } finally {
      setBusyMessage("");
    }
  }

  function requestReportReturn(id: string) {
    setReturnTargetId(id);
    setReturnComment("");
  }

  async function submitReturnCorrection() {
    if (!returnTarget) return;
    try {
      await updateSubmissionStatus(
        returnTarget.id,
        "Returned",
        returnComment.trim() || "Returned for correction. Please review the report and resubmit."
      );
      setReturnTargetId(null);
      setReturnComment("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to return report");
    }
  }

  function generateExecutiveSummary() {
    const summaryReports = metrics.submitted.filter(
      (item) => item.status === "Pending Chairman Review" || item.status === "Approved"
    );
    const revenueByDepartment = departments
      .map((department) => {
        const departmentReports = summaryReports.filter((item) => item.department === department);
        return {
          department,
          reportCount: departmentReports.length,
          revenue: departmentReports.reduce((sum, item) => sum + item.revenue, 0),
          cashIn: departmentReports.reduce((sum, item) => sum + item.cashIn, 0),
          expenses: departmentReports.reduce((sum, item) => sum + item.expenses, 0),
          operations: departmentReports.reduce((sum, item) => sum + item.activeOperations, 0),
          alerts: departmentReports.reduce((sum, item) => sum + item.assetsFlagged, 0)
        };
      })
      .filter((row) => row.reportCount > 0);

    const reportsByDepartment = revenueByDepartment.map((row) => ({
      department: row.department,
      reports: summaryReports
        .filter((item) => item.department === row.department)
        .map((item) => ({
          id: item.id,
          department: item.department,
          submittedBy: item.submittedBy,
          date: item.date,
          status: item.status,
          priority: item.priority,
          revenue: item.revenue,
          cashIn: item.cashIn,
          expenses: item.expenses,
          activeOperations: item.activeOperations,
          assetsFlagged: item.assetsFlagged,
          inquiries: item.inquiries,
          attendance: item.attendance,
          jobsCompleted: item.jobsCompleted,
          summary: item.summary,
          departmentUpdate: item.departmentUpdate,
          currentProjects: item.currentProjects,
          upcomingProjects: item.upcomingProjects,
          growthIdeas: item.growthIdeas,
          challenges: item.challenges
        }))
    }));

    const now = new Date();
    setSummaryData({
      generatedAt: now.toISOString(),
      dateLabel: now.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
      }),
      departmentsReporting: new Set(summaryReports.map((item) => item.department)).size,
      departmentsTotal: departments.length,
      pendingApprovals: metrics.pending.length,
      totalRevenue: summaryReports.reduce((sum, item) => sum + item.revenue, 0),
      totalCash: summaryReports.reduce((sum, item) => sum + item.cashIn, 0),
      totalExpenses: summaryReports.reduce((sum, item) => sum + item.expenses, 0),
      alerts: summaryReports.reduce((sum, item) => sum + item.assetsFlagged, 0),
      revenueByDepartment,
      reportsByDepartment
    });
    setShowSummaryPreview(true);
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="text-center">
          <BrandMark size="md" className="justify-center" />
          <p className="mt-4 text-sm text-slate-500">Restoring your IMS session...</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        onLogin={(nextSession) => {
          setSession(nextSession);
          setActivePage(rolePages[nextSession.role][0]);
          setSelectedDepartment("All");
        }}
      />
    );
  }

  const fieldMobile = isMobileFieldRole(session.role);
  const goToPage = (page: PageId) => {
    setActivePage(page);
    setSelectedDepartment("All");
    setSelectedReportId(null);
    setShowNotifications(false);
  };

  return (
    <main className={cx("min-h-screen bg-white text-slate-900", fieldMobile && "field-mobile-shell")}>
      <div className="flex min-h-screen">
        <Sidebar
          session={session}
          activePage={activePage}
          onPageChange={goToPage}
          onLogout={handleLogout}
        />
        <section className="min-w-0 flex-1 overflow-x-hidden">
          <Topbar
            session={session}
            pageTitle={activePage}
            compact={fieldMobile}
            showNotifications={canReceiveNotifications}
            notificationCount={sessionNotifications.filter((notification) => !notification.read).length}
            onToggleNotifications={() => setShowNotifications((current) => !current)}
            onLogout={fieldMobile ? handleLogout : undefined}
          />
          <div
            className={cx(
              "mx-auto min-w-0 max-w-[1500px]",
              fieldMobile ? "px-4 py-4 pb-8 sm:px-5" : "px-6 py-6"
            )}
          >
            {busyMessage && (
              <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
                {busyMessage}
              </div>
            )}
            {session.role === "chairman" && activePage === "Executive Dashboard" && (
              <ChairmanDashboard
                submissions={submissions}
                leads={leads}
                approvalActions={approvalActions}
                metrics={metrics}
                summaryData={summaryData}
                onGenerateSummary={generateExecutiveSummary}
                onPreviewSummary={() => setShowSummaryPreview(true)}
                onStatusChange={async (id, status) => {
                  try {
                    await updateSubmissionStatus(id, status);
                  } catch (error) {
                    window.alert(error instanceof Error ? error.message : "Failed to update report");
                  }
                }}
                onReturnRequest={requestReportReturn}
                onReportOpen={setSelectedReportId}
                onDepartmentSelect={(departmentId) => {
                  const row = departmentRows.find((item) => item.id === departmentId);
                  setSelectedSubsidiary(row?.subsidiaryName || "All");
                  setSelectedDepartment(row?.name ?? "All");
                  setActivePage("Approval Queue");
                }}
                departmentRows={departmentRows}
              />
            )}
            {session.role === "chairman" && activePage === "Approval Queue" && (
              <ChairmanApprovalPage
                submissions={submissions}
                approvalActions={approvalActions}
                departmentRows={departmentRows}
                selectedSubsidiary={selectedSubsidiary}
                selectedDepartment={selectedDepartment}
                onSelectedSubsidiaryChange={(value) => {
                  setSelectedSubsidiary(value);
                  setSelectedDepartment("All");
                }}
                onSelectedDepartmentChange={setSelectedDepartment}
                onStatusChange={async (id, status) => {
                  try {
                    await updateSubmissionStatus(id, status);
                  } catch (error) {
                    window.alert(error instanceof Error ? error.message : "Failed to update report");
                  }
                }}
                onReturnRequest={requestReportReturn}
                onReportOpen={setSelectedReportId}
              />
            )}
            {session.role === "chairman" && activePage === "Department Reports" && (
              <DepartmentReportsPage submissions={submissions} approvalActions={approvalActions} departmentRows={departmentRows} onReportOpen={setSelectedReportId} />
            )}
            {(session.role === "chairman" || session.role === "general-manager") && activePage === "Assets" && (
              <AssetsPage assets={assetRows} departments={departmentRows} onCreate={addAssetRecord} />
            )}
            {(session.role === "chairman" || session.role === "general-manager" || session.role === "director-of-administration") && activePage === "Users" && (
              <UsersPage />
            )}
            {session.role === "general-manager" &&
              activePage !== "Users" &&
              activePage !== "Assets" &&
              activePage !== "Staff Register" && (
              <GeneralManagerDashboard
                activePage={activePage}
                submissions={submissions}
                leads={leads}
                assets={assetRows}
                metrics={metrics}
                onReportOpen={setSelectedReportId}
                onStatusChange={async (id, status) => {
                  try {
                    await updateSubmissionStatus(id, status);
                  } catch (error) {
                    window.alert(error instanceof Error ? error.message : "Failed to update report");
                  }
                }}
                onReturnRequest={requestReportReturn}
                departmentRows={departmentRows}
              />
            )}
            {writesDepartmentReports(session.role) && (
              <DepartmentHeadPortal
                activePage={activePage}
                session={session}
                submissions={submissions}
                onSubmit={addSubmission}
                onReportOpen={setSelectedReportId}
                onPageChange={goToPage}
              />
            )}
            {session.role === "marketing-officer" && (
              <MarketingPortal activePage={activePage} leads={leads} departments={departmentRows} onSubmit={addLead} />
            )}
            {session.role === "director-of-administration" && activePage === "Admin Dashboard" && (
              <AdminDashboard
                reports={submissions}
                onOpen={setActivePage}
              />
            )}
            {activePage === "Directorate KPIs" && (
              <KpiOffice
                canSetTarget={session.role === "director-of-administration"}
                departmentId={session.departmentId}
              />
            )}
            {(activePage === "Staff Register" || activePage === "Leave" || activePage === "Letters") && (
              <PeopleOffice
                page={activePage}
                role={session.role}
                canWritePeople={session.role === "director-of-administration" || session.role === "human-resources"}
                canApproveLeave={session.role === "executive-director" || session.role === "director-of-administration"}
              />
            )}
          </div>
        </section>
      </div>
      {fieldMobile && (
        <MobileFieldNav
          session={session}
          activePage={activePage}
          onPageChange={goToPage}
          badges={{
            "Returned Items": submissions.filter(
              (item) =>
                (session.departmentId ? item.departmentId === session.departmentId : item.department === session.department) &&
                item.status === "Returned"
            ).length
          }}
        />
      )}
      {showNotifications && canReceiveNotifications && (
        <NotificationPopup
          notifications={sessionNotifications}
          onClose={() => setShowNotifications(false)}
          onReportOpen={(id) => {
            setSelectedReportId(id);
            setShowNotifications(false);
          }}
        />
      )}
      {selectedReport && (
        <div
          className={cx(
            "fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 backdrop-blur-sm",
            fieldMobile ? "px-0 py-0 sm:px-4 sm:py-6" : "px-4 py-6"
          )}
        >
          <div className={cx("mx-auto max-w-7xl", fieldMobile && "min-h-full sm:min-h-0")}>
            <ReportOverview
              report={selectedReport}
              session={session}
              approvalActions={approvalActions.filter((action) => action.reportId === selectedReport.id)}
              reportNotifications={notifications.filter((notification) => notification.reportId === selectedReport.id)}
              linkedLeads={leads.filter((lead) => lead.assignedDepartment === selectedReport.department)}
              linkedAssets={assetRows.filter((asset) => asset.department_id === selectedReport.department)}
              onClose={() => setSelectedReportId(null)}
              onStatusChange={async (status) => {
                try {
                  await updateSubmissionStatus(selectedReport.id, status);
                  setSelectedReportId(null);
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : "Failed to update report");
                }
              }}
              onReturnRequest={() => requestReportReturn(selectedReport.id)}
            />
          </div>
        </div>
      )}
      {returnTarget && (
        <ReturnCorrectionDialog
          report={returnTarget}
          comment={returnComment}
          onCommentChange={setReturnComment}
          onCancel={() => {
            setReturnTargetId(null);
            setReturnComment("");
          }}
          onSubmit={submitReturnCorrection}
        />
      )}
      {showSummaryPreview && summaryData && (
        <ExecutiveSummaryPreviewModal
          data={summaryData}
          onClose={() => setShowSummaryPreview(false)}
          canArchive={session?.role === "chairman"}
        />
      )}
    </main>
  );
}

function BrandMark({
  size = "md",
  showText = true,
  className
}: {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: "h-12 w-12",
    md: "h-16 w-16",
    lg: "h-24 w-24"
  };
  const textSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl"
  };

  return (
    <div className={cx("flex items-center gap-3", className)}>
      <img
        src="/tanjuriel-logo.jpg"
        alt="Tanjuriel Corporation"
        className={cx("shrink-0 object-contain", sizes[size])}
      />
      {showText && (
        <div className="min-w-0">
          <p className={cx("font-semibold tracking-tight text-slate-950", textSizes[size])}>Tanjuriel</p>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Corporate IMS</p>
        </div>
      )}
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState("chairman@tanjuriel.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supabaseReady = isSupabaseConfigured();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabaseReady) {
      setError("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const auth = await signInWithPassword(email.trim(), password);
      const profile = await fetchProfile(auth.user.id);
      if (!profile || !profile.is_active) {
        await signOut();
        throw new Error("No active IMS profile found for this account.");
      }
      const next = profileToSession(profile);
      onLogin({
        role: next.role,
        name: next.name,
        department: next.department as Department | undefined,
        userId: next.userId,
        departmentId: next.departmentId ?? undefined
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_440px]">
        <section className="hidden lg:block">
          <BrandMark size="lg" className="mb-8" />
          <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-slate-950">
            Daily operations. Clear accountability. Executive oversight.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            Tanjuriel IMS collects departmental daily reports, tracks approvals, and gives the Chairman a consolidated
            view of revenue, operations, and development briefs across every arm.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <LoginPoint title="Daily Department Reports" text="Heads submit activity, revenue, and development briefs each day." />
            <LoginPoint title="Review & Approval" text="The Chairman reviews, approves, or returns reports for correction." />
            <LoginPoint title="Executive Oversight" text="The General Manager monitors operations; the Chairman generates the executive summary." />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="mb-5 lg:hidden">
            <BrandMark size="md" />
            <p className="mt-3 text-sm text-slate-600">Mobile access for department heads and marketing officers.</p>
          </div>
          <div className="border-b border-slate-100 pb-5">
            <div className="mb-4 hidden lg:block">
              <BrandMark size="sm" showText={false} />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Secure IMS Access</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Sign in to IMS</h2>
            <p className="mt-2 text-sm text-slate-500">Use the email and password issued by the Chairman or General Manager.</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="field-label">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="form-control"
                placeholder="name@tanjuriel.com"
                required
                autoComplete="username"
              />
            </label>
            <label className="block">
              <span className="field-label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="form-control"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </label>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-blue-800 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900 disabled:opacity-60"
            >
              {busy ? "Signing in..." : "Sign in to IMS"}
            </button>
          </form>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Need an account?</p>
            <p className="mt-1">
              Ask the Chairman or General Manager for your email and password, then sign in to open your workspace.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Sidebar({
  session,
  activePage,
  onPageChange,
  onLogout
}: {
  session: Session;
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  onLogout: () => void;
}) {
  const items = rolePages[session.role];
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="border-b border-slate-200 px-6 py-5">
        <BrandMark size="sm" />
        <p className="mt-3 text-xs text-slate-500">Executive information system</p>
      </div>
      <nav className="flex-1 space-y-1 px-4 py-5">
        {items.map((item) => (
          <button
            key={item}
            onClick={() => onPageChange(item)}
            className={cx(
              "w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition",
              activePage === item ? "bg-blue-50 text-blue-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            )}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-4">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Signed in as</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{roleLabels[session.role]}</p>
          <p className="mt-1 text-xs text-slate-500">{session.name}</p>
        </div>
        <button onClick={onLogout} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Sign out
        </button>
      </div>
    </aside>
  );
}

function MobileFieldNav({
  session,
  activePage,
  onPageChange,
  badges
}: {
  session: Session;
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  badges?: Partial<Record<PageId, number>>;
}) {
  const items = rolePages[session.role];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pt-2 backdrop-blur lg:hidden"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = activePage === item;
          const badge = badges?.[item] ?? 0;
          return (
            <button
              key={item}
              onClick={() => onPageChange(item)}
              className={cx(
                "relative flex min-h-14 flex-col items-center justify-center rounded-xl px-1 py-2 text-center transition",
                active ? "bg-blue-50 text-blue-900" : "text-slate-500"
              )}
            >
              <span className={cx("text-[13px] font-semibold leading-tight", active && "text-blue-900")}>
                {mobileNavLabels[item] ?? item}
              </span>
              {badge > 0 && (
                <span className="absolute right-2 top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Topbar({
  session,
  pageTitle,
  compact,
  showNotifications,
  notificationCount,
  onToggleNotifications,
  onLogout
}: {
  session: Session;
  pageTitle?: PageId;
  compact?: boolean;
  showNotifications: boolean;
  notificationCount: number;
  onToggleNotifications: () => void;
  onLogout?: () => void;
}) {
  return (
    <header
      className={cx(
        "sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur",
        compact ? "px-4 py-3 sm:px-5" : "px-6 py-4"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {roleLabels[session.role]}
            {session.department ? ` · ${session.department}` : ""}
          </p>
          <h2
            className={cx(
              "truncate font-semibold tracking-tight text-slate-950",
              compact ? "text-lg sm:text-xl" : "text-2xl"
            )}
          >
            {pageTitle ?? session.name}
          </h2>
          {pageTitle && (
            <p className="mt-0.5 truncate text-xs text-slate-500">{session.name}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {showNotifications && (
            <button
              onClick={onToggleNotifications}
              className={cx(
                "rounded-xl border border-blue-200 bg-blue-50 font-semibold text-blue-800 transition hover:bg-blue-100",
                compact ? "px-3 py-2 text-xs sm:text-sm" : "px-4 py-2 text-sm"
              )}
            >
              {notificationCount > 0 ? `${notificationCount} new` : "Alerts"}
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:text-sm lg:hidden"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function ReportOverview({
  report,
  session,
  approvalActions,
  reportNotifications,
  linkedLeads,
  linkedAssets,
  onClose,
  onStatusChange,
  onReturnRequest
}: {
  report: DepartmentSubmission;
  session: Session;
  approvalActions: ApprovalAction[];
  reportNotifications: ImsNotification[];
  linkedLeads: MarketingLead[];
  linkedAssets: AssetRecord[];
  onClose: () => void;
  onStatusChange: (status: Exclude<SubmissionStatus, "Draft">) => void;
  onReturnRequest: () => void;
}) {
  const canExecutiveAct =
    (session.role === "chairman" || session.role === "general-manager") &&
    report.status !== "Draft" &&
    report.status !== "Approved";

  const fieldView = isMobileFieldRole(session.role);

  return (
    <section
      className={cx(
        "border-blue-200 bg-white shadow-2xl",
        fieldView
          ? "min-h-full rounded-none border-0 p-4 pb-28 sm:min-h-0 sm:rounded-3xl sm:border sm:p-6 sm:pb-6"
          : "rounded-3xl border p-6"
      )}
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">
            {writesDepartmentReports(session.role) ? "My Department Report" : "Report Overview"}
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{report.department}</h3>
          <p className="mt-1 break-words text-sm text-slate-600">
            {report.id} â€¢ {report.date} â€¢ Submitted by {report.submittedBy}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={report.status} />
          <PriorityPill priority={report.priority} />
          <button onClick={onClose} className="secondary-button">Close</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-5">
        <PositionTile label="Revenue" value={formatNaira(report.revenue)} tone="green" />
        <PositionTile label="Cash-In" value={formatNaira(report.cashIn)} tone="blue" />
        <PositionTile label="Expenses" value={formatNaira(report.expenses)} tone="amber" />
        <PositionTile label="Operations" value={report.activeOperations.toString()} tone="slate" />
        <PositionTile label="Asset Alerts" value={report.assetsFlagged.toString()} tone={report.assetsFlagged ? "red" : "green"} />
      </div>

      <div className="mt-6 space-y-6">
        <Panel title="Operational Narrative" subtitle="Full department report details for review before action.">
          <dl className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-3">
            <ReportDetail label="Inquiries" value={report.inquiries?.toString() ?? "Not supplied"} />
            <ReportDetail label="Attendance" value={report.attendance?.toString() ?? "Not supplied"} />
            <ReportDetail label="Jobs completed" value={report.jobsCompleted ?? "Not supplied"} />
            <ReportDetail label="Jobs in progress" value={report.jobsInProgress ?? "Not supplied"} />
            <ReportDetail label="Equipment/system status" value={report.equipmentStatus?.join(", ") ?? "Not supplied"} />
          </dl>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <NarrativeBlock title="Department update and current activities" text={report.departmentUpdate} />
            <NarrativeBlock title="Projects currently being worked on" text={report.currentProjects} />
            <NarrativeBlock title="Upcoming projects and plans" text={report.upcomingProjects} />
            <NarrativeBlock title="Growth and development ideas" text={report.growthIdeas} />
            <NarrativeBlock title="Challenges / support needed" text={report.challenges} />
          </div>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Narrative summary</p>
            <p className="mt-3 max-w-5xl text-sm leading-7 text-slate-700">{report.summary}</p>
          </div>
          {canExecutiveAct && (
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-950">Executive decision</p>
              <p className="mt-1 text-sm text-blue-800">Approve this report or return it to the department head for correction.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => onStatusChange("Approved")}
                  className="table-button bg-emerald-50 text-emerald-800"
                >
                  Approve
                </button>
                <button onClick={onReturnRequest} className="table-button bg-red-50 text-red-700">
                  Return for Correction
                </button>
              </div>
            </div>
          )}
          {(session.role === "general-manager" || session.role === "chairman") && report.status === "Approved" && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              This report is approved and locked for record integrity.
            </div>
          )}
          {writesDepartmentReports(session.role) && report.status === "Returned" && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              This report was returned. Open <span className="font-semibold">Returned Items</span>, tap{" "}
              <span className="font-semibold">Fix & resubmit</span>, correct the brief, then submit again.
            </div>
          )}
          {writesDepartmentReports(session.role) && report.status === "Approved" && (
            <div className="mt-5 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">
              This report is approved and locked for record integrity.
            </div>
          )}
        </Panel>

        {writesDepartmentReports(session.role) ? (
          <Panel title="Chairman Messages" subtitle="Approval and correction messages sent to your department.">
            {reportNotifications.length ? (
              <div className="space-y-3">
                {reportNotifications.map((notification) => (
                  <div key={notification.id} className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="font-semibold text-blue-950">{notification.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{notification.message}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                      {new Date(notification.createdAt).toLocaleString("en-GB")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No messages for this report" text="Chairman approval and correction notes will appear here." />
            )}
          </Panel>
        ) : (
          <>
            <Panel title="Approval Audit Trail" subtitle="Decision history for this report.">
              <ApprovalActionsTable actions={approvalActions} />
            </Panel>

            <Panel title="Linked Department Context" subtitle="Assets and marketing rows tied to this department.">
              <div className="grid gap-5 xl:grid-cols-2">
                <ContextList
                  title="Asset alerts"
                  rows={linkedAssets.map((asset) => `${asset.asset_id} â€¢ ${asset.name} â€¢ ${asset.status}`)}
                  emptyText="No linked assets for this department."
                />
                <ContextList
                  title="Marketing leads"
                  rows={linkedLeads.map((lead) => `${lead.client} â€¢ ${lead.proposal} â€¢ ${formatNaira(lead.quotation)}`)}
                  emptyText="No linked marketing leads for this department."
                />
              </div>
            </Panel>
          </>
        )}
      </div>
    </section>
  );
}

function ChairmanDashboard({
  submissions,
  leads,
  approvalActions,
  metrics,
  summaryData,
  onGenerateSummary,
  onPreviewSummary,
  onStatusChange,
  onReturnRequest,
  onReportOpen,
  onDepartmentSelect,
  departmentRows
}: {
  submissions: DepartmentSubmission[];
  leads: MarketingLead[];
  approvalActions: ApprovalAction[];
  metrics: {
    submitted: DepartmentSubmission[];
    approved: DepartmentSubmission[];
    pending: DepartmentSubmission[];
    drafts: DepartmentSubmission[];
    returned: DepartmentSubmission[];
    totalRevenue: number;
    totalCash: number;
    totalExpenses: number;
    alerts: number;
  };
  summaryData: ExecutiveSummaryData | null;
  onGenerateSummary: () => void;
  onPreviewSummary: () => void;
  onStatusChange: (id: string, status: Exclude<SubmissionStatus, "Draft">) => void;
  onReturnRequest: (id: string) => void;
  onReportOpen: (id: string) => void;
  onDepartmentSelect: (departmentId: string) => void;
  departmentRows: DepartmentRow[];
}) {
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!summaryData) return;
    summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [summaryData]);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Chairman Executive Dashboard"
        subtitle="A single administrative page for reviewing every departmental submission, approval status, revenue row, exception, and marketing lead."
        action={
          <button type="button" onClick={onGenerateSummary} className="primary-button">Generate Executive Summary</button>
        }
      />

      <div ref={summaryRef}>
        <Panel
          title="Executive Summary PDF"
          subtitle="Generate a professional Chairman brief with department revenue, reports, and development briefs."
        >
          {summaryData ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Summary ready for review</p>
                <p className="mt-1 text-sm text-slate-600">
                  Generated {new Date(summaryData.generatedAt).toLocaleString("en-GB")} Â· {summaryData.departmentsReporting} departments Â·{" "}
                  {formatNaira(summaryData.totalRevenue)} consolidated revenue
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={onPreviewSummary} className="secondary-button">
                  Preview PDF
                </button>
                <button type="button" onClick={onGenerateSummary} className="primary-button">
                  Regenerate
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No summary generated yet. Click Generate Executive Summary to open the PDF preview.</p>
          )}
        </Panel>
      </div>

      <MetricGrid>
        <MetricCard label="Departments Reporting" value={`${new Set(metrics.submitted.map((item) => placeLabel(item.department, item.subsidiary))).size}/${departmentRows.length || departments.length}`} tone="blue" />
        <MetricCard label="Pending Chairman Review" value={metrics.pending.length.toString()} tone="amber" />
        <MetricCard label="Consolidated Revenue" value={formatNaira(metrics.totalRevenue)} tone="green" />
        <MetricCard label="Asset / Equipment Alerts" value={metrics.alerts.toString()} tone="red" />
      </MetricGrid>

      <Panel title="Executive Position Infographics" subtitle="High-level position for Chairman review before opening the approval queue.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PositionTile label="Cash-In Reported" value={formatNaira(metrics.totalCash)} tone="green" />
          <PositionTile label="Expense Exposure" value={formatNaira(metrics.totalExpenses)} tone="amber" />
          <PositionTile label="Approved Reports" value={metrics.approved.length.toString()} tone="blue" />
          <PositionTile label="Marketing Leads" value={leads.length.toString()} tone="slate" />
        </div>
      </Panel>

      <Panel title="Chairman Approval Queue" subtitle="Review, approve, or return departmental daily submissions.">
        <SubmissionsTable submissions={submissions.filter((submission) => submission.status !== "Draft")} onStatusChange={onStatusChange} onReturnRequest={onReturnRequest} onReportOpen={onReportOpen} showActions />
      </Panel>

      <Panel title="Approval Audit Trail" subtitle="Traceable Chairman approvals and returned-report decisions.">
        <ApprovalActionsTable actions={approvalActions} />
      </Panel>

      <Panel title="Departmental Health Matrix" subtitle="Government/corporate style compliance view by arm. Click any department to open its approval page.">
        <DepartmentMatrix submissions={submissions} departmentRows={departmentRows} onDepartmentSelect={onDepartmentSelect} />
      </Panel>

      <Panel title="Marketing Pipeline for Chairman View" subtitle="Business development activity assigned to operating arms.">
        <LeadsTable leads={leads} />
      </Panel>
    </div>
  );
}

function ChairmanApprovalPage({
  submissions,
  approvalActions,
  departmentRows,
  selectedSubsidiary,
  selectedDepartment,
  onSelectedSubsidiaryChange,
  onSelectedDepartmentChange,
  onStatusChange,
  onReturnRequest,
  onReportOpen
}: {
  submissions: DepartmentSubmission[];
  approvalActions: ApprovalAction[];
  departmentRows: DepartmentRow[];
  selectedSubsidiary: string;
  selectedDepartment: Department | "All";
  onSelectedSubsidiaryChange: (subsidiary: string) => void;
  onSelectedDepartmentChange: (department: Department | "All") => void;
  onStatusChange: (id: string, status: Exclude<SubmissionStatus, "Draft">) => void;
  onReturnRequest: (id: string) => void;
  onReportOpen: (id: string) => void;
}) {
  const groups = groupBySubsidiary(departmentRows);
  const innerDepartments = selectedSubsidiary === "All"
    ? departmentRows
    : departmentRows.filter((item) => item.subsidiaryName === selectedSubsidiary);
  const inScope = (department: string, subsidiary?: string) => {
    if (selectedSubsidiary !== "All" && subsidiary !== selectedSubsidiary) return false;
    if (selectedDepartment !== "All" && department !== selectedDepartment) return false;
    return true;
  };
  const filtered = submissions.filter((submission) => submission.status !== "Draft" && inScope(submission.department, submission.subsidiary));
  const filteredActions = approvalActions.filter((action) => inScope(action.department, action.subsidiary));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Chairman Approval Queue"
        subtitle="Full-screen review workspace for approving or returning departmental daily submissions."
        action={
          <div className="flex flex-wrap gap-3">
            <select
              value={selectedSubsidiary}
              onChange={(event) => onSelectedSubsidiaryChange(event.target.value)}
              className="form-control w-72"
            >
              <option value="All">All subsidiaries</option>
              {groups.map((group) => (
                <option key={group.id} value={group.name}>{group.name}</option>
              ))}
            </select>
            <select
              value={selectedDepartment}
              onChange={(event) => onSelectedDepartmentChange(event.target.value)}
              className="form-control w-72"
            >
              <option value="All">All departments</option>
              {innerDepartments.map((department) => (
                <option key={department.id} value={department.name}>{department.name}</option>
              ))}
            </select>
          </div>
        }
      />
      <Panel title="Approval Register" subtitle="Chairman and General Manager decision actions for departmental reports.">
        <SubmissionsTable submissions={filtered} onStatusChange={onStatusChange} onReturnRequest={onReturnRequest} onReportOpen={onReportOpen} showActions />
      </Panel>
      <Panel title="Approval Audit Trail" subtitle="Decision history for the selected department scope.">
        <ApprovalActionsTable actions={filteredActions} />
      </Panel>
    </div>
  );
}

function DepartmentReportsPage({
  submissions,
  approvalActions,
  departmentRows,
  onReportOpen
}: {
  submissions: DepartmentSubmission[];
  approvalActions: ApprovalAction[];
  departmentRows: DepartmentRow[];
  onReportOpen: (id: string) => void;
}) {
  const groups = groupBySubsidiary(departmentRows);
  const sections: Array<{ id: string; name: string; departments: Array<{ id: string; name: string }> }> = groups.length
    ? groups.map((group) => ({
        id: group.id,
        name: group.name,
        departments: group.departments.map((department) => ({ id: department.id, name: department.name }))
      }))
    : [{
        id: "all",
        name: "Departments",
        departments: (departmentRows.length ? departmentRows : departments.map((name) => ({ id: name, name }))).map((department) => ({
          id: department.id,
          name: department.name
        }))
      }];

  return (
    <div className="space-y-6">
      <PageTitle
        title="Department Reports"
        subtitle="Submitted daily reports by subsidiary, then by the department inside it."
      />
      <div className="space-y-8">
        {sections.map((group) => (
          <section key={group.id} className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-blue-800">{group.name}</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.departments.map((department) => {
                const matches = (submission: DepartmentSubmission) =>
                  submission.department === department.name &&
                  (group.name === "Departments" || !submission.subsidiary || submission.subsidiary === group.name);
                const count = submissions.filter(matches).length;
                const latest = submissions.find(matches);
                return (
                  <div key={department.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-semibold text-slate-950">{department.name}</p>
                    <p className="mt-2 text-3xl font-semibold text-blue-800">{count}</p>
                    <p className="mt-1 text-xs text-slate-500">reports on file</p>
                    <div className="mt-4">{latest ? <StatusPill status={latest.status} /> : <span className="pill bg-slate-100 text-slate-600 ring-slate-200">No report</span>}</div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <Panel title="All Department Report Rows" subtitle="Detailed report register for executive review and audit trail.">
        <SubmissionsTable submissions={submissions} onReportOpen={onReportOpen} />
      </Panel>
      <Panel title="Narrative Report Detail" subtitle="Operational notes submitted by department heads.">
        <div className="grid gap-4 xl:grid-cols-2">
          {submissions.map((submission) => (
            <div key={submission.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-950">{placeLabel(submission.department, submission.subsidiary)}</p>
                <StatusPill status={submission.status} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{submission.summary}</p>
              {(submission.jobsCompleted || submission.jobsInProgress || submission.equipmentStatus?.length) && (
                <dl className="mt-4 grid gap-3 text-sm">
                  <ReportDetail label="Jobs completed" value={submission.jobsCompleted} />
                  <ReportDetail label="Jobs in progress" value={submission.jobsInProgress} />
                  <ReportDetail label="Equipment/system status" value={submission.equipmentStatus?.join(", ")} />
                  <ReportDetail label="Department update" value={submission.departmentUpdate} />
                  <ReportDetail label="Current projects" value={submission.currentProjects} />
                  <ReportDetail label="Upcoming projects" value={submission.upcomingProjects} />
                  <ReportDetail label="Growth ideas" value={submission.growthIdeas} />
                  <ReportDetail label="Challenges" value={submission.challenges} />
                </dl>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Approval History" subtitle="Auditable approval and return decisions tied to department reports.">
        <ApprovalActionsTable actions={approvalActions} />
      </Panel>
    </div>
  );
}

function AssetsPage({
  assets: assetList,
  departments: departmentOptions,
  onCreate
}: {
  assets: AssetRecord[];
  departments: DepartmentRow[];
  onCreate: (asset: AssetRecord) => Promise<void>;
}) {
  const [form, setForm] = useState({
    asset_id: "",
    name: "",
    classification: "Equipment",
    purchase_date: "",
    supplier_name: "",
    serial_number: "",
    subsidiary_id: "",
    department_id: "",
    custodian_name: "",
    warranty_expiration: "",
    maintenance_schedule_interval: "Every 30 days",
    location: "",
    status: "Operational" as AssetRecord["status"],
    book_value: ""
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const maintenanceRequired = assetList.filter((asset) => asset.status === "Maintenance Required").length;
  const criticalFaults = assetList.filter((asset) => asset.status === "Critical Fault").length;
  const bookValue = assetList.reduce((sum, asset) => sum + asset.book_value, 0);
  const expiringWarranties = assetList.filter((asset) => {
    if (asset.warranty_expiration === "N/A" || !asset.warranty_expiration) return false;
    const expiration = new Date(asset.warranty_expiration).getTime();
    const ninetyDaysFromNow = Date.now() + 1000 * 60 * 60 * 24 * 90;
    return expiration <= ninetyDaysFromNow;
  }).length;

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onCreate({
        asset_id: form.asset_id.trim(),
        name: form.name.trim(),
        classification: form.classification.trim(),
        purchase_date: form.purchase_date,
        supplier_name: form.supplier_name.trim(),
        serial_number: form.serial_number.trim(),
        department_id: form.department_id,
        custodian_name: form.custodian_name.trim(),
        warranty_expiration: form.warranty_expiration || "N/A",
        maintenance_schedule_interval: form.maintenance_schedule_interval.trim(),
        location: form.location.trim(),
        status: form.status,
        book_value: Number(form.book_value) || 0
      });
      setForm({
        asset_id: "",
        name: "",
        classification: "Equipment",
        purchase_date: "",
        supplier_name: "",
        serial_number: "",
        subsidiary_id: "",
        department_id: "",
        custodian_name: "",
        warranty_expiration: "",
        maintenance_schedule_interval: "Every 30 days",
        location: "",
        status: "Operational",
        book_value: ""
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save asset");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Assets"
        subtitle="Chairman's fixed-asset register with supplier, serial number, custodian, warranty, and maintenance accountability fields."
      />
      <MetricGrid>
        <MetricCard label="Tracked Assets" value={assetList.length.toString()} tone="blue" />
        <MetricCard label="Maintenance Required" value={maintenanceRequired.toString()} tone="amber" />
        <MetricCard label="Critical Faults" value={criticalFaults.toString()} tone="red" />
        <MetricCard label="Book Value" value={formatNaira(bookValue)} tone="green" />
      </MetricGrid>

      <Panel title="Register New Asset" subtitle="Add assets for Chairman, General Manager, and department visibility.">
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <FormInput label="Asset ID" value={form.asset_id} onChange={(value) => setForm({ ...form, asset_id: value })} />
          <FormInput label="Asset Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <FormInput label="Classification" value={form.classification} onChange={(value) => setForm({ ...form, classification: value })} />
          <FormInput label="Purchase Date" value={form.purchase_date} onChange={(value) => setForm({ ...form, purchase_date: value })} />
          <FormInput label="Supplier" value={form.supplier_name} onChange={(value) => setForm({ ...form, supplier_name: value })} />
          <FormInput label="Serial Number" value={form.serial_number} onChange={(value) => setForm({ ...form, serial_number: value })} />
          <SubsidiaryDepartmentFields
            departments={departmentOptions}
            subsidiaryId={form.subsidiary_id}
            departmentId={form.department_id}
            onSubsidiaryId={(id) => setForm({ ...form, subsidiary_id: id, department_id: "" })}
            onDepartmentId={(id) => setForm({ ...form, department_id: id })}
          />
          <FormInput label="Custodian" value={form.custodian_name} onChange={(value) => setForm({ ...form, custodian_name: value })} />
          <FormInput label="Warranty Expiration" value={form.warranty_expiration} onChange={(value) => setForm({ ...form, warranty_expiration: value })} />
          <FormInput label="Maintenance Interval" value={form.maintenance_schedule_interval} onChange={(value) => setForm({ ...form, maintenance_schedule_interval: value })} />
          <FormInput label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
          <FormInput label="Book Value" value={form.book_value} onChange={(value) => setForm({ ...form, book_value: value })} />
          <label className="block">
            <span className="field-label">Status</span>
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value as AssetRecord["status"] })}
              className="form-control"
            >
              <option value="Operational">Operational</option>
              <option value="Maintenance Required">Maintenance Required</option>
              <option value="Critical Fault">Critical Fault</option>
              <option value="Leased">Leased</option>
              <option value="Under Construction">Under Construction</option>
            </select>
          </label>
          {error && <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="md:col-span-2 xl:col-span-3">
            <button type="submit" disabled={saving || !form.asset_id.trim() || !form.name.trim() || !form.custodian_name.trim() || !form.department_id} className="primary-button disabled:opacity-60">
              {saving ? "Saving asset..." : "Save Asset"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Asset Register" subtitle="Live assets stored in Supabase.">
        {assetList.length ? (
          <SimpleTable
            headers={[
              "Asset ID",
              "Asset",
              "Classification",
              "Purchase Date",
              "Supplier",
              "Serial Number",
              "Department",
              "Custodian",
              "Warranty Expiration",
              "Maintenance Interval",
              "Status",
              "Book Value"
            ]}
            rows={assetTableRows(assetList)}
          />
        ) : (
          <EmptyState title="No assets registered" text="Use the form above to add the first corporate asset." />
        )}
      </Panel>
      <Panel title="Warranty and Maintenance Watchlist" subtitle="Items for audit, maintenance planning, and accountability follow-up.">
        <div className="grid gap-4 xl:grid-cols-3">
          <PositionTile label="Warranty Expiring Soon" value={expiringWarranties.toString()} tone={expiringWarranties ? "amber" : "green"} />
          <PositionTile label="Named Custodians" value={new Set(assetList.map((asset) => asset.custodian_name)).size.toString()} tone="blue" />
          <PositionTile label="Maintenance Schedules" value={`${assetList.length}/${assetList.length}`} tone="green" />
        </div>
      </Panel>
    </div>
  );
}

function UsersPage() {
  const [profiles, setProfiles] = useState<Array<{
    id: string;
    full_name: string;
    role: string;
    is_active: boolean;
    email: string;
    departments?: { name: string; subsidiaryName?: string | null } | null;
    subsidiaryName?: string | null;
  }>>([]);
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentRow[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("general-manager");
  const [subsidiaryId, setSubsidiaryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdLogin, setCreatedLogin] = useState<{ email: string; password: string; fullName: string; role: string } | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetResult, setResetResult] = useState<{ email: string; password: string; fullName: string } | null>(null);

  async function getAccessToken() {
    const supabase = (await import("@/lib/supabase/client")).getSupabaseBrowser();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("You must be signed in to manage users.");
    return token;
  }

  async function loadUsers() {
    const token = await getAccessToken();
    const [{ fetchDepartments: loadDepartments }] = await Promise.all([import("@/lib/ims/data")]);
    const [listResponse, deptRows] = await Promise.all([
      fetch("/api/users/list", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      loadDepartments()
    ]);
    const listPayload = await listResponse.json();
    if (!listResponse.ok) throw new Error(listPayload.error || "Failed to load users");

    setProfiles(
      (listPayload.users ?? []).map((row: any) => ({
        id: row.id as string,
        full_name: row.full_name as string,
        role: row.role as string,
        is_active: Boolean(row.is_active),
        email: (row.email as string) || "",
        departments: row.departments ? { name: row.departments.name as string, subsidiaryName: row.departments.subsidiaryName ?? null } : null,
        subsidiaryName: row.subsidiaryName ?? null
      }))
    );
    setDepartmentOptions(deptRows);
  }

  useEffect(() => {
    loadUsers().catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"));
  }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreatedLogin(null);
    setResetResult(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          role,
          departmentId: role === "department-head" || role === "manager" ? departmentId : null,
          subsidiaryId: role === "executive-director" ? subsidiaryId : null
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to create user");

      setCreatedLogin({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        role: roleLabels[role]
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("general-manager");
      setSubsidiaryId("");
      setDepartmentId("");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordReset(event: FormEvent) {
    event.preventDefault();
    if (!resetUserId) return;
    setResetBusy(true);
    setError("");
    setResetResult(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/users/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: resetUserId,
          password: resetPassword
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to reset password");

      setResetResult({
        email: payload.email || "",
        password: resetPassword,
        fullName: payload.fullName || ""
      });
      setResetPassword("");
      setResetUserId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setResetBusy(false);
    }
  }

  const gmCount = profiles.filter((item) => item.role === "general_manager").length;
  const headCount = profiles.filter((item) => item.role === "department_head").length;
  const marketingCount = profiles.filter((item) => item.role === "marketing_officer").length;
  const resetTarget = profiles.find((item) => item.id === resetUserId);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Users"
        subtitle="Chairman and General Manager create login accounts, then share the email and password with each officer."
      />
      <MetricGrid>
        <MetricCard label="Active Users" value={profiles.filter((item) => item.is_active).length.toString()} tone="blue" />
        <MetricCard label="General Managers" value={gmCount.toString()} tone="green" />
        <MetricCard label="Department Heads" value={headCount.toString()} tone="amber" />
        <MetricCard label="Marketing Officers" value={marketingCount.toString()} tone="slate" />
      </MetricGrid>

      <Panel title="Create Login Account" subtitle="Generate email and password for General Manager, Department Head, or Marketing Officer.">
        <form onSubmit={createUser} className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="field-label">Full name</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="form-control" placeholder="Head, ICT" required />
          </label>
          <label className="block">
            <span className="field-label">Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="form-control">
              <option value="general-manager">General Manager</option>
              <option value="managing-director">Managing Director</option>
              <option value="executive-director">Executive Director</option>
              <option value="director-of-administration">Director of Administration</option>
              <option value="human-resources">Central Human Resources</option>
              <option value="manager">Manager</option>
              <option value="department-head">Unit head</option>
              <option value="marketing-officer">Marketing Officer</option>
            </select>
          </label>
          <label className="block">
            <span className="field-label">Email (login)</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="form-control" placeholder="ict.head@tanjuriel.com" required />
          </label>
          <label className="block">
            <span className="field-label">Temporary password</span>
            <input type="text" value={password} onChange={(event) => setPassword(event.target.value)} className="form-control" placeholder="Create a password to share" required minLength={8} />
          </label>
          {(role === "department-head" || role === "manager") && (
            <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
              <SubsidiaryDepartmentFields
                departments={departmentOptions}
                subsidiaryId={subsidiaryId}
                departmentId={departmentId}
                onSubsidiaryId={setSubsidiaryId}
                onDepartmentId={setDepartmentId}
              />
            </div>
          )}
          {role === "executive-director" && (
            <label className="block md:col-span-2">
              <span className="field-label">Subsidiary</span>
              <select value={subsidiaryId} onChange={(event) => setSubsidiaryId(event.target.value)} className="form-control" required>
                <option value="">Select subsidiary</option>
                {groupBySubsidiary(departmentOptions).map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <div className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="md:col-span-2">
            <button type="submit" disabled={busy} className="primary-button disabled:opacity-60">
              {busy ? "Creating account..." : "Create account"}
            </button>
          </div>
        </form>

        {createdLogin && (
          <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-semibold">Account created — share these login details</p>
            <p className="mt-2"><span className="font-semibold">Name:</span> {createdLogin.fullName}</p>
            <p className="mt-1"><span className="font-semibold">Role:</span> {createdLogin.role}</p>
            <p className="mt-1"><span className="font-semibold">Email:</span> {createdLogin.email}</p>
            <p className="mt-1"><span className="font-semibold">Password:</span> {createdLogin.password}</p>
          </div>
        )}
      </Panel>

      <Panel title="Active IMS Users" subtitle="Review each account login email. Passwords cannot be viewed later — reset a temporary password if needed.">
        <div className="space-y-3">
          {profiles.length ? (
            profiles.map((profile) => (
              <div key={profile.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{profile.full_name}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {roleFromDbLabel(profile.role)}
                      {profile.subsidiaryName ? ` · ${profile.subsidiaryName}` : ""}
                      {profile.departments?.subsidiaryName && !profile.subsidiaryName ? ` · ${profile.departments.subsidiaryName}` : ""}
                      {profile.departments?.name ? ` · ${profile.departments.name}` : ""}
                    </p>
                    <p className="mt-2 break-all text-sm font-medium text-blue-900">
                      Login email: {profile.email || "Not available"}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {profile.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setResetUserId(profile.id);
                      setResetPassword("");
                      setResetResult(null);
                      setCreatedLogin(null);
                      setError("");
                    }}
                    className="table-button text-blue-800"
                  >
                    Reset password
                  </button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="No users yet" text="Created IMS accounts will appear here with their login emails." />
          )}
        </div>

        {resetTarget && (
          <form onSubmit={submitPasswordReset} className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">
              Reset temporary password for {resetTarget.full_name}
            </p>
            <p className="mt-1 text-sm text-amber-900">
              Login email: {resetTarget.email || "Not available"}
            </p>
            <label className="mt-4 block">
              <span className="field-label">New temporary password</span>
              <input
                type="text"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                className="form-control"
                placeholder="Create a new password to share"
                required
                minLength={8}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="submit" disabled={resetBusy} className="primary-button disabled:opacity-60">
                {resetBusy ? "Saving..." : "Save new password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetUserId(null);
                  setResetPassword("");
                }}
                className="secondary-button"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {resetResult && (
          <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-semibold">Password reset — share these login details</p>
            <p className="mt-2"><span className="font-semibold">Name:</span> {resetResult.fullName}</p>
            <p className="mt-1"><span className="font-semibold">Email:</span> {resetResult.email}</p>
            <p className="mt-1"><span className="font-semibold">New password:</span> {resetResult.password}</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function roleFromDbLabel(role: string) {
  if (role === "general_manager") return "General Manager";
  if (role === "managing_director") return "Managing Director";
  if (role === "executive_director") return "Executive Director";
  if (role === "director_of_administration") return "Director of Administration";
  if (role === "human_resources") return "Central Human Resources";
  if (role === "department_head") return "Unit head";
  if (role === "manager") return "Manager";
  if (role === "marketing_officer") return "Marketing Officer";
  if (role === "chairman") return "Board Chairman";
  return role;
}

function GeneralManagerDashboard({
  activePage,
  submissions,
  leads,
  assets: assetList,
  metrics,
  onReportOpen,
  onStatusChange,
  onReturnRequest,
  departmentRows
}: {
  activePage: PageId;
  submissions: DepartmentSubmission[];
  leads: MarketingLead[];
  assets: AssetRecord[];
  metrics: {
    approved: DepartmentSubmission[];
    pending: DepartmentSubmission[];
    totalRevenue: number;
    totalCash: number;
    totalExpenses: number;
    alerts: number;
  };
  onReportOpen: (id: string) => void;
  onStatusChange: (id: string, status: Exclude<SubmissionStatus, "Draft">) => void | Promise<void>;
  onReturnRequest: (id: string) => void;
  departmentRows: DepartmentRow[];
}) {
  const critical = submissions.filter((item) => item.priority === "Critical");
  const attentionAssets = assetList.filter(
    (asset) =>
      asset.status === "Maintenance Required" ||
      asset.status === "Critical Fault" ||
      asset.status === "Under Construction"
  );
  if (activePage === "Department Compliance") {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Department Compliance"
          subtitle="General Manager monitoring page for department submission discipline, returned reports, and pending Chairman approvals."
        />
        <Panel title="Compliance Matrix" subtitle="Submission status by arm.">
          <DepartmentMatrix submissions={submissions} departmentRows={departmentRows} />
        </Panel>
        <Panel title="Compliance Register" subtitle="All department submissions and review status.">
          <SubmissionsTable submissions={submissions} onReportOpen={onReportOpen} />
        </Panel>
      </div>
    );
  }

  if (activePage === "Exceptions") {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Exceptions"
          subtitle="Critical and attention-level matters requiring General Manager follow-up before Chairman decision."
        />
        <MetricGrid>
          <MetricCard label="Critical Items" value={critical.length.toString()} tone="red" />
          <MetricCard label="Returned Reports" value={submissions.filter((item) => item.status === "Returned").length.toString()} tone="amber" />
          <MetricCard label="Asset Alerts" value={metrics.alerts.toString()} tone="red" />
          <MetricCard label="Pending Reviews" value={metrics.pending.length.toString()} tone="blue" />
        </MetricGrid>
        <Panel title="Exception Register" subtitle="Critical operational issues and report rows.">
          <div className="space-y-3">
            {submissions.filter((item) => item.priority !== "Normal" || item.status === "Returned").map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">{item.department}</p>
                  <div className="flex gap-2">
                    <PriorityPill priority={item.priority} />
                    <StatusPill status={item.status} />
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  if (activePage === "Marketing Pipeline") {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Marketing Pipeline"
          subtitle="General Manager view of business development opportunities assigned to operational departments."
        />
        <MetricGrid>
          <MetricCard label="Total Leads" value={leads.length.toString()} tone="blue" />
          <MetricCard label="Quoted Value" value={formatNaira(leads.reduce((sum, lead) => sum + lead.quotation, 0))} tone="green" />
          <MetricCard label="Assigned Leads" value={leads.filter((lead) => lead.status === "Assigned").length.toString()} tone="amber" />
          <MetricCard label="Follow-up Rows" value={leads.filter((lead) => lead.status === "Follow-up").length.toString()} tone="red" />
        </MetricGrid>
        <Panel title="Marketing Pipeline Register" subtitle="Corporate client visits, proposal values, and department assignments.">
          <LeadsTable leads={leads} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <PageTitle
        title="General Manager Operations Dashboard"
        subtitle="Operational command page for monitoring departmental compliance, unresolved exceptions, asset alerts, and pipeline movement."
      />
      <MetricGrid>
        <MetricCard label="Active Operations" value={submissions.reduce((sum, item) => sum + item.activeOperations, 0).toString()} tone="blue" />
        <MetricCard label="Reports Awaiting Chairman" value={metrics.pending.length.toString()} tone="amber" />
        <MetricCard label="Critical Exceptions" value={critical.length.toString()} tone="red" />
        <MetricCard label="Marketing Assigned Leads" value={leads.filter((lead) => lead.status === "Assigned").length.toString()} tone="green" />
      </MetricGrid>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Panel title="Department Compliance Register" subtitle="Track which arms have submitted, which were returned, and which need follow-up.">
          <SubmissionsTable
            submissions={submissions}
            onReportOpen={onReportOpen}
            onStatusChange={onStatusChange}
            onReturnRequest={onReturnRequest}
            showActions
          />
        </Panel>
        <Panel title="Exception Register" subtitle="Items for General Manager intervention before Chairman review.">
          <div className="space-y-3">
            {critical.map((item) => (
              <div key={item.id} className="rounded-xl border border-red-100 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-900">{item.department}</p>
                <p className="mt-1 break-words text-sm text-red-800">{item.summary}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Corporate Asset Snapshot" subtitle="Assets requiring executive awareness.">
        {attentionAssets.length ? (
          <SimpleTable
            headers={["Asset ID", "Asset", "Department", "Custodian", "Status", "Maintenance Interval", "Warranty Expiration"]}
            rows={attentionAssets.map((asset) => [
              asset.asset_id,
              asset.name,
              asset.department_id,
              asset.custodian_name,
              asset.status,
              asset.maintenance_schedule_interval,
              asset.warranty_expiration
            ])}
          />
        ) : (
          <EmptyState title="No asset alerts" text="No maintenance, fault, or under-construction assets are registered yet." />
        )}
      </Panel>
    </div>
  );
}

function DepartmentHeadPortal({
  activePage,
  session,
  submissions,
  onSubmit,
  onReportOpen,
  onPageChange
}: {
  activePage: PageId;
  session: Session;
  submissions: DepartmentSubmission[];
  onSubmit: (submission: DepartmentSubmission) => Promise<unknown>;
  onReportOpen: (id: string) => void;
  onPageChange: (page: PageId) => void;
}) {
  const department = session.department ?? "Corporate Administration";
  const blueprint = departmentBlueprints[department] ?? {
    completedLabel: "Jobs Completed Today",
    progressLabel: "Jobs in Progress",
    equipmentLabel: "Equipment Status",
    equipmentInput: "select" as const,
    completedOptions: ["Administrative Report Filed", "Inventory Updated", "Staff Attendance Reconciled"],
    equipmentOptions: ["Office Systems", "Shared Equipment", "Records Archive"],
    progressPlaceholder: "Describe active work in progress for today."
  };

  function createEmptyForm() {
    return {
      revenue: "",
      inquiries: "",
      attendance: "",
      activeOperations: "",
      cashIn: "",
      expenses: "",
      assetsFlagged: "",
      jobsCompleted: blueprint.completedOptions[0],
      jobsInProgress: "",
      equipmentStatus: [blueprint.equipmentOptions[0]],
      departmentUpdate: "",
      currentProjects: "",
      upcomingProjects: "",
      growthIdeas: "",
      challenges: "",
      summary: ""
    };
  }

  const [form, setForm] = useState(createEmptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [resumeParentId, setResumeParentId] = useState<string | null>(null);
  const [resumeLabel, setResumeLabel] = useState("");
  const [showOptionalSummary, setShowOptionalSummary] = useState(false);

  const ownReports = submissions.filter((item) =>
    session.departmentId ? item.departmentId === session.departmentId : item.department === department
  );
  const returnedReports = ownReports.filter((item) => item.status === "Returned");
  const draftReports = ownReports.filter((item) => item.status === "Draft");
  const today = new Date().toISOString().slice(0, 10);
  const todayReports = ownReports.filter((item) => item.date === today);
  const todayDraft = todayReports.find((item) => item.status === "Draft");
  const todayPending = todayReports.find((item) => item.status === "Pending Chairman Review");
  const todayReturned = todayReports.find((item) => item.status === "Returned");
  const todayApproved = todayReports.find((item) => item.status === "Approved");

  function loadReportIntoForm(report: DepartmentSubmission, mode: "draft" | "returned") {
    setForm({
      revenue: report.revenue ? String(report.revenue) : "",
      inquiries: report.inquiries ? String(report.inquiries) : "",
      attendance: report.attendance ? String(report.attendance) : "",
      activeOperations: report.activeOperations ? String(report.activeOperations) : "",
      cashIn: report.cashIn ? String(report.cashIn) : "",
      expenses: report.expenses ? String(report.expenses) : "",
      assetsFlagged: report.assetsFlagged ? String(report.assetsFlagged) : "",
      jobsCompleted: report.jobsCompleted || blueprint.completedOptions[0],
      jobsInProgress: report.jobsInProgress || "",
      equipmentStatus: report.equipmentStatus?.length ? report.equipmentStatus : [blueprint.equipmentOptions[0]],
      departmentUpdate: report.departmentUpdate || "",
      currentProjects: report.currentProjects || "",
      upcomingProjects: report.upcomingProjects || "",
      growthIdeas: report.growthIdeas || "",
      challenges: report.challenges || "",
      summary: report.summary && report.summary !== "No narrative summary supplied." ? report.summary : ""
    });
    setResumeParentId(mode === "returned" ? report.dbId || null : null);
    setResumeLabel(
      mode === "returned"
        ? `Fixing returned report from ${report.date}`
        : `Continuing draft from ${report.date}`
    );
    setShowOptionalSummary(Boolean(report.summary && report.summary !== "No narrative summary supplied."));
    setFormError("");
    setStep(1);
    onPageChange("Daily Submission");
  }

  async function submitReport(status: "Draft" | "Pending Chairman Review") {
    setFormError("");
    if (status === "Pending Chairman Review") {
      const missing = [
        !form.departmentUpdate.trim() && "Department update",
        !form.currentProjects.trim() && "Current projects",
        !form.upcomingProjects.trim() && "Upcoming projects",
        !form.growthIdeas.trim() && "Growth ideas",
        !form.challenges.trim() && "Challenges / support needed"
      ].filter(Boolean);
      if (missing.length) {
        setStep(1);
        setFormError(`Complete the brief before submit: ${missing.join(", ")}.`);
        return;
      }
    }
    if (!session.departmentId) {
      setFormError(
        "Your profile has no department assigned. Ask the Chairman or General Manager to fix your user account."
      );
      return;
    }

    const next: DepartmentSubmission = {
      id: `IMS-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-6)}`,
      department,
      submittedBy: session.name,
      date: new Date().toISOString().slice(0, 10),
      revenue: Number(form.revenue) || 0,
      inquiries: Number(form.inquiries) || 0,
      attendance: Number(form.attendance) || 0,
      activeOperations: Number(form.activeOperations) || 0,
      cashIn: Number(form.cashIn) || 0,
      expenses: Number(form.expenses) || 0,
      assetsFlagged: Number(form.assetsFlagged) || 0,
      jobsCompleted: form.jobsCompleted,
      jobsInProgress: form.jobsInProgress,
      equipmentStatus: form.equipmentStatus,
      departmentUpdate: form.departmentUpdate,
      currentProjects: form.currentProjects,
      upcomingProjects: form.upcomingProjects,
      growthIdeas: form.growthIdeas,
      challenges: form.challenges,
      summary: form.summary || "No narrative summary supplied.",
      status,
      priority:
        Number(form.assetsFlagged) > 1 ? "Critical" : Number(form.assetsFlagged) > 0 ? "Attention" : "Normal",
      parentReportId: resumeParentId
    };

    setSaving(true);
    try {
      await onSubmit(next);
      setForm(createEmptyForm());
      setResumeParentId(null);
      setResumeLabel("");
      setShowOptionalSummary(false);
      setStep(1);
      if (status === "Pending Chairman Review") onPageChange("My Reports");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to save report");
    } finally {
      setSaving(false);
    }
  }

  if (activePage === "My Reports") {
    return (
      <div className="space-y-6">
        <PageTitle
          title={`${department} Reports`}
          subtitle="Submission history and Chairman review status for this department."
        />
        {draftReports.length > 0 && (
          <Panel title="Continue a draft" subtitle="Pick up where you left off without retyping.">
            <div className="space-y-3">
              {draftReports.map((report) => (
                <div
                  key={report.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{report.date}</p>
                    <p className="mt-1 text-sm text-slate-600">Draft · {formatNaira(report.revenue)} revenue</p>
                  </div>
                  <button type="button" onClick={() => loadReportIntoForm(report, "draft")} className="primary-button">
                    Continue draft
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        )}
        <Panel title="My Department Reports" subtitle="All reports submitted by this department head role.">
          <SubmissionsTable submissions={ownReports} onReportOpen={onReportOpen} mobileCards />
        </Panel>
      </div>
    );
  }

  if (activePage === "Returned Items") {
    return (
      <div className="space-y-6">
        <PageTitle title="Returned Items" subtitle="Fix returned reports here, then resubmit to the Chairman." />
        <Panel
          title="Returned Department Reports"
          subtitle="Tap Fix & resubmit to load the report into Daily Submission."
        >
          {returnedReports.length ? (
            <div className="space-y-3">
              {returnedReports.map((report) => (
                <div key={report.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-amber-950">{report.date}</p>
                      <p className="mt-1 text-sm text-amber-900">{report.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => onReportOpen(report.id)} className="secondary-button">
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => loadReportIntoForm(report, "returned")}
                        className="primary-button"
                      >
                        Fix & resubmit
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No returned reports" text="There are currently no returned reports for this department." />
          )}
        </Panel>
      </div>
    );
  }

  const steps = [
    { id: 1, label: "Brief" },
    { id: 2, label: "Ops" },
    { id: 3, label: "Numbers" }
  ] as const;

  function goToStep(nextStep: 1 | 2 | 3) {
    setStep(nextStep);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="space-y-4 pb-28 lg:space-y-5 lg:pb-0">
      <PageTitle
        title="Submit today’s report"
        subtitle="Phone-friendly flow: Brief → Operations → Numbers. Save a draft anytime."
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        {todayApproved ? (
          <p className="text-sm font-medium text-emerald-800">
            Today’s report is already <span className="font-semibold">Approved</span>. You can still submit an update
            if needed.
          </p>
        ) : todayPending ? (
          <p className="text-sm font-medium text-blue-800">
            Today’s report is <span className="font-semibold">Pending Chairman Review</span>.
            <button type="button" className="ml-2 font-semibold underline" onClick={() => onReportOpen(todayPending.id)}>
              Open it
            </button>
          </p>
        ) : todayReturned ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-amber-900">
              Today’s report was <span className="font-semibold">Returned</span> for correction.
            </p>
            <button
              type="button"
              onClick={() => loadReportIntoForm(todayReturned, "returned")}
              className="primary-button w-full sm:w-auto"
            >
              Fix & resubmit
            </button>
          </div>
        ) : todayDraft ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-slate-700">
              You have a <span className="font-semibold">Draft</span> for today.
            </p>
            <button
              type="button"
              onClick={() => loadReportIntoForm(todayDraft, "draft")}
              className="secondary-button w-full sm:w-auto"
            >
              Continue draft
            </button>
          </div>
        ) : (
          <p className="text-sm font-medium text-slate-600">No report for today yet. Start with the Brief.</p>
        )}
      </div>

      {resumeLabel && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900 sm:px-4">
          <span className="font-semibold">{resumeLabel}</span>
          <button
            type="button"
            className="mt-2 block font-semibold underline sm:mt-0 sm:ml-3 sm:inline"
            onClick={() => {
              setForm(createEmptyForm());
              setResumeParentId(null);
              setResumeLabel("");
              goToStep(1);
            }}
          >
            Start fresh instead
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {steps.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => goToStep(item.id)}
            className={cx(
              "min-h-12 rounded-xl border px-1.5 py-2.5 text-center text-[12px] font-semibold leading-tight sm:min-h-0 sm:px-2 sm:py-3 sm:text-sm",
              step === item.id
                ? "border-blue-700 bg-blue-700 text-white"
                : step > item.id
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-500"
            )}
          >
            {item.id}. {item.label}
          </button>
        ))}
      </div>

      <Panel
        title={
          step === 1
            ? "Step 1 · Management brief"
            : step === 2
              ? "Step 2 · Operations"
              : "Step 3 · Daily numbers"
        }
        subtitle={
          step === 1
            ? "Required. Write what the Chairman needs to know today."
            : step === 2
              ? "What your team completed and what is still running."
              : "Quick figures. You can leave zeros if not applicable."
        }
      >
        {step === 1 && (
          <div className="space-y-4">
            <NarrativeInput
              label="Department update and current activities *"
              value={form.departmentUpdate}
              onChange={(value) => setForm({ ...form, departmentUpdate: value })}
              placeholder="Give an update on your department and its current activities."
            />
            <NarrativeInput
              label="Projects currently being worked on *"
              value={form.currentProjects}
              onChange={(value) => setForm({ ...form, currentProjects: value })}
              placeholder="List active projects, workstreams, contracts, or operational tasks."
            />
            <NarrativeInput
              label="Upcoming projects and plans *"
              value={form.upcomingProjects}
              onChange={(value) => setForm({ ...form, upcomingProjects: value })}
              placeholder="State upcoming projects, plans, timelines, and preparation needs."
            />
            <NarrativeInput
              label="Growth and development ideas *"
              value={form.growthIdeas}
              onChange={(value) => setForm({ ...form, growthIdeas: value })}
              placeholder="Share plans and ideas for the growth and development of your department."
            />
            <label className="block">
              <span className="field-label">Challenges / areas where support is needed *</span>
              <textarea
                value={form.challenges}
                onChange={(event) => setForm({ ...form, challenges: event.target.value })}
                className="form-control min-h-28 resize-none"
                placeholder="State blockers, resource gaps, approval needs, faults, or unresolved operational issues."
              />
            </label>
            <button
              type="button"
              onClick={() => setShowOptionalSummary((current) => !current)}
              className="min-h-11 text-sm font-semibold text-blue-800 underline"
            >
              {showOptionalSummary ? "Hide optional summary" : "Add optional short summary"}
            </button>
            {showOptionalSummary && (
              <label className="block">
                <span className="field-label">Narrative summary (optional)</span>
                <textarea
                  value={form.summary}
                  onChange={(event) => setForm({ ...form, summary: event.target.value })}
                  className="form-control min-h-24 resize-none"
                  placeholder="One short paragraph if you want to highlight a priority for the Chairman."
                />
              </label>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <label className="block">
              <span className="field-label">{blueprint.completedLabel}</span>
              <select
                value={form.jobsCompleted}
                onChange={(event) => setForm({ ...form, jobsCompleted: event.target.value })}
                className="form-control"
              >
                {blueprint.completedOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <DepartmentEquipmentField
              label={blueprint.equipmentLabel}
              mode={blueprint.equipmentInput}
              options={blueprint.equipmentOptions}
              value={form.equipmentStatus}
              onChange={(value) => setForm({ ...form, equipmentStatus: value })}
            />
            <label className="block">
              <span className="field-label">{blueprint.progressLabel}</span>
              <textarea
                value={form.jobsInProgress}
                onChange={(event) => setForm({ ...form, jobsInProgress: event.target.value })}
                className="form-control min-h-28 resize-none"
                placeholder={blueprint.progressPlaceholder}
              />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <FormInput label="Revenue Reported" value={form.revenue} onChange={(value) => setForm({ ...form, revenue: value })} />
            <FormInput label="Inquiries" value={form.inquiries} onChange={(value) => setForm({ ...form, inquiries: value })} />
            <FormInput label="Attendance" value={form.attendance} onChange={(value) => setForm({ ...form, attendance: value })} />
            <FormInput
              label="Active Operations"
              value={form.activeOperations}
              onChange={(value) => setForm({ ...form, activeOperations: value })}
            />
            <FormInput label="Cash-In" value={form.cashIn} onChange={(value) => setForm({ ...form, cashIn: value })} />
            <FormInput label="Expenses" value={form.expenses} onChange={(value) => setForm({ ...form, expenses: value })} />
            <FormInput
              label="Assets Flagged"
              value={form.assetsFlagged}
              onChange={(value) => setForm({ ...form, assetsFlagged: value })}
            />
          </div>
        )}

        <div className="mobile-submit-bar mt-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg lg:static lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {step > 1 ? (
              <button type="button" onClick={() => goToStep((step - 1) as 1 | 2 | 3)} className="secondary-button w-full">
                Back
              </button>
            ) : (
              <button
                disabled={saving}
                onClick={() => submitReport("Draft")}
                className="secondary-button w-full disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Draft"}
              </button>
            )}
            {step < 3 ? (
              <button type="button" onClick={() => goToStep((step + 1) as 1 | 2 | 3)} className="primary-button w-full">
                Continue
              </button>
            ) : (
              <button
                disabled={saving}
                onClick={() => submitReport("Pending Chairman Review")}
                className="primary-button w-full disabled:opacity-60"
              >
                {saving ? "Submitting..." : "Submit"}
              </button>
            )}
          </div>
          {step === 3 && (
            <button
              disabled={saving}
              onClick={() => submitReport("Draft")}
              className="secondary-button w-full disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Draft instead"}
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}

function MarketingPortal({
  activePage,
  leads,
  departments: departmentOptions,
  onSubmit
}: {
  activePage: PageId;
  leads: MarketingLead[];
  departments: DepartmentRow[];
  onSubmit: (lead: MarketingLead) => Promise<void>;
}) {
  const [form, setForm] = useState({
    client: "",
    proposal: "",
    quotation: "",
    subsidiaryId: "",
    assignedDepartment: "",
    status: "New" as MarketingLead["status"]
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitLead() {
    setError("");
    setSaving(true);
    try {
      await onSubmit({
        id: `BDM-${Date.now()}`,
        client: form.client || "Unnamed Client",
        proposal: form.proposal || "General business development engagement",
        quotation: Number(form.quotation) || 0,
        assignedDepartment: form.assignedDepartment,
        status: form.status,
        visitDate: new Date().toISOString().slice(0, 10)
      });
      setForm({ client: "", proposal: "", quotation: "", subsidiaryId: "", assignedDepartment: "", status: "New" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save marketing lead");
    } finally {
      setSaving(false);
    }
  }

  if (activePage === "Proposals") {
    return (
      <MarketingReadOnlyPage
        title="Proposals"
        subtitle="Active proposal rows prepared or logged by business development."
        leads={leads.filter((lead) => lead.status !== "New")}
      />
    );
  }

  if (activePage === "Quotations") {
    return (
      <div className="space-y-6">
        <PageTitle title="Quotations" subtitle="Quotation values logged against corporate client opportunities." />
        <MetricGrid>
          <MetricCard label="Quotation Rows" value={leads.length.toString()} tone="blue" />
          <MetricCard label="Total Quoted Value" value={formatNaira(leads.reduce((sum, lead) => sum + lead.quotation, 0))} tone="green" />
          <MetricCard label="Quoted Leads" value={leads.filter((lead) => lead.status === "Quoted").length.toString()} tone="amber" />
          <MetricCard label="Follow-up Needed" value={leads.filter((lead) => lead.status === "Follow-up").length.toString()} tone="red" />
        </MetricGrid>
        <Panel title="Quotation Register" subtitle="Clean list of quotation values and department assignment.">
          <LeadsTable leads={leads} mobileCards />
        </Panel>
      </div>
    );
  }

  if (activePage === "Lead Assignment") {
    return (
      <MarketingReadOnlyPage
        title="Lead Assignment"
        subtitle="Operational departments assigned to marketing-generated opportunities."
        leads={leads}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Business Development & Marketing Officer Portal"
        subtitle="Restricted portal for logging client visits, active proposals, quotations, and lead assignment to departments."
      />
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Client Visit and Proposal Entry" subtitle="Marketing officers cannot access executive or departmental admin tools.">
          <FormInput label="Client / Organization" value={form.client} onChange={(value) => setForm({ ...form, client: value })} />
          <FormInput label="Proposal / Opportunity" value={form.proposal} onChange={(value) => setForm({ ...form, proposal: value })} />
          <FormInput label="Quotation Value" value={form.quotation} onChange={(value) => setForm({ ...form, quotation: value })} />
          <SubsidiaryDepartmentFields
            departments={departmentOptions}
            subsidiaryId={form.subsidiaryId}
            departmentId={form.assignedDepartment}
            onSubsidiaryId={(id) => setForm({ ...form, subsidiaryId: id, assignedDepartment: "" })}
            onDepartmentId={(id) => setForm({ ...form, assignedDepartment: id })}
            departmentName="Assign lead to department"
          />
          <label className="mt-4 block">
            <span className="field-label">Pipeline status</span>
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as MarketingLead["status"] })} className="form-control">
              <option value="New">New</option>
              <option value="Quoted">Quoted</option>
              <option value="Assigned">Assigned</option>
              <option value="Follow-up">Follow-up</option>
            </select>
          </label>
          <div className="sticky bottom-[4.75rem] z-10 mt-5 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button disabled={saving || !form.assignedDepartment} onClick={submitLead} className="primary-button w-full disabled:opacity-60">
              {saving ? "Saving..." : "Save Marketing Entry"}
            </button>
          </div>
        </Panel>
        <Panel title="Marketing Pipeline" subtitle="Active corporate visits, proposals, quotations, and department assignments.">
          <LeadsTable leads={leads} mobileCards />
        </Panel>
      </div>
    </div>
  );
}

function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:rounded-3xl sm:p-6">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-800 sm:text-xs sm:tracking-[0.2em]">
          Tanjuriel Corporation IMS
        </p>
        <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-slate-950 sm:mt-2 sm:text-3xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-4xl text-sm leading-5 text-slate-600 sm:mt-2 sm:leading-6">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <h3 className="text-base font-semibold tracking-tight text-slate-950 sm:text-lg">{title}</h3>
        <p className="mt-1 break-words text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className={cx("h-2.5 w-2.5 rounded-full", dotTone(tone))} />
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function SubmissionsTable({
  submissions,
  onStatusChange,
  onReturnRequest,
  onReportOpen,
  showActions,
  mobileCards
}: {
  submissions: DepartmentSubmission[];
  onStatusChange?: (id: string, status: Exclude<SubmissionStatus, "Draft">) => void;
  onReturnRequest?: (id: string) => void;
  onReportOpen?: (id: string) => void;
  showActions?: boolean;
  mobileCards?: boolean;
}) {
  return (
    <>
      {mobileCards && (
        <div className="space-y-3 lg:hidden">
          {submissions.length ? (
            submissions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onReportOpen?.(item.id)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">{placeLabel(item.department, item.subsidiary)}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.date} Â· {item.submittedBy}</p>
                  </div>
                  <StatusPill status={item.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Revenue</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatNaira(item.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Priority</p>
                    <div className="mt-1"><PriorityPill priority={item.priority} /></div>
                  </div>
                </div>
                {onReportOpen && (
                  <p className="mt-3 text-xs font-semibold text-blue-700">Tap to open report</p>
                )}
              </button>
            ))
          ) : (
            <EmptyState title="No reports yet" text="Submitted department reports will appear here." />
          )}
        </div>
      )}
      <div className={cx("max-w-full overflow-x-auto rounded-2xl border border-slate-200", mobileCards && "hidden lg:block")}>
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              {[
                "Department",
                "Submitted By",
                "Revenue",
                "Operations",
                "Alerts",
                "Status",
                "Priority",
                onReportOpen ? "Open" : "",
                showActions ? "Chairman Action" : ""
              ].filter(Boolean).map((header) => (
                <th key={header} className="border-b border-slate-200 px-4 py-3 font-bold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {submissions.map((item) => (
              <tr
                key={item.id}
                onClick={() => onReportOpen?.(item.id)}
                className={cx("hover:bg-slate-50", onReportOpen && "cursor-pointer")}
              >
                <td className="px-4 py-3 font-semibold text-slate-950">
                  <span>{placeLabel(item.department, item.subsidiary)}</span>
                  {onReportOpen && <span className="ml-2 text-[11px] font-semibold text-blue-700">View overview</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{item.submittedBy}</td>
                <td className="px-4 py-3 font-semibold">{formatNaira(item.revenue)}</td>
                <td className="px-4 py-3">{item.activeOperations}</td>
                <td className="px-4 py-3">{item.assetsFlagged}</td>
                <td className="px-4 py-3"><StatusPill status={item.status} /></td>
                <td className="px-4 py-3"><PriorityPill priority={item.priority} /></td>
                {onReportOpen && (
                  <td className="px-4 py-3">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onReportOpen(item.id);
                      }}
                      className="table-button text-blue-700"
                    >
                      Open
                    </button>
                  </td>
                )}
                {showActions && onStatusChange && (
                  <td className="px-4 py-3">
                    {item.status === "Approved" ? (
                      <span className="text-xs font-semibold text-slate-500">Locked after approval</span>
                    ) : (
                      <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                        <button onClick={() => onStatusChange(item.id, "Approved")} className="table-button text-green-700">Approve</button>
                        <button onClick={() => onReturnRequest ? onReturnRequest(item.id) : onStatusChange(item.id, "Returned")} className="table-button text-red-700">Return</button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DepartmentMatrix({
  submissions,
  departmentRows,
  onDepartmentSelect
}: {
  submissions: DepartmentSubmission[];
  departmentRows: DepartmentRow[];
  onDepartmentSelect?: (departmentId: string) => void;
}) {
  const groups = groupBySubsidiary(departmentRows);
  const sections: Array<{ id: string; name: string; departments: Array<{ id: string; name: string }> }> = groups.length
    ? groups.map((group) => ({
        id: group.id,
        name: group.name,
        departments: group.departments.map((department) => ({ id: department.id, name: department.name }))
      }))
    : [{
        id: "all",
        name: "Departments",
        departments: (departmentRows.length ? departmentRows : departments.map((name) => ({ id: name, name }))).map((department) => ({
          id: department.id,
          name: department.name
        }))
      }];

  return (
    <div className="space-y-6">
      {sections.map((group) => (
        <section key={group.id} className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-blue-800">{group.name}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {group.departments.map((department) => {
              const latest = submissions.find((item) => item.department === department.name && (group.name === "Departments" || !item.subsidiary || item.subsidiary === group.name));
              return (
                <button
                  key={department.id}
                  onClick={() => onDepartmentSelect?.(department.id)}
                  className={cx(
                    "rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition",
                    onDepartmentSelect && "hover:border-blue-200 hover:bg-blue-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{department.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{latest ? latest.submittedBy : "No submission today"}</p>
                    </div>
                    {latest ? <StatusPill status={latest.status} /> : <span className="pill bg-slate-200 text-slate-600">Missing</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function LeadsTable({ leads, mobileCards }: { leads: MarketingLead[]; mobileCards?: boolean }) {
  return (
    <>
      {mobileCards && (
        <div className="space-y-3 lg:hidden">
          {leads.length ? (
            leads.map((lead) => (
              <div key={lead.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{lead.client}</p>
                    <p className="mt-1 text-xs text-slate-500">{lead.visitDate} Â· {lead.assignedDepartment}</p>
                  </div>
                  <span className="pill bg-blue-50 text-blue-800 ring-blue-200">{lead.status}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{lead.proposal}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{formatNaira(lead.quotation)}</p>
              </div>
            ))
          ) : (
            <EmptyState title="No marketing rows" text="Saved visits and proposals will appear here." />
          )}
        </div>
      )}
      <div className={cx(mobileCards && "hidden lg:block")}>
        <SimpleTable
          headers={["Client", "Visit Date", "Proposal", "Quotation", "Assigned Department", "Status"]}
          rows={leads.map((lead) => [
            lead.client,
            lead.visitDate,
            lead.proposal,
            formatNaira(lead.quotation),
            lead.assignedDepartment,
            lead.status
          ])}
        />
      </div>
    </>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-[760px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="border-b border-slate-200 px-4 py-3 font-bold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={index} className="hover:bg-slate-50">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="whitespace-nowrap px-4 py-3 text-slate-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalActionsTable({ actions }: { actions: ApprovalAction[] }) {
  if (!actions.length) {
    return <EmptyState title="No approval actions yet" text="Chairman approval and returned-report actions will appear here." />;
  }

  return (
    <SimpleTable
      headers={["Date/Time", "Department", "Actor", "Previous Status", "Action", "Comment"]}
      rows={actions.map((action) => [
        new Date(action.createdAt).toLocaleString("en-GB"),
        placeLabel(action.department, action.subsidiary),
        action.actor,
        action.previousStatus,
        action.action,
        action.comment
      ])}
    />
  );
}

function assetTableRows(assetList: AssetRecord[]) {
  return assetList.map((asset) => [
    asset.asset_id,
    asset.name,
    asset.classification,
    asset.purchase_date,
    asset.supplier_name,
    asset.serial_number,
    asset.department_id,
    asset.custodian_name,
    asset.warranty_expiration,
    asset.maintenance_schedule_interval,
    asset.status,
    formatNaira(asset.book_value)
  ]);
}

function FormInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-4 block first:mt-0">
      <span className="field-label">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-control"
        placeholder="Enter value"
        inputMode="decimal"
      />
    </label>
  );
}

function NarrativeInput({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-control min-h-32 resize-y sm:min-h-28 sm:resize-none"
        placeholder={placeholder}
        rows={4}
      />
    </label>
  );
}

function DepartmentEquipmentField({
  label,
  mode,
  options,
  value,
  onChange
}: {
  label: string;
  mode: "select" | "checklist";
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  if (mode === "select") {
    return (
      <label className="block">
        <span className="field-label">{label}</span>
        <select value={value[0] ?? ""} onChange={(event) => onChange([event.target.value])} className="form-control">
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
        {options.map((option) => {
          const checked = value.includes(option);
          return (
            <label key={option} className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange(event.target.checked ? [...value, option] : value.filter((item) => item !== option))
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-800"
              />
              {option}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function MarketingReadOnlyPage({ title, subtitle, leads }: { title: string; subtitle: string; leads: MarketingLead[] }) {
  return (
    <div className="space-y-6">
      <PageTitle title={title} subtitle={subtitle} />
      <Panel title={`${title} Register`} subtitle="Filtered marketing operations view.">
        {leads.length ? (
          <LeadsTable leads={leads} mobileCards />
        ) : (
          <EmptyState title="No rows found" text="No marketing rows match this page yet." />
        )}
      </Panel>
    </div>
  );
}

async function downloadExecutiveSummaryPdf(element: HTMLElement, filename: string) {
  const html2pdf = (await import("html2pdf.js")).default;
  await html2pdf()
    .set({
      margin: [10, 10, 12, 10] as [number, number, number, number],
      filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    })
    .from(element)
    .save();
}

function ExecutiveSummaryDocument({ data, documentRef }: { data: ExecutiveSummaryData; documentRef?: RefObject<HTMLDivElement> }) {
  return (
    <div
      ref={documentRef}
      className="mx-auto w-full max-w-[794px] bg-white text-slate-900"
      style={{ fontFamily: '"Segoe UI", Calibri, Arial, sans-serif' }}
    >
      <div className="border-b-4 border-blue-900 bg-slate-50 px-8 py-7">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <img src="/tanjuriel-logo.jpg" alt="Tanjuriel Corporation" className="h-16 w-16 shrink-0 object-contain" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-blue-900">Tanjuriel Corporation</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Executive Summary Report</h1>
              <p className="mt-1 text-sm text-slate-600">Information Management System Â· Chairman Brief</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Report Date</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{data.dateLabel}</p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-800">Confidential</p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <p className="text-sm leading-6 text-slate-600">
          Consolidated departmental revenue, operational reports, and Department Development Briefs for executive review and approval
          oversight.
        </p>

        <div className="exec-avoid-break mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          <SummaryStat label="Departments Reporting" value={`${data.departmentsReporting}/${data.departmentsTotal}`} />
          <SummaryStat label="Pending Approvals" value={String(data.pendingApprovals)} />
          <SummaryStat label="Asset Alerts" value={String(data.alerts)} />
          <SummaryStat label="Consolidated Revenue" value={formatNaira(data.totalRevenue)} />
          <SummaryStat label="Cash-In Reported" value={formatNaira(data.totalCash)} />
          <SummaryStat label="Expense Exposure" value={formatNaira(data.totalExpenses)} />
        </div>

        <section className="exec-avoid-break mt-8">
          <h2 className="border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-[0.16em] text-blue-900">
            1. Revenue by Department
          </h2>
          <table className="mt-4 w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="bg-blue-900 text-white">
                <th className="px-3 py-2.5 font-semibold">Department</th>
                <th className="px-3 py-2.5 font-semibold">Reports</th>
                <th className="px-3 py-2.5 font-semibold">Revenue</th>
                <th className="px-3 py-2.5 font-semibold">Cash-In</th>
                <th className="px-3 py-2.5 font-semibold">Expenses</th>
                <th className="px-3 py-2.5 font-semibold">Ops</th>
                <th className="px-3 py-2.5 font-semibold">Alerts</th>
              </tr>
            </thead>
            <tbody>
              {data.revenueByDepartment.map((row, index) => (
                <tr key={row.department} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="border-b border-slate-200 px-3 py-2.5 font-medium text-slate-900">{row.department}</td>
                  <td className="border-b border-slate-200 px-3 py-2.5">{row.reportCount}</td>
                  <td className="border-b border-slate-200 px-3 py-2.5">{formatNaira(row.revenue)}</td>
                  <td className="border-b border-slate-200 px-3 py-2.5">{formatNaira(row.cashIn)}</td>
                  <td className="border-b border-slate-200 px-3 py-2.5">{formatNaira(row.expenses)}</td>
                  <td className="border-b border-slate-200 px-3 py-2.5">{row.operations}</td>
                  <td className="border-b border-slate-200 px-3 py-2.5">{row.alerts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-8">
          <h2 className="border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-[0.16em] text-blue-900">
            2. Department Reports & Development Briefs
          </h2>
          <div className="mt-4 space-y-5">
            {data.reportsByDepartment.map((group) => (
              <div key={group.department} className="exec-avoid-break rounded-xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <h3 className="text-base font-semibold text-slate-950">{group.department}</h3>
                </div>
                <div className="space-y-4 p-4">
                  {group.reports.map((report) => (
                    <div key={report.id} className="exec-avoid-break rounded-lg border border-slate-100 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{report.id}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {report.submittedBy} Â· {report.date} Â· {report.status} Â· Priority: {report.priority}
                          </p>
                        </div>
                        <div className="text-right text-xs text-slate-600">
                          <p>Revenue: <span className="font-semibold text-slate-900">{formatNaira(report.revenue)}</span></p>
                          <p className="mt-1">Operations: {report.activeOperations} Â· Alerts: {report.assetsFlagged}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-[12px] leading-5 text-slate-700 md:grid-cols-3">
                        <p><span className="font-semibold text-slate-900">Inquiries:</span> {report.inquiries ?? "N/A"}</p>
                        <p><span className="font-semibold text-slate-900">Attendance:</span> {report.attendance ?? "N/A"}</p>
                        <p><span className="font-semibold text-slate-900">Jobs Completed:</span> {report.jobsCompleted || "N/A"}</p>
                      </div>

                      <div className="mt-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Narrative Summary</p>
                        <p className="mt-1 text-[12px] leading-5 text-slate-700">{report.summary || "Not provided"}</p>
                      </div>

                      <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-900">Department Development Brief</p>
                        <div className="mt-3 space-y-2.5 text-[12px] leading-5 text-slate-700">
                          <BriefLine label="Department update and current activities" value={report.departmentUpdate} />
                          <BriefLine label="Projects currently being worked on" value={report.currentProjects} />
                          <BriefLine label="Upcoming projects and plans" value={report.upcomingProjects} />
                          <BriefLine label="Growth and development ideas" value={report.growthIdeas} />
                          <BriefLine label="Challenges / support needed" value={report.challenges} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 border-t border-slate-200 pt-4 text-[11px] text-slate-500">
          <p>Prepared through Tanjuriel IMS for Chairman executive review.</p>
          <p className="mt-1">Generated {new Date(data.generatedAt).toLocaleString("en-GB")} Â· Official internal use only</p>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function BriefLine({ label, value }: { label: string; value?: string }) {
  return (
    <p>
      <span className="font-semibold text-slate-900">{label}:</span> {value || "Not provided"}
    </p>
  );
}

function ExecutiveSummaryPreviewModal({
  data,
  onClose,
  canArchive
}: {
  data: ExecutiveSummaryData;
  onClose: () => void;
  canArchive?: boolean;
}) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState("");

  async function handleDownload() {
    if (!documentRef.current || downloading) return;
    setDownloading(true);
    try {
      const stamp = new Date(data.generatedAt).toISOString().slice(0, 10);
      await downloadExecutiveSummaryPdf(documentRef.current, `Tanjuriel-Executive-Summary-${stamp}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  async function handleArchive() {
    if (!documentRef.current || archiving) return;
    setArchiving(true);
    setArchiveMessage("");
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const stamp = new Date(data.generatedAt).toISOString().slice(0, 10);
      const pdfBlob: Blob = await html2pdf()
        .set({
          margin: [10, 10, 12, 10] as [number, number, number, number],
          filename: `Tanjuriel-Executive-Summary-${stamp}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
        })
        .from(documentRef.current)
        .outputPdf("blob");

      const pdfBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || "");
          resolve(result.includes(",") ? result.split(",")[1] : result);
        };
        reader.onerror = () => reject(new Error("Failed to encode PDF"));
        reader.readAsDataURL(pdfBlob);
      });

      const supabase = (await import("@/lib/supabase/client")).getSupabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("You must be signed in to archive summaries.");

      const summaryText = [
        `Date: ${data.dateLabel}`,
        `Departments reporting: ${data.departmentsReporting}/${data.departmentsTotal}`,
        `Pending approvals: ${data.pendingApprovals}`,
        `Revenue: ${formatNaira(data.totalRevenue)}`,
        `Cash-in: ${formatNaira(data.totalCash)}`,
        `Expenses: ${formatNaira(data.totalExpenses)}`,
        `Alerts: ${data.alerts}`,
        "",
        "REVENUE BY DEPARTMENT",
        ...data.revenueByDepartment.map(
          (row) =>
            `${row.department}: reports ${row.reportCount}; revenue ${formatNaira(row.revenue)}; cash-in ${formatNaira(row.cashIn)}; expenses ${formatNaira(row.expenses)}`
        ),
        "",
        "DEPARTMENT DEVELOPMENT BRIEFS",
        ...data.reportsByDepartment.flatMap((group) => [
          group.department,
          ...group.reports.flatMap((report) => [
            `${report.id} (${report.status})`,
            `Update: ${report.departmentUpdate || "Not provided"}`,
            `Current projects: ${report.currentProjects || "Not provided"}`,
            `Upcoming: ${report.upcomingProjects || "Not provided"}`,
            `Growth: ${report.growthIdeas || "Not provided"}`,
            `Challenges: ${report.challenges || "Not provided"}`,
            ""
          ])
        ])
      ].join("\n");

      const response = await fetch("/api/summaries/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          summaryText,
          reportingDate: stamp,
          pdfBase64,
          totals: {
            approvedReportCount: data.reportsByDepartment.reduce((sum, group) => sum + group.reports.length, 0),
            totalRevenue: data.totalRevenue,
            totalCash: data.totalCash,
            totalExpenses: data.totalExpenses,
            alerts: data.alerts
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to archive summary");
      setArchiveMessage("Executive summary archived to Supabase Storage.");
    } catch (error) {
      setArchiveMessage(error instanceof Error ? error.message : "Failed to archive summary");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">PDF Preview</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">Executive Summary Report</p>
            {archiveMessage && <p className="mt-1 text-xs text-slate-600">{archiveMessage}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onClose} className="secondary-button">
              Close
            </button>
            <button type="button" onClick={handleDownload} className="secondary-button" disabled={downloading || archiving}>
              {downloading ? "Preparing PDF..." : "Download PDF"}
            </button>
            {canArchive && (
              <button type="button" onClick={handleArchive} className="primary-button" disabled={archiving || downloading}>
                {archiving ? "Archiving..." : "Save / Archive"}
              </button>
            )}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-200/70 p-4 shadow-2xl sm:p-6">
          <ExecutiveSummaryDocument data={data} documentRef={documentRef} />
        </div>
      </div>
    </div>
  );
}

function ReturnCorrectionDialog({
  report,
  comment,
  onCommentChange,
  onCancel,
  onSubmit
}: {
  report: DepartmentSubmission;
  comment: string;
  onCommentChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="border-b border-slate-100 pb-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">Return for Correction</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{report.department}</h3>
          <p className="mt-1 text-sm text-slate-500">{report.id} â€¢ Submitted by {report.submittedBy}</p>
        </div>
        <label className="mt-5 block">
          <span className="field-label">Correction message to department head</span>
          <textarea
            value={comment}
            onChange={(event) => onCommentChange(event.target.value)}
            className="form-control min-h-40 resize-none"
            placeholder="Write exactly what should be corrected, clarified, or resubmitted."
          />
        </label>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button onClick={onCancel} className="secondary-button">Cancel</button>
          <button onClick={onSubmit} className="primary-button bg-red-700 hover:bg-red-800">Return and Notify Department</button>
        </div>
      </section>
    </div>
  );
}

function NotificationPopup({
  notifications,
  onClose,
  onReportOpen
}: {
  notifications: ImsNotification[];
  onClose: () => void;
  onReportOpen: (id: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
      onClick={onClose}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-popup-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-800">Alerts</p>
            <h3 id="notification-popup-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
              Notifications
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Approval and correction messages from the Chairman and General Manager.
            </p>
          </div>
          <button onClick={onClose} className="secondary-button shrink-0 px-3 py-2 text-xs sm:text-sm">
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {notifications.length ? (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div key={notification.id} className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-blue-950">{notification.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{notification.message}</p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                        {new Date(notification.createdAt).toLocaleString("en-GB")}
                      </p>
                    </div>
                    <button
                      onClick={() => onReportOpen(notification.reportId)}
                      className="table-button w-full bg-white text-blue-800 sm:w-auto"
                    >
                      Open Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No notifications yet"
              text="Approval and return messages for your department will appear here after the Chairman acts on a report."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}

function ContextList({ title, rows, emptyText }: { title: string; rows: string[]; emptyText: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      {rows.length ? (
        <div className="mt-2 space-y-2">
          {rows.map((row) => (
            <div key={row} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
              {row}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

function NarrativeBlock({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      <p className="mt-2 text-[0.95rem] leading-7 text-slate-700">{text || "Not supplied"}</p>
    </div>
  );
}

function PositionTile({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 sm:text-xs">{label}</p>
      <p className={cx("mt-2 break-words text-base font-semibold tracking-tight sm:mt-3 sm:text-2xl", textTone(tone))}>{value}</p>
      <div className="mt-3 hidden h-2 rounded-full bg-white sm:mt-4 sm:block">
        <div className={cx("h-2 rounded-full", dotTone(tone))} style={{ width: tone === "red" ? "42%" : tone === "amber" ? "58%" : "82%" }} />
      </div>
    </div>
  );
}

function ReportDetail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-[0.95rem] leading-6 text-slate-700">{value}</dd>
    </div>
  );
}

function LoginPoint({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function PositionRow({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className={cx("text-sm font-semibold", textTone(tone))}>{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: SubmissionStatus }) {
  return (
    <span
      className={cx(
        "pill",
        status === "Draft" && "bg-slate-100 text-slate-700 ring-slate-200",
        status === "Approved" && "bg-green-50 text-green-700 ring-green-200",
        status === "Pending Chairman Review" && "bg-amber-50 text-amber-700 ring-amber-200",
        status === "Returned" && "bg-red-50 text-red-700 ring-red-200"
      )}
    >
      {status}
    </span>
  );
}

function PriorityPill({ priority }: { priority: DepartmentSubmission["priority"] }) {
  return (
    <span
      className={cx(
        "pill",
        priority === "Normal" && "bg-slate-100 text-slate-700 ring-slate-200",
        priority === "Attention" && "bg-amber-50 text-amber-700 ring-amber-200",
        priority === "Critical" && "bg-red-50 text-red-700 ring-red-200"
      )}
    >
      {priority}
    </span>
  );
}

function dotTone(tone: Tone) {
  return {
    blue: "bg-blue-700",
    green: "bg-green-600",
    amber: "bg-amber-500",
    red: "bg-red-600",
    slate: "bg-slate-500"
  }[tone];
}

function textTone(tone: Tone) {
  return {
    blue: "text-blue-800",
    green: "text-green-700",
    amber: "text-amber-700",
    red: "text-red-700",
    slate: "text-slate-700"
  }[tone];
}
