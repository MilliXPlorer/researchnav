import type { ResearchRecord, RoleConfig, UserSession } from "./types";

// New Google-authenticated accounts stay blocked until a coordinator activates an assignment.
export const defaultUserSession: UserSession = {
  email: "researcher@gmail.com",
  role: "researcher",
  accessStatus: "blocked",
  isAdmin: false,
};

export const researchRecords: ResearchRecord[] = [
  {
    id: "RN-2025-041",
    title:
      "RESEARCHNAV: A Web-Based Research Repository System with Automated Title Similarity Detection",
    authors: "Filjoy A. Murallon, Jay R. Santos",
    year: 2025,
    institute: "Institute of Computer Studies",
    program: "BS Computer Science",
    category: "Web-based Systems",
    abstract:
      "A centralized institutional repository that improves research discovery and identifies related title proposals using TF-IDF and cosine similarity.",
    keywords: ["repository", "similarity", "TF-IDF"],
    similarity: 42,
    status: "Under Review",
  },
  {
    id: "RN-2024-118",
    title:
      "Digital Archiving and Records Management System for Academic Institutions",
    authors: "Maria T. Dela Cruz, Kevin P. Reyes",
    year: 2024,
    institute: "Institute of Computer Studies",
    program: "BS Information Technology",
    category: "Information Systems",
    abstract:
      "An archive management platform for preserving academic records, streamlining metadata entry, and improving long-term institutional access.",
    keywords: ["digital archive", "records", "metadata"],
    similarity: 38,
    status: "Archived",
  },
  {
    id: "RN-2024-097",
    title:
      "Smart Attendance Monitoring Using Facial Recognition and Classroom Analytics",
    authors: "John L. Santos, Anne M. Villarin",
    year: 2024,
    institute: "Institute of Computer Studies",
    program: "BS Computer Science",
    category: "Artificial Intelligence",
    abstract:
      "A classroom attendance platform that combines facial recognition, live occupancy insights, and automated attendance reporting.",
    keywords: ["attendance", "facial recognition", "analytics"],
    similarity: 74,
    status: "Revision Required",
  },
  {
    id: "RN-2023-066",
    title:
      "Institutional Repository Platform for Undergraduate Research and Creative Works",
    authors: "Sophia N. Flores, Mark R. Lopez",
    year: 2023,
    institute: "Institute of Arts and Sciences",
    program: "BA Communication",
    category: "Web-based Systems",
    abstract:
      "A searchable platform designed to showcase undergraduate scholarship while standardizing record submission and publication workflows.",
    keywords: ["institutional repository", "research", "publication"],
    similarity: 61,
    status: "Archived",
  },
  {
    id: "RN-2023-052",
    title:
      "Inventory and Sales Management System for Community-Based Small Businesses",
    authors: "Carlo D. Gomez, Rica P. Tan",
    year: 2023,
    institute: "Institute of Business Studies",
    program: "BS Business Administration",
    category: "Information Systems",
    abstract:
      "A practical inventory and sales monitoring solution developed around the workflows and reporting needs of small local retailers.",
    keywords: ["inventory", "sales", "small business"],
    similarity: 24,
    status: "Archived",
  },
  {
    id: "RN-2022-031",
    title: "Learning Management Portal for Flexible and Blended Instruction",
    authors: "Ella V. Ramos, Dominic C. Yu",
    year: 2022,
    institute: "Institute of Teacher Education",
    program: "BSEd",
    category: "Educational Technology",
    abstract:
      "A learning portal for managing course resources, formative assessments, class communication, and student progress in flexible instruction.",
    keywords: ["learning management", "blended learning", "portal"],
    similarity: 51,
    status: "Archived",
  },
];

export const roleConfigs: RoleConfig[] = [
  {
    id: "admin",
    label: "System Administrator",
    shortLabel: "Administrator",
    description: "Provision coordinators and manage system-wide access.",
    nav: [
      "System Overview",
      "Coordinator Accounts",
      "All Users",
      "Audit Logs",
      "System Settings",
      "Notifications",
    ],
  },
  {
    id: "researcher",
    label: "Researcher",
    shortLabel: "Student researcher",
    description: "Track submissions, revisions, and related studies.",
    nav: [
      "My Dashboard",
      "My Submissions",
      "New Submission",
      "Similarity Check",
      "Related Studies",
      "Notifications",
    ],
  },
  {
    id: "adviser",
    label: "Research Adviser",
    shortLabel: "Adviser",
    description: "Review advisee drafts and similarity alerts.",
    nav: [
      "My Advisees",
      "Pending Reviews",
      "Similarity Alerts",
      "Feedback History",
      "Notifications",
    ],
  },
  {
    id: "instructor",
    label: "Research Instructor",
    shortLabel: "Instructor",
    description: "Oversee class proposals and similarity trends.",
    nav: [
      "My Sections",
      "Title Proposals",
      "Similarity Overview",
      "Class Reports",
      "Notifications",
    ],
  },
  {
    id: "panel",
    label: "Research Panel",
    shortLabel: "Panel member",
    description: "Read manuscripts and submit evaluations.",
    nav: [
      "Defense Schedule",
      "Assigned Manuscripts",
      "Evaluation Form",
      "Panel History",
    ],
  },
  {
    id: "statistician",
    label: "Statistician",
    shortLabel: "Statistician",
    description: "Review methodology and issue sign-offs.",
    nav: [
      "Review Queue",
      "Methodology Checklist",
      "Sign-offs Issued",
      "Notifications",
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
      "Notifications",
    ],
  },
  {
    id: "librarian",
    label: "Librarian",
    shortLabel: "Librarian",
    description: "Catalog, validate, and publish approved research.",
    nav: [
      "Archiving Queue",
      "Repository Catalog",
      "Metadata Standards",
      "Retention & Compliance",
      "Notifications",
    ],
  },
  {
    id: "research-office",
    label: "Research Office",
    shortLabel: "CAES administrator",
    description: "Manage compliance, reports, roles, and privacy.",
    nav: [
      "Institutional Overview",
      "Compliance Review",
      "User & Role Management",
      "Reports & Exports",
      "Data Privacy Log",
      "Notifications",
    ],
  },
  {
    id: "academics",
    label: "Academics",
    shortLabel: "Faculty member",
    description: "Search, save, and cross-reference studies.",
    nav: ["Search", "My Library", "Browse by Category", "Notifications"],
  },
];

export const notifications = [
  {
    id: 1,
    group: "Today",
    title: "Revision feedback received",
    detail: "Prof. Villarin left 3 comments on your methodology.",
    time: "10:24 AM",
    unread: true,
    targetNav: "My Dashboard",
    recordId: "RN-2025-041",
  },
  {
    id: 2,
    group: "Today",
    title: "Similarity check complete",
    detail: "Your revised title returned a moderate score of 42%.",
    time: "8:05 AM",
    unread: true,
    targetNav: "My Dashboard",
    recordId: "RN-2025-041",
  },
  {
    id: 3,
    group: "This week",
    title: "Defense schedule updated",
    detail: "Your proposal defense is set for July 14 at Room 302.",
    time: "Monday",
    unread: false,
    targetNav: "My Dashboard",
    recordId: "RN-2025-041",
  },
];
