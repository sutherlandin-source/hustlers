import { lazy } from "react";
import ProtectedRoute from "./ProtectedRoute.jsx";

const HomePage = lazy(() => import("../pages/HomePage.jsx"));
const AuthLayout = lazy(() => import("../layouts/AuthLayout.jsx"));
const DashboardLayout = lazy(() => import("../layouts/DashboardLayout.jsx"));
const LoginPage = lazy(() => import("../pages/auth/LoginPage.jsx"));
const RegisterPage = lazy(() => import("../pages/auth/RegisterPage.jsx"));
const RoleChoicePage = lazy(() => import("../pages/auth/RoleChoicePage.jsx"));
const ForgotPasswordPage = lazy(() => import("../pages/auth/ForgotPasswordPage.jsx"));
const AppEntryPage = lazy(() => import("../pages/auth/AppEntryPage.jsx"));
const PublicSupportPage = lazy(() => import("../pages/auth/PublicSupportPage.jsx"));
const RestrictedPage = lazy(() => import("../pages/auth/RestrictedPage.jsx"));
const SupportPage = lazy(() => import("../pages/auth/SupportPage.jsx"));

// Hustler pages
const OverviewPage = lazy(() => import("../pages/dashboard/OverviewPage.jsx"));
const ContractsPage = lazy(() => import("../pages/dashboard/ContractsPage.jsx"));
const BrowseContractsPage = lazy(() => import("../pages/dashboard/BrowseContractsPage.jsx"));
const MyApplicationsPage = lazy(() => import("../pages/dashboard/MyApplicationsPage.jsx"));
const ContractCreatePage = lazy(() => import("../pages/dashboard/ContractCreatePage.jsx"));
const ContractDetailsPage = lazy(() => import("../pages/dashboard/ContractDetailsPage.jsx"));
const ChatPage = lazy(() => import("../pages/dashboard/ChatPage.jsx"));
const MessagesPage = lazy(() => import("../pages/dashboard/MessagesPage.jsx"));
const HustlerTasksPage = lazy(() => import("../pages/dashboard/HustlerTasksPage.jsx"));
const WorkStatusPage = lazy(() => import("../pages/dashboard/WorkStatusPage.jsx"));
const StageDetailsPage = lazy(() => import("../pages/dashboard/StageDetailsPage.jsx"));
const MilestonesPage = lazy(() => import("../pages/dashboard/MilestonesPage.jsx"));
const MilestoneCreatePage = lazy(() => import("../pages/dashboard/MilestoneCreatePage.jsx"));
const MilestoneDetailsPage = lazy(() => import("../pages/dashboard/MilestoneDetailsPage.jsx"));
const WalletPage = lazy(() => import("../pages/dashboard/WalletPage.jsx"));
const ProfilePage = lazy(() => import("../pages/dashboard/ProfilePage.jsx"));
const ReviewPage = lazy(() => import("../pages/dashboard/ReviewPage.jsx"));
const NotificationsPage = lazy(() => import("../pages/dashboard/NotificationsPage.jsx"));
const DisputeFormPage = lazy(() => import("../pages/disputes/DisputeFormPage.jsx"));
const DisputeDetailsPage = lazy(() => import("../pages/disputes/DisputeDetailsPage.jsx"));

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
const AdminUserProfilePage = lazy(() => import("../pages/admin/AdminUserProfilePage.jsx"));
const AdminDisputesPage = lazy(() => import("../pages/admin/AdminDisputesPage.jsx"));

const NotFoundPage = lazy(() => import("../pages/NotFoundPage.jsx"));

export const publicRoutes = [
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/support",
    element: <PublicSupportPage />,
  },
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "role-choice", element: <RoleChoicePage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
    ],
  },
];

export const protectedRoutes = [
  {
    path: "/app",
    element: <ProtectedRoute />,
    children: [
      { index: true, element: <AppEntryPage /> },
      { path: "restricted", element: <RestrictedPage /> },
      { path: "support", element: <SupportPage /> },
      { path: "support/:conversationId", element: <ChatPage /> },
    ],
  },
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
          { path: "messages", element: <MessagesPage /> },
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
          { path: "notifications", element: <NotificationsPage /> },
          { path: "reviews/:userId", element: <ReviewPage /> },
          { path: "contracts/:contractId/dispute", element: <DisputeFormPage /> },
          { path: "disputes/:disputeId", element: <DisputeDetailsPage /> },
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
          { path: "messages", element: <MessagesPage /> },
          { path: "chat/:conversationId", element: <ChatPage /> },
          { path: "applications", element: <ApplicationsPage /> },
          { path: "approvals", element: <TaskApprovalsPage /> },
          { path: "milestones", element: <ManagerMilestonesPage /> },
          { path: "milestones/new", element: <MilestoneCreatePage /> },
          { path: "wallet", element: <ManagerWalletPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "reviews/:userId", element: <ReviewPage /> },
          { path: "contracts/:contractId/dispute", element: <DisputeFormPage /> },
          { path: "disputes/:disputeId", element: <DisputeDetailsPage /> },
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
          { path: "wallet-payments", element: <AdminFeaturePage feature="wallet-payments" /> },
          { path: "contracts", element: <AdminContractsPage /> },
          { path: "applications", element: <AdminFeaturePage feature="applications" /> },
          { path: "contracts/:contractId", element: <ContractDetailsPage /> },
          { path: "chat/:conversationId", element: <ChatPage /> },
          { path: "messages", element: <AdminFeaturePage feature="messages" /> },
          { path: "verification", element: <AdminFeaturePage feature="verification" /> },
          { path: "users", element: <AdminFeaturePage feature="users" /> },
          { path: "users/:userId", element: <AdminUserProfilePage /> },
          { path: "settings", element: <AdminFeaturePage feature="settings" /> },
          { path: "disputes", element: <AdminDisputesPage /> },
          { path: "disputes/:disputeId", element: <DisputeDetailsPage /> },
          { path: "reports", element: <AdminFeaturePage feature="reports" /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "reviews/:userId", element: <ReviewPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

