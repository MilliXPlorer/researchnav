import type { RoleConfig, UserSession } from "./types";

export const instituteNames = [
  "Institute of Computer Studies",
  "Institute of Health Sciences",
  "Institute of Business and Financial Management",
  "Institute of Arts and Sciences",
  "Institute of Criminal Justice Education",
  "Institute of Teacher Education",
] as const;

export const programsByInstitute: Record<
  (typeof instituteNames)[number],
  readonly string[]
> = {
  "Institute of Computer Studies": [
    "Bachelor of Science in Computer Science",
    "Bachelor of Science in Information Technology",
  ],
  "Institute of Health Sciences": ["Bachelor of Science in Midwifery"],
  "Institute of Business and Financial Management": [
    "Bachelor of Science in Business Administration major in Human Resource Management",
    "Bachelor of Science in Business Administration major in Marketing Management",
  ],
  "Institute of Arts and Sciences": [
    "Bachelor of Arts in Communication",
    "Bachelor of Arts in English Language",
    "Bachelor of Arts in Political Science",
  ],
  "Institute of Criminal Justice Education": [
    "Bachelor of Science in Criminology",
    "Bachelor of Science in Industrial Security Management",
  ],
  "Institute of Teacher Education": [
    "Bachelor of Elementary Education",
    "Bachelor of Secondary Education major in English",
    "Bachelor of Secondary Education major in Filipino",
    "Bachelor of Secondary Education major in Mathematics",
    "Bachelor of Secondary Education major in Science",
    "Bachelor of Secondary Education major in Social Studies",
  ],
};

// New Google-authenticated accounts stay blocked until a coordinator activates an assignment.
export const defaultUserSession: UserSession = {
  email: "researcher@gmail.com",
  role: "researcher",
  accessStatus: "blocked",
  isAdmin: false,
  firstName: null,
  middleName: null,
  lastName: null,
  studentEmployeeId: null,
  displayName: "researcher@gmail.com",
  profilePhotoUrl: null,
};

export const roleConfigs: RoleConfig[] = [
  {
    id: "admin",
    label: "System Administrator",
    shortLabel: "Administrator",
    description: "Provision accounts and manage system-wide access.",
    nav: [
      "Dashboard",
      "Access Requests",
      "User & Role Management",
      "Audit Logs",
      "Upload Manuscript",
      "System Settings",
    ],
  },
  {
    id: "researcher",
    label: "Researcher",
    shortLabel: "Student researcher",
    description: "Track submissions, revisions, and related studies.",
    nav: ["Dashboard", "My Research", "Similarity Check"],
  },
  {
    id: "adviser",
    label: "Research Adviser",
    shortLabel: "Adviser",
    description: "Review advisee drafts and similarity alerts.",
    nav: [
      "Dashboard",
      "Assigned Research",
      "User Logs",
    ],
  },
  {
    id: "instructor",
    label: "Research Instructor",
    shortLabel: "Instructor",
    description: "Oversee class proposals and similarity trends.",
    nav: [
      "Dashboard",
      "My Sections",
      "User Logs",
    ],
  },
  {
    id: "panel",
    label: "Research Panel",
    shortLabel: "Panel member",
    description: "Read manuscripts and submit evaluations.",
    nav: [
      "Dashboard",
      "Assigned Research",
      "User Logs",
    ],
  },
  {
    id: "statistician",
    label: "Statistician",
    shortLabel: "Statistician",
    description: "Review methodology and issue sign-offs.",
    nav: [
      "Dashboard",
      "Assigned Research",
      "User Logs",
    ],
  },
  {
    id: "research_editor",
    label: "Research Editor",
    shortLabel: "Editor",
    description:
      "Review manuscript language, clarity, organization, and formatting.",
    nav: [
      "Dashboard",
      "Assigned Research",
      "User Logs",
    ],
  },
  {
    id: "coordinator",
    label: "Research Coordinator",
    shortLabel: "Coordinator",
    description: "Monitor the program, schedules, and duplicate flags.",
    nav: [
      "Program Overview",
      "Schedules",
      "Duplicate Flags",
      "Adviser Load",
      "Account Roles",
      "Reports",
    ],
  },
  {
    id: "librarian",
    label: "Librarian",
    shortLabel: "Librarian",
    description:
      "Review references, citations, links, and source documentation.",
    nav: [
      "Dashboard",
      "Assigned Research",
      "User Logs",
    ],
  },
  {
    id: "research-office",

    label: "Research Office",

    shortLabel: "Research Office personnel",

    description: "Manage compliance, reports, and roles.",

    nav: [
      "Dashboard",
      "Assigned Research",
      "Similarity Check",
      "Upload Manuscript",
      "User & Role Management",
      "Reports & Exports",
    ],
  },
];