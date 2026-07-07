import { lazy } from "react";
import ProtectedRoute from "./ProtectedRoute.jsx";

const HomePage = lazy(() => import("../pages/HomePage.jsx"));
const AuthLayout = lazy(() => import("../layouts/AuthLayout.jsx"));
const DashboardLayout = lazy(() => import("../layouts/DashboardLayout.jsx"));
const LoginPage = lazy(() => import("../pages/auth/LoginPage.jsx"));
const RegisterPage = lazy(() => import("../pages/auth/RegisterPage.jsx"));

// Hustler pages
const OverviewPage = lazy(() => import("../pages/dashboard/OverviewPage.jsx"));
const ContractsPage = lazy(() => import("../pages/dashboard/ContractsPage.jsx"));
const BrowseContractsPage = lazy(() => import("../pages/dashboard/BrowseContractsPage.jsx"));
const MyApplicationsPage = lazy(() => import("../pages/dashboard/MyApplicationsPage.jsx"));
const ContractCreatePage = lazy(() => import("../pages/dashboard/ContractCreatePage.jsx"));
const ContractDetailsPage = lazy(() => import("../pages/dashboard/ContractDetailsPage.jsx"));
const ChatPage = lazy(() => import("../pages/dashboard/ChatPage.jsx"));
const HustlerTasksPage = lazy(() => import("../pages/dashboard/HustlerTasksPage.jsx"));
const WorkStatusPage = lazy(() => import("../pages/dashboard/WorkStatusPage.jsx"));
const StageDetailsPage = lazy(() => import("../pages/dashboard/StageDetailsPage.jsx"));
const MilestonesPage = lazy(() => import("../pages/dashboard/MilestonesPage.jsx"));
const MilestoneCreatePage = lazy(() => import("../pages/dashboard/MilestoneCreatePage.jsx"));
const MilestoneDetailsPage = lazy(() => import("../pages/dashboard/MilestoneDetailsPage.jsx"));
const WalletPage = lazy(() => import("../pages/dashboard/WalletPage.jsx"));
const ProfilePage = lazy(() => import("../pages/dashboard/ProfilePage.jsx"));

// Manager pages
const ManagerOverviewPage = lazy(() => import("../pages/manager/ManagerOverviewPage.jsx"));
const ManagerContractsPage = lazy(() => import("../pages/manager/ManagerContractsPage.jsx"));
const ApplicationsPage = lazy(() => import("../pages/manager/ApplicationsPage.jsx"));
const TaskApprovalsPage = lazy(() => import("../pages/manager/TaskApprovalsPage.jsx"));
const ManagerMilestonesPage = lazy(() => import("../pages/manager/ManagerMilestonesPage.jsx"));
const ManagerWalletPage = lazy(() => import("../pages/manager/ManagerWalletPage.jsx"));

// Admin pages
const AdminOverviewPage = lazy(() => import("../pages/admin/AdminOverviewPage.jsx"));
const AdminWalletPage = lazy(() => import("../pages/admin/AdminWalletPage.jsx"));
const AdminContractsPage = lazy(() => import("../pages/admin/AdminContractsPage.jsx"));
const AdminFeaturePage = lazy(() => import("../pages/admin/AdminFeaturePage.jsx"));

const NotFoundPage = lazy(() => import("../pages/NotFoundPage.jsx"));

export const publicRoutes = [
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
    ],
  },
];

export const protectedRoutes = [
  // Hustler routes
  {
    path: "/dashboard",
    element: <ProtectedRoute allowedRoles={["hustler"]} />,
    children: [
      {
        index: false,
        path: "",
        element: <DashboardLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "contracts", element: <ContractsPage /> },
          { path: "browse", element: <BrowseContractsPage /> },
          { path: "contracts/:contractId", element: <ContractDetailsPage /> },
          { path: "chat/:conversationId", element: <ChatPage /> },
          { path: "chat/:conversationId", element: <ChatPage /> },
          { path: "tasks", element: <HustlerTasksPage /> },
          { path: "tasks/:contractId", element: <WorkStatusPage /> },
          { path: "tasks/:contractId/:stageId", element: <StageDetailsPage /> },
          { path: "applications", element: <MyApplicationsPage /> },
          { path: "milestones", element: <MilestonesPage /> },
          { path: "milestones/new", element: <MilestoneCreatePage /> },
          { path: "milestones/:milestoneId", element: <MilestoneDetailsPage /> },
          { path: "wallet", element: <WalletPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
  // Manager routes
  {
    path: "/manager",
    element: <ProtectedRoute allowedRoles={["manager"]} />,
    children: [
      {
        index: false,
        path: "",
        element: <DashboardLayout />,
        children: [
          { index: true, element: <ManagerOverviewPage /> },
          { path: "contracts", element: <ManagerContractsPage /> },
          { path: "contracts/new", element: <ContractCreatePage /> },
          { path: "contracts/:contractId/edit", element: <ContractCreatePage /> },
          { path: "contracts/:contractId", element: <ContractDetailsPage /> },
          { path: "chat/:conversationId", element: <ChatPage /> },
          { path: "applications", element: <ApplicationsPage /> },
          { path: "approvals", element: <TaskApprovalsPage /> },
          { path: "milestones", element: <ManagerMilestonesPage /> },
          { path: "milestones/new", element: <MilestoneCreatePage /> },
          { path: "wallet", element: <ManagerWalletPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
  // Admin routes
  {
    path: "/admin",
    element: <ProtectedRoute allowedRoles={["admin"]} />,
    children: [
      {
        index: false,
        path: "",
        element: <DashboardLayout />,
        children: [
          { index: true, element: <AdminOverviewPage /> },
          { path: "wallet", element: <AdminWalletPage /> },
          { path: "contracts", element: <AdminContractsPage /> },
          { path: "contracts/:contractId", element: <ContractDetailsPage /> },
          { path: "chat/:conversationId", element: <ChatPage /> },
          { path: "users", element: <AdminFeaturePage feature="users" /> },
          { path: "disputes", element: <AdminFeaturePage feature="disputes" /> },
          { path: "reports", element: <AdminFeaturePage feature="reports" /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

