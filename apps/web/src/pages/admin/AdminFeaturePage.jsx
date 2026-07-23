import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import ErrorBanner from "../../components/ErrorBanner.jsx";
import { contractsService } from "../../services/contractsService.js";
import ContractApplicationsService from "../../services/contractApplicationsService.js";
import { conversationsService } from "../../services/conversationsService.js";
import { transactionsService } from "../../services/transactionsService.js";
import { userService } from "../../services/userService.js";
import { notificationsService } from "../../services/notificationsService.js";
import { useDataStore } from "../../state/useDataStore.js";

function formatCurrency(amount, currency = "KSH") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount) || 0);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function formatName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "Unknown user";
}

function formatStatus(value) {
  return String(value || "unknown").replace(/_/g, " ");
}

function sectionTitle(feature) {
  const titles = {
    users: "Users",
    contracts: "Contracts",
    applications: "Applications",
    "wallet-payments": "Wallet & Payments",
    disputes: "Disputes",
    verification: "Verification",
    reports: "Reports & Analytics",
    messages: "Messages / Support",
    settings: "Settings",
  };
  return titles[feature] || "Admin";
}

function sectionDescription(feature) {
  const descriptions = {
    users: "Manage marketplace accounts and account states.",
    contracts: "Monitor all jobs moving through the platform.",
    applications: "Review contract applications by manager and hustler.",
    "wallet-payments": "Track escrow, deposits, payouts, withdrawals, and refunds.",
    disputes: "Handle contracts that need investigation or resolution.",
    verification: "Process pending identity and KYC verification requests.",
    reports: "Review growth, revenue, completion, and ratings data.",
    messages: "Keep support and announcements organized without exposing private chats.",
    settings: "Review security, profile, and platform activity logs.",
  };
  return descriptions[feature] || "Marketplace admin tools.";
}

function FeatureShell({ feature, children, action }) {
  return (
    <section className="page-section admin-page">
      <header className="page-header admin-header admin-feature-header">
        <div>
          <p className="eyebrow">Marketplace admin</p>
          <h2>{sectionTitle(feature)}</h2>
          <p>{sectionDescription(feature)}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function StatCard({ title, value, note, loading }) {
  return (
    <article className="admin-stat">
      <h3>{title}</h3>
      {loading ? <Loader /> : <p>{value}</p>}
      <span>{note}</span>
    </article>
  );
}

function StatusPill({ value }) {
  const status = String(value || "unknown").toLowerCase();
  return <span className={`status-pill status-${status}`}>{formatStatus(value)}</span>;
}

function AccountStatusPill({ user }) {
  const accountStatus = String(user?.accountStatus || (user?.isActive ? "active" : "suspended")).toLowerCase();
  return <span className={`status-pill status-${accountStatus}`}>{formatStatus(accountStatus)}</span>;
}

function RolePill({ value }) {
  const role = String(value || "user").toLowerCase();
  const label = role === "hustler" ? "Hustler" : role === "manager" ? "Manager" : role === "admin" ? "Admin" : role === "both" ? "Both" : role;
  return <span className={`status-pill admin-role-pill role-${role}`}>{label}</span>;
}

function VerificationPill({ user }) {
  const verificationStatus = String(user?.verificationStatus || (user?.isEmailVerified ? "verified" : "pending")).toLowerCase();
  const verified = verificationStatus === "verified";
  return <span className={`status-pill ${verified ? "status-active" : "status-pending"}`}>{verified ? "Verified" : "Pending review"}</span>;
}

function userRoleBucket(user) {
  const role = String(user?.role || "other").toLowerCase();
  if (["admin", "manager", "hustler", "both"].includes(role)) return role;
  return "other";
}

function verificationState(user) {
  return String(user?.verificationStatus || (user?.isEmailVerified ? "verified" : "pending")).toLowerCase();
}

function needsVerification(user) {
  return verificationState(user) === "pending";
}

export default function AdminFeaturePage({ feature }) {
  const [users, setUsers] = useState([]);
  const [userView, setUserView] = useState("all");
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [selectedUserLoading, setSelectedUserLoading] = useState(false);
  const [selectedUserModalOpen, setSelectedUserModalOpen] = useState(false);
  const [selectedUserAction, setSelectedUserAction] = useState("view");
  const [selectedUserError, setSelectedUserError] = useState("");
  const [selectedUserBusy, setSelectedUserBusy] = useState("");
  const [verificationQueueBusyId, setVerificationQueueBusyId] = useState("");
  const [suspensionReason, setSuspensionReason] = useState("");
  const [suspensionDurationDays, setSuspensionDurationDays] = useState("");
  const [contracts, setContracts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [applications, setApplications] = useState([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [error, setError] = useState("");
  const { wallet, fetchWallet } = useDataStore();

  const syncUserList = (updatedUser) => {
    if (!updatedUser) return;
    const updatedId = String(updatedUser._id || updatedUser.id);
    setUsers((current) =>
      current.map((user) => {
        const currentId = String(user._id || user.id);
        return currentId === updatedId ? { ...user, ...updatedUser } : user;
      })
    );
  };

  const openUserProfile = async (userInput, action = "view") => {
    const userId = typeof userInput === "object" ? (userInput?._id || userInput?.id) : userInput;
    const fallbackUser = typeof userInput === "object" ? userInput : null;
    setSelectedUserModalOpen(true);
    setSelectedUserAction(action);
    setSelectedUserError("");
    if (fallbackUser) {
      setSelectedUserProfile({
        user: fallbackUser,
        summary: {
          contracts: { total: Number(fallbackUser.completedContracts || 0), recent: [] },
          payments: { total: 0, failed: 0, recent: [] },
          reviews: { total: Number(fallbackUser.totalReviews || 0), distribution: {}, recent: [] },
          activity: [],
        },
      });
    } else {
      setSelectedUserProfile(null);
    }
    setSelectedUserLoading(true);
    try {
      const data = await userService.getAdminUserProfile(userId);
      setSelectedUserProfile(data);
      setSuspensionReason("");
      setSuspensionDurationDays("");
    } catch (err) {
      setSelectedUserError(err?.message || "Failed to load user profile.");
      setSelectedUserProfile(null);
    } finally {
      setSelectedUserLoading(false);
    }
  };

  const closeUserProfile = () => {
    setSelectedUserModalOpen(false);
    setSelectedUserProfile(null);
    setSelectedUserError("");
    setSelectedUserAction("view");
    setSuspensionReason("");
    setSuspensionDurationDays("");
    setSelectedUserBusy("");
  };

  const performUserUpdate = async (request, busyKey) => {
    if (!selectedUserProfile?.user?._id && !selectedUserProfile?.user?.id) return;
    setSelectedUserBusy(busyKey);
    setSelectedUserError("");
    try {
      const data = await request();
      if (data?.user) {
        setSelectedUserProfile(data);
        syncUserList(data.user);
      }
    } catch (err) {
      setSelectedUserError(err?.message || "Action failed.");
    } finally {
      setSelectedUserBusy("");
    }
  };

  const performVerificationQueueAction = async (user, actionKey, request) => {
    const userId = user?._id || user?.id;
    if (!userId) return;
    setVerificationQueueBusyId(`${actionKey}:${userId}`);
    setError("");
    try {
      const data = await request();
      if (data?.user) {
        syncUserList(data.user);
      }
    } catch (err) {
      setError(err?.message || "Action failed.");
    } finally {
      setVerificationQueueBusyId("");
    }
  };

  const verifySelectedUser = async () => {
    const userId = selectedUserProfile?.user?._id || selectedUserProfile?.user?.id;
    if (!userId) return;
    await performUserUpdate(() => userService.verifyUser(userId), "verify");
  };

  const approveVerificationQueueUser = async (user) => {
    await performVerificationQueueAction(user, "approve", () => userService.verifyUser(user._id || user.id));
  };

  const rejectVerificationQueueUser = async (user) => {
    const reason = typeof window !== "undefined" ? window.prompt("Reason for rejecting verification (optional):", "") : "";
    if (reason === null) return;
    await performVerificationQueueAction(user, "reject", () =>
      userService.rejectVerification(user._id || user.id, { reason: reason || "" })
    );
  };

  const requestMoreInfoQueueUser = async (user) => {
    const message = typeof window !== "undefined" ? window.prompt("What extra information should the user provide?", "") : "";
    if (message === null) return;
    await performVerificationQueueAction(user, "request-info", () =>
      userService.requestMoreVerificationInfo(user._id || user.id, {
        message: message || "Please provide the missing verification details.",
      })
    );
  };

  const suspendSelectedUser = async () => {
    const userId = selectedUserProfile?.user?._id || selectedUserProfile?.user?.id;
    if (!userId) return;
    await performUserUpdate(
      () =>
        userService.suspendUser(userId, {
          reason: suspensionReason,
          durationDays: suspensionDurationDays,
        }),
      "suspend"
    );
  };

  const deactivateSelectedUser = async () => {
    const userId = selectedUserProfile?.user?._id || selectedUserProfile?.user?.id;
    if (!userId) return;
    if (typeof window !== "undefined" && !window.confirm("Deactivate this account permanently?")) {
      return;
    }
    await performUserUpdate(() => userService.deactivateUser(userId), "deactivate");
  };

  const contractList = Array.isArray(contracts) ? contracts : [];
  const userList = Array.isArray(users) ? users : [];
  const transactionList = Array.isArray(transactions) ? transactions : [];
  const notificationList = Array.isArray(notifications) ? notifications : [];
  const supportTicketList = Array.isArray(supportTickets) ? supportTickets : [];
  const applicationList = Array.isArray(applications) ? applications : [];

  useEffect(() => {
    let mounted = true;

    const loadUsers = async () => {
      setUsersLoading(true);
      try {
        const data = await userService.listUsers({ limit: 200 });
        if (mounted) setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load users.");
      } finally {
        if (mounted) setUsersLoading(false);
      }
    };

    if (["users", "verification", "reports", "settings"].includes(feature)) {
      loadUsers();
    }

    return () => {
      mounted = false;
    };
  }, [feature]);

  useEffect(() => {
    let mounted = true;

    const loadContracts = async () => {
      setContractsLoading(true);
      try {
        const data = await contractsService.list({ limit: 150 });
        if (mounted) setContracts(Array.isArray(data) ? data : []);
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load contracts.");
      } finally {
        if (mounted) setContractsLoading(false);
      }
    };

    if (["contracts", "applications", "disputes", "reports", "settings"].includes(feature)) {
      loadContracts();
    }

    return () => {
      mounted = false;
    };
  }, [feature]);

  useEffect(() => {
    let mounted = true;

    const loadTransactions = async () => {
      setTransactionsLoading(true);
      try {
        const data = await transactionsService.list({ limit: 150 });
        if (mounted) setTransactions(Array.isArray(data) ? data : []);
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load transactions.");
      } finally {
        if (mounted) setTransactionsLoading(false);
      }
    };

    if (["wallet-payments", "reports", "settings"].includes(feature)) {
      loadTransactions();
      setWalletLoading(true);
      fetchWallet()
        .catch((err) => {
          if (mounted) setError(err?.message || "Failed to load wallet.");
        })
        .finally(() => {
          if (mounted) setWalletLoading(false);
        });
    }

    return () => {
      mounted = false;
    };
  }, [feature, fetchWallet]);

  useEffect(() => {
    let mounted = true;

    const loadSupportInbox = async () => {
      setNotificationsLoading(true);
      try {
        const [data, conversations] = await Promise.all([
          notificationsService.list({ limit: 50 }),
          conversationsService.list(),
        ]);
        if (!mounted) return;
        setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
        setSupportTickets(
          (Array.isArray(conversations) ? conversations : []).filter((conversation) => {
            const metadata = conversation?.metadata || {};
            const participants = Array.isArray(conversation?.participants) ? conversation.participants : [];
            return Boolean(metadata.supportTicket) || (!conversation?.contractId && participants.length > 1);
          })
        );
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load notifications.");
      } finally {
        if (mounted) setNotificationsLoading(false);
      }
    };

    if (feature === "messages") {
      loadSupportInbox();
    }

    return () => {
      mounted = false;
    };
  }, [feature]);

  useEffect(() => {
    let mounted = true;

    const loadApplications = async () => {
      setApplicationsLoading(true);
      try {
        const contractRecords = await contractsService.list({ limit: 24 });
        const recentContracts = Array.isArray(contractRecords) ? contractRecords.slice(0, 12) : [];
        const appGroups = await Promise.all(
          recentContracts.map(async (contract) => {
            try {
              const response = await ContractApplicationsService.getContractApplications(contract._id || contract.id);
              const records = Array.isArray(response?.data) ? response.data : [];
              return records.map((application) => ({ ...application, contract }));
            } catch {
              return [];
            }
          })
        );
        if (mounted) setApplications(appGroups.flat());
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load applications.");
      } finally {
        if (mounted) setApplicationsLoading(false);
      }
    };

    if (feature === "applications") {
      loadApplications();
    }

    return () => {
      mounted = false;
    };
  }, [feature]);

  const userCounts = useMemo(() => {
    const totalUsers = userList.length;
    const hustlers = userList.filter((user) => String(user.role).toLowerCase() === "hustler").length;
    const managers = userList.filter((user) => String(user.role).toLowerCase() === "manager").length;
    const pendingVerification = userList.filter((user) => needsVerification(user)).length;
    const suspended = userList.filter((user) => !user.isActive).length;
    return { totalUsers, hustlers, managers, pendingVerification, suspended };
  }, [userList]);

  const contractCounts = useMemo(() => {
    const total = contractList.length;
    const active = contractList.filter((contract) => ["pending", "assigned", "active", "in_progress"].includes(String(contract.status).toLowerCase())).length;
    const completed = contractList.filter((contract) => String(contract.status).toLowerCase() === "completed").length;
    const cancelled = contractList.filter((contract) => String(contract.status).toLowerCase() === "cancelled").length;
    const disputed = contractList.filter((contract) => String(contract.status).toLowerCase() === "disputed").length;
    return { total, active, completed, cancelled, disputed };
  }, [contractList]);

  const paymentMetrics = useMemo(() => {
    const totals = transactionList.reduce(
      (accumulator, transaction) => {
        const type = String(transaction.type || "").toLowerCase();
        const status = String(transaction.status || "").toLowerCase();
        const amount = Number(transaction.amount) || 0;
        if (type === "deposit") accumulator.deposits += amount;
        if (type === "withdrawal") accumulator.withdrawals += amount;
        if (type === "refund") accumulator.refunds += amount;
        if (["release", "released", "payout", "payment"].includes(type)) accumulator.paymentsReleased += amount;
        if (status === "failed") accumulator.failedCount += 1;
        if (type === "escrow" || type === "hold") accumulator.escrowBalance += amount;
        return accumulator;
      },
      { escrowBalance: 0, deposits: 0, paymentsReleased: 0, withdrawals: 0, refunds: 0, failedCount: 0 }
    );

    return totals;
  }, [transactionList]);

  const ratingStats = useMemo(() => {
    const values = userList.map((user) => Number(user.averageRating) || 0).filter((value) => value > 0);
    const averageRating = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const fiveStar = userList.filter((user) => (Number(user.averageRating) || 0) >= 4.5).length;
    return { averageRating, fiveStar };
  }, [userList]);

  const loadingAny =
    usersLoading ||
    contractsLoading ||
    transactionsLoading ||
    notificationsLoading ||
    applicationsLoading ||
    walletLoading;

  const cardsLoading = {
    users: usersLoading,
    contracts: contractsLoading,
    applications: applicationsLoading,
    "wallet-payments": walletLoading || transactionsLoading,
    disputes: contractsLoading,
    verification: usersLoading,
    reports: usersLoading || contractsLoading || transactionsLoading,
    messages: notificationsLoading,
    settings: usersLoading || transactionsLoading,
  };

  const adminAction = (
    <Link to="/admin/profile" className="button-primary">
      Admin Profile
    </Link>
  );

  if (feature === "users") {
    const userFilters = [
      { key: "all", label: "All users", count: userList.length },
      { key: "admin", label: "Admins", count: userList.filter((user) => userRoleBucket(user) === "admin").length },
      { key: "manager", label: "Managers", count: userList.filter((user) => userRoleBucket(user) === "manager").length },
      { key: "hustler", label: "Hustlers", count: userList.filter((user) => userRoleBucket(user) === "hustler").length },
      { key: "both", label: "Both", count: userList.filter((user) => userRoleBucket(user) === "both").length },
      { key: "other", label: "Other", count: userList.filter((user) => userRoleBucket(user) === "other").length },
      { key: "pending", label: "Pending verification", count: userList.filter((user) => needsVerification(user)).length },
      { key: "suspended", label: "Suspended", count: userList.filter((user) => !user.isActive).length },
    ];

    const visibleUsers =
      userView === "pending"
        ? userList.filter((user) => needsVerification(user))
        : userView === "suspended"
          ? userList.filter((user) => !user.isActive)
          : userView === "other"
            ? userList.filter((user) => userRoleBucket(user) === "other")
            : userView === "all"
              ? userList
              : userList.filter((user) => userRoleBucket(user) === userView);

    return (
      <FeatureShell feature={feature} action={adminAction}>
        {error && <ErrorBanner error={error} />}
        <div className="admin-summary-grid admin-summary-grid-wide">
          <StatCard title="Total users" value={userCounts.totalUsers.toLocaleString()} note="Registered accounts" loading={cardsLoading.users} />
          <StatCard title="Hustlers" value={userCounts.hustlers.toLocaleString()} note="Marketplace workers" loading={cardsLoading.users} />
          <StatCard title="Managers" value={userCounts.managers.toLocaleString()} note="Job posters" loading={cardsLoading.users} />
          <StatCard title="Pending verification" value={userCounts.pendingVerification.toLocaleString()} note="Need KYC review" loading={cardsLoading.users} />
          <StatCard title="Suspended" value={userCounts.suspended.toLocaleString()} note="Account restricted" loading={cardsLoading.users} />
        </div>

        <div className="admin-panel admin-user-panel">
          <div className="admin-panel-header">
            <div className="admin-panel-heading">
              <h3>User directory</h3>
              <p>{visibleUsers.length} record{visibleUsers.length === 1 ? "" : "s"} shown</p>
            </div>
            <span className="admin-panel-chip">Full directory</span>
          </div>

          <div className="admin-user-filter-row">
            {userFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`admin-user-filter-chip ${userView === filter.key ? "active" : ""}`}
                onClick={() => setUserView(filter.key)}
              >
                <span>{filter.label}</span>
                <strong>{filter.count}</strong>
              </button>
            ))}
          </div>

          {visibleUsers.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table admin-table-compact">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Contact</th>
                    <th>Verification</th>
                    <th>Rating</th>
                    <th>Completed jobs</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user._id || user.id}>
                      <td className="admin-user-cell">
                        <strong>{formatName(user)}</strong>
                        <span>{user.location || "No location"}</span>
                      </td>
                      <td><RolePill value={user.role} /></td>
                      <td className="admin-contact-cell">
                        <span>{user.email || "-"}</span>
                        <span>{user.phoneNumber || "-"}</span>
                      </td>
                      <td><VerificationPill user={user} /></td>
                      <td><strong>{Number(user.averageRating || 0).toFixed(1)}</strong></td>
                      <td><strong>{Number(user.completedContracts || 0).toLocaleString()}</strong></td>
                      <td><AccountStatusPill user={user} /></td>
                      <td>
                        <div className="admin-row-actions">
                          <button type="button" className="button-secondary" onClick={() => openUserProfile(user, "view")}>
                            View profile
                          </button>
                          <button type="button" className="button-secondary" onClick={() => openUserProfile(user, "verify")}>
                            Verify user
                          </button>
                          <button type="button" className="button-secondary" onClick={() => openUserProfile(user, "suspend")}>
                            Suspend user
                          </button>
                          <button type="button" className="button-secondary" onClick={() => openUserProfile(user, "deactivate")}>
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">
              <h4>No users match this filter</h4>
              <p>Try switching back to all users or another role group.</p>
            </div>
          )}
        </div>

        {selectedUserModalOpen && (
          <div className="modal-overlay" onClick={closeUserProfile}>
            <div className="modal-content large admin-user-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2>{formatName(selectedUserProfile.user)}</h2>
                  <p>Read-only profile view with admin actions.</p>
                </div>
                <button type="button" className="modal-close" onClick={closeUserProfile}>
                  Close
                </button>
              </div>

              {selectedUserLoading ? (
                <Loader label="Loading profile..." />
              ) : selectedUserError ? (
                <ErrorBanner error={selectedUserError} />
              ) : (
                <div className="admin-user-modal-grid">
                  <aside className="admin-user-modal-summary">
                    <div className="profile-header-card">
                      <div>
                        <strong>{formatName(selectedUserProfile?.user)}</strong>
                        <p>{selectedUserProfile?.user?.location || "No location"}</p>
                      </div>
                    </div>

                    <div className="admin-user-modal-badges">
                      <VerificationPill user={selectedUserProfile?.user} />
                      <AccountStatusPill user={selectedUserProfile?.user} />
                      <RolePill value={selectedUserProfile?.user?.role} />
                    </div>

                    <div className="admin-user-modal-stats">
                      <div><span>Rating</span><strong>{Number(selectedUserProfile?.user?.averageRating || 0).toFixed(1)}</strong></div>
                      <div><span>Contracts</span><strong>{Number(selectedUserProfile?.summary?.contracts?.total || selectedUserProfile?.user?.completedContracts || 0).toLocaleString()}</strong></div>
                      <div><span>Payments</span><strong>{formatCurrency(selectedUserProfile?.summary?.payments?.total || 0, selectedUserProfile?.user?.wallet?.currency || "KSH")}</strong></div>
                      <div><span>Reviews</span><strong>{Number(selectedUserProfile?.summary?.reviews?.total || selectedUserProfile?.user?.totalReviews || 0).toLocaleString()}</strong></div>
                    </div>

                    <div className="admin-user-modal-info">
                      <div className="detail-item"><label>Email</label><p>{selectedUserProfile?.user?.email || "-"}</p></div>
                      <div className="detail-item"><label>Phone</label><p>{selectedUserProfile?.user?.phoneNumber || "-"}</p></div>
                      <div className="detail-item"><label>ID / Passport</label><p>{selectedUserProfile?.user?.idNumber || "-"}</p></div>
                      <div className="detail-item"><label>M-Pesa</label><p>{selectedUserProfile?.user?.mpesaNumber || "-"}</p></div>
                      <div className="detail-item"><label>Skills</label><p>{Array.isArray(selectedUserProfile?.user?.skills) ? selectedUserProfile.user.skills.join(", ") : selectedUserProfile?.user?.skills || "-"}</p></div>
                      <div className="detail-item"><label>Bio</label><p>{selectedUserProfile?.user?.bio || "-"}</p></div>
                      {String(selectedUserProfile?.user?.accountStatus || "").toLowerCase() === "suspended" && (
                        <div className="detail-item"><label>Suspension reason</label><p>{selectedUserProfile?.user?.suspensionReason || "No reason recorded"}</p></div>
                      )}
                    </div>
                  </aside>

                  <section className="admin-user-modal-sections">
                    <article className="admin-panel">
                      <div className="admin-panel-header">
                        <div>
                          <h3>Contracts</h3>
                          <p>Recent contracts involving this user.</p>
                        </div>
                      </div>
                      {selectedUserProfile?.summary?.contracts?.total ? (
                        <div className="admin-activity-list">
                          {selectedUserProfile?.summary?.contracts?.recent?.slice(0, 5).map((contract) => (
                            <div key={contract._id || contract.id} className="admin-activity-item">
                              <div>
                                <strong>{contract.title || "Untitled contract"}</strong>
                                <span>{contract.status || "unknown"} - {formatCurrency(contract.amount, contract.currency)}</span>
                              </div>
                              <small>{formatDate(contract.createdAt)}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="admin-empty-state">
                          <h4>No contracts yet</h4>
                          <p>No related contract records were found.</p>
                        </div>
                      )}
                    </article>

                    <article className="admin-panel">
                      <div className="admin-panel-header">
                        <div>
                          <h3>Payments</h3>
                          <p>Recent wallet and escrow transactions.</p>
                        </div>
                      </div>
                      {selectedUserProfile?.summary?.payments?.recent?.length ? (
                        <div className="admin-activity-list">
                          {selectedUserProfile?.summary?.payments?.recent?.slice(0, 5).map((transaction) => (
                            <div key={transaction._id || transaction.id} className="admin-activity-item">
                              <div>
                                <strong>{transaction.description || formatStatus(transaction.type)}</strong>
                                <span>{formatCurrency(transaction.amount, transaction.currency || selectedUserProfile.user.wallet?.currency || "KSH")}</span>
                              </div>
                              <small>{formatDate(transaction.createdAt)}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="admin-empty-state">
                          <h4>No payments yet</h4>
                          <p>No related payment records were found.</p>
                        </div>
                      )}
                    </article>

                    <article className="admin-panel">
                      <div className="admin-panel-header">
                        <div>
                          <h3>Activity</h3>
                          <p>Admin audit trail for this user.</p>
                        </div>
                      </div>
                      {selectedUserProfile?.summary?.activity?.length ? (
                        <div className="admin-activity-list">
                          {selectedUserProfile?.summary?.activity?.slice(0, 5).map((activity) => (
                            <div key={activity._id || activity.id} className="admin-activity-item">
                              <div>
                                <strong>{activity.metadata?.adminAction || activity.action || "activity"}</strong>
                                <span>{activity.metadata?.reason || activity.metadata?.durationDays ? `${activity.metadata.reason || ""}${activity.metadata.durationDays ? ` • ${activity.metadata.durationDays} days` : ""}` : "Admin action recorded"}</span>
                              </div>
                              <small>{formatDate(activity.createdAt)}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="admin-empty-state">
                          <h4>No activity recorded</h4>
                          <p>Admin actions will appear here once they are taken.</p>
                        </div>
                      )}
                    </article>

                    <article className="admin-panel">
                      <div className="admin-panel-header">
                        <div>
                          <h3>Reviews</h3>
                          <p>Recent feedback for this user.</p>
                        </div>
                      </div>
                      {selectedUserProfile?.summary?.reviews?.recent?.length ? (
                        <div className="profile-review-list">
                          {selectedUserProfile?.summary?.reviews?.recent?.slice(0, 5).map((review) => (
                            <article key={review._id || review.id} className="profile-review-card">
                              <div className="profile-review-meta">
                                <strong>{formatName(review.reviewer)}</strong>
                                <span>{Number(review.rating || 0).toFixed(1)}</span>
                              </div>
                              {review.reviewText && <p>{review.reviewText}</p>}
                              <small>{formatDate(review.createdAt)}</small>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="admin-empty-state">
                          <h4>No reviews yet</h4>
                          <p>No review history was found for this user.</p>
                        </div>
                      )}
                    </article>
                  </section>

                  <aside className="admin-user-modal-actions">
                    <div className="admin-panel">
                      <div className="admin-panel-header">
                        <div>
                          <h3>Admin actions</h3>
                          <p>{selectedUserAction === "verify" ? "Verification workflow selected." : selectedUserAction === "suspend" ? "Suspension workflow selected." : selectedUserAction === "deactivate" ? "Deactivation workflow selected." : "Manage the user account."}</p>
                        </div>
                      </div>

                      <button type="button" className="button-primary" onClick={verifySelectedUser} disabled={selectedUserBusy === "verify"}>
                        {selectedUserBusy === "verify" ? "Verifying..." : "Verify user"}
                      </button>

                      <div className="admin-suspend-form">
                        <label className="form-label">
                          <span>Suspension reason *</span>
                          <textarea value={suspensionReason} onChange={(event) => setSuspensionReason(event.target.value)} rows={4} placeholder="Explain the policy issue, evidence, and any steps required to resolve it" />
                        </label>
                        <label className="form-label">
                          <span>Duration days</span>
                          <input value={suspensionDurationDays} onChange={(event) => setSuspensionDurationDays(event.target.value)} type="number" min="0" placeholder="Optional" />
                        </label>
                        <p style={{ margin: "0 0 8px", color: "#6b7280", fontSize: "0.95rem" }}>The user will see this reason on the restricted access page and in their appeal thread.</p>
                        <button type="button" className="button-secondary" onClick={suspendSelectedUser} disabled={selectedUserBusy === "suspend" || !suspensionReason.trim()}>
                          {selectedUserBusy === "suspend" ? "Suspending..." : "Suspend user"}
                        </button>
                      </div>

                      <button type="button" className="button-secondary" onClick={deactivateSelectedUser} disabled={selectedUserBusy === "deactivate"}>
                        {selectedUserBusy === "deactivate" ? "Deactivating..." : "Deactivate user"}
                      </button>
                    </div>
                  </aside>
                </div>
              )}
            </div>
          </div>
        )}
      </FeatureShell>
    );
  }

  if (feature === "contracts") {
    const sections = [
      ["Active contracts", contractList.filter((contract) => ["pending", "assigned", "active", "in_progress"].includes(String(contract.status).toLowerCase()))],
      ["Completed contracts", contractList.filter((contract) => String(contract.status).toLowerCase() === "completed")],
      ["Cancelled contracts", contractList.filter((contract) => String(contract.status).toLowerCase() === "cancelled")],
      ["Disputed contracts", contractList.filter((contract) => String(contract.status).toLowerCase() === "disputed")],
    ];

    return (
      <FeatureShell feature={feature} action={<Link to="/admin/contracts" className="button-primary">Open contract monitor</Link>}>
        {error && <ErrorBanner error={error} />}
        <div className="admin-summary-grid admin-summary-grid-wide">
          <StatCard title="Active contracts" value={contractCounts.active.toLocaleString()} note="Ongoing jobs" loading={cardsLoading.contracts} />
          <StatCard title="Completed contracts" value={contractCounts.completed.toLocaleString()} note="Finished jobs" loading={cardsLoading.contracts} />
          <StatCard title="Cancelled contracts" value={contractCounts.cancelled.toLocaleString()} note="Terminated jobs" loading={cardsLoading.contracts} />
          <StatCard title="Disputed contracts" value={contractCounts.disputed.toLocaleString()} note="Needs review" loading={cardsLoading.contracts} />
        </div>
        <div className="admin-panel-grid">
          {sections.map(([title, list]) => (
            <article key={title} className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h3>{title}</h3>
                  <p>{list.length} record{list.length === 1 ? "" : "s"}</p>
                </div>
              </div>
              {list.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table admin-table-compact">
                    <thead>
                      <tr>
                        <th>Contract</th>
                        <th>Manager</th>
                        <th>Hustler</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.slice(0, 12).map((contract) => (
                        <tr key={contract._id || contract.id}>
                          <td>
                            <strong>{contract.title || "Untitled contract"}</strong>
                            <span>{contract.jobCategory || contract.contractType || "General"}</span>
                          </td>
                          <td>{formatName(contract.buyer)}</td>
                          <td>{formatName(contract.seller)}</td>
                          <td>{formatCurrency(contract.amount, contract.currency)}</td>
                          <td><StatusPill value={contract.status} /></td>
                          <td>{formatDate(contract.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-empty-state">
                  <h4>No contracts here</h4>
                  <p>Contracts matching this state will appear here.</p>
                </div>
              )}
            </article>
          ))}
        </div>
      </FeatureShell>
    );
  }

  if (feature === "applications") {
    return (
      <FeatureShell feature={feature} action={<Link to="/admin/contracts" className="button-secondary">Review contracts</Link>}>
        {error && <ErrorBanner error={error} />}
        <div className="admin-summary-grid admin-summary-grid-wide">
          <StatCard title="Contracts checked" value={contractList.length.toLocaleString()} note="Loaded from marketplace" loading={cardsLoading.applications} />
          <StatCard title="Application rows" value={applicationList.length.toLocaleString()} note="Recent contract applications" loading={applicationsLoading} />
          <StatCard title="Accepted applicants" value={applicationList.filter((app) => String(app.status).toLowerCase() === "accepted").length.toLocaleString()} note="Approved by managers" loading={applicationsLoading} />
          <StatCard title="Pending applications" value={applicationList.filter((app) => String(app.status).toLowerCase() === "pending").length.toLocaleString()} note="Awaiting review" loading={applicationsLoading} />
        </div>

        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3>Applications by contract</h3>
              <p>Monitoring applicant activity using existing contract application records.</p>
            </div>
          </div>
          {applicationsLoading ? (
            <Loader label="Loading applications..." />
          ) : applicationList.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table admin-table-compact">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Manager</th>
                    <th>Applicants</th>
                    <th>Accepted applicant</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(
                    applicationList.reduce((map, application) => {
                      const contractKey =
                        application.contract?._id ||
                        application.contractId?._id ||
                        application.contractId ||
                        application.contract?.id ||
                        application._id;
                      if (!map.has(contractKey)) {
                        map.set(contractKey, { contract: application.contract, applications: [] });
                      }
                      map.get(contractKey).applications.push(application);
                      return map;
                    }, new Map())
                  )
                    .map(([contractId, group]) => ({
                      contractId,
                      contract: group.contract,
                      applications: group.applications,
                    }))
                    .sort((left, right) => right.applications.length - left.applications.length)
                    .map((group) => {
                      const accepted = group.applications.find((application) => String(application.status).toLowerCase() === "accepted");
                      const pending = group.applications.filter((application) => String(application.status).toLowerCase() === "pending");
                      return (
                        <tr key={group.contractId}>
                          <td>
                            <strong>{group.contract?.title || "Untitled contract"}</strong>
                            <span>{group.contract?.jobCategory || group.contract?.contractType || "General"}</span>
                          </td>
                          <td>{formatName(group.contract?.buyer)}</td>
                          <td>{group.applications.length}</td>
                          <td>{accepted ? formatName(accepted.hustlerId) : "None yet"}</td>
                          <td>
                            <div className="table-status-stack">
                              <StatusPill value={accepted ? "accepted" : pending.length ? "pending" : "reviewed"} />
                              <small>{pending.length} pending</small>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">
              <h4>No application data loaded</h4>
              <p>Application records will appear once existing contract data is available.</p>
            </div>
          )}
        </article>
      </FeatureShell>
    );
  }

  if (feature === "wallet-payments") {
    return (
      <FeatureShell feature={feature} action={<Link to="/admin/wallet" className="button-primary">Open wallet</Link>}>
        {error && <ErrorBanner error={error} />}
        <div className="admin-summary-grid admin-summary-grid-wide">
          <StatCard title="Escrow balance" value={formatCurrency(wallet?.platformWallet?.availableBalance, wallet?.platformWallet?.currency || wallet?.currency || "KSH")} note="Platform funds ready" loading={walletLoading} />
          <StatCard title="Deposits" value={formatCurrency(paymentMetrics.deposits, wallet?.currency || "KSH")} note="Loaded transactions" loading={transactionsLoading} />
          <StatCard title="Payments released" value={formatCurrency(paymentMetrics.paymentsReleased, wallet?.currency || "KSH")} note="Released to hustlers" loading={transactionsLoading} />
          <StatCard title="Withdrawals" value={formatCurrency(paymentMetrics.withdrawals, wallet?.currency || "KSH")} note="User withdrawals" loading={transactionsLoading} />
          <StatCard title="Refunds" value={formatCurrency(paymentMetrics.refunds, wallet?.currency || "KSH")} note="Returned funds" loading={transactionsLoading} />
          <StatCard title="Failed transactions" value={paymentMetrics.failedCount.toLocaleString()} note="Records needing review" loading={transactionsLoading} />
        </div>

        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3>Payment history</h3>
              <p>Escrow, deposits, payouts, withdrawals, and refunds.</p>
            </div>
          </div>
          {transactionsLoading ? (
            <Loader label="Loading payments..." />
          ) : transactionList.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table admin-table-compact">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Contract</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionList.slice(0, 15).map((transaction) => (
                    <tr key={transaction._id || transaction.id}>
                      <td>{formatStatus(transaction.type)}</td>
                      <td>{transaction.description || "-"}</td>
                      <td>{transaction.contract?.title || "-"}</td>
                      <td>{formatCurrency(transaction.amount, transaction.currency || wallet?.currency || "KSH")}</td>
                      <td>{transaction.status || "-"}</td>
                      <td>{formatDate(transaction.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">
              <h4>No payment data yet</h4>
              <p>Payment records will appear after contracts move through escrow and settlement.</p>
            </div>
          )}
        </article>
      </FeatureShell>
    );
  }

  if (feature === "disputes") {
    const disputed = contractList.filter((contract) => String(contract.status).toLowerCase() === "disputed");
    return (
      <FeatureShell feature={feature} action={<Link to="/admin/contracts" className="button-secondary">Open contracts</Link>}>
        {error && <ErrorBanner error={error} />}
        <div className="admin-summary-grid admin-summary-grid-wide">
          <StatCard title="Pending disputes" value={disputed.length.toLocaleString()} note="Need review" loading={contractsLoading} />
          <StatCard title="Contracts monitored" value={contractList.length.toLocaleString()} note="Total loaded contracts" loading={contractsLoading} />
        </div>
        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3>Dispute queue</h3>
              <p>Review contracts marked as disputed and resolve the issue.</p>
            </div>
          </div>
          {contractsLoading ? (
            <Loader label="Loading disputes..." />
          ) : disputed.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table admin-table-compact">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Users involved</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {disputed.slice(0, 12).map((contract) => (
                    <tr key={contract._id || contract.id}>
                      <td>
                        <strong>{contract.title || "Untitled contract"}</strong>
                        <span>{contract.jobCategory || contract.contractType || "General"}</span>
                      </td>
                      <td>
                        <span>{formatName(contract.buyer)}</span>
                        <span>{formatName(contract.seller)}</span>
                      </td>
                      <td>{formatCurrency(contract.amount, contract.currency)}</td>
                      <td>{contract.disputeReason || contract.metadata?.disputeReason || "Awaiting review"}</td>
                      <td><StatusPill value={contract.status} /></td>
                      <td>
                        <div className="admin-row-actions">
                          <button type="button" className="button-secondary" disabled title="Backend action not exposed">Review dispute</button>
                          <button type="button" className="button-secondary" disabled title="Backend action not exposed">Resolve dispute</button>
                          <button type="button" className="button-secondary" disabled title="Backend action not exposed">Release payment</button>
                          <button type="button" className="button-secondary" disabled title="Backend action not exposed">Refund user</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">
              <h4>No disputed contracts</h4>
              <p>Disputed contracts will appear here when they are flagged on the platform.</p>
            </div>
          )}
        </article>
      </FeatureShell>
    );
  }

  if (feature === "verification") {
    const pending = userList.filter((user) => needsVerification(user));
    const verified = userList.filter((user) => verificationState(user) === "verified" && user.idNumber && user.mpesaNumber);
    return (
      <FeatureShell feature={feature} action={<Link to="/admin/users" className="button-secondary">Open users</Link>}>
        {error && <ErrorBanner error={error} />}
        <div className="admin-summary-grid admin-summary-grid-wide">
          <StatCard title="Pending verification" value={pending.length.toLocaleString()} note="Needs KYC review" loading={usersLoading} />
          <StatCard title="Verified users" value={verified.length.toLocaleString()} note="Identity complete" loading={usersLoading} />
        </div>
        <article className="admin-panel">
          <div className="admin-panel-header">
            <div>
              <h3>Verification queue</h3>
              <p>Pending verification requests and submitted identity details.</p>
            </div>
          </div>
          {usersLoading ? (
            <Loader label="Loading verification queue..." />
          ) : pending.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table admin-table-compact">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Submitted docs</th>
                    <th>Verification status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.slice(0, 15).map((user) => (
                    <tr key={user._id || user.id}>
                      <td>
                        <strong>{formatName(user)}</strong>
                        <span>{user.email}</span>
                        <span>{user.phoneNumber || "-"}</span>
                      </td>
                      <td>
                        <span>National ID: {user.idNumber || "Missing"}</span>
                        <span>Mpesa: {user.mpesaNumber || "Missing"}</span>
                      </td>
                      <td>{String(user.verificationStatus || (user.isEmailVerified ? "verified" : "pending")).replace(/_/g, " ")}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => approveVerificationQueueUser(user)}
                            disabled={verificationQueueBusyId === `approve:${user._id || user.id}`}
                          >
                            {verificationQueueBusyId === `approve:${user._id || user.id}` ? "Approving..." : "Approve"}
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => rejectVerificationQueueUser(user)}
                            disabled={verificationQueueBusyId === `reject:${user._id || user.id}`}
                          >
                            {verificationQueueBusyId === `reject:${user._id || user.id}` ? "Rejecting..." : "Reject"}
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => requestMoreInfoQueueUser(user)}
                            disabled={verificationQueueBusyId === `request-info:${user._id || user.id}`}
                          >
                            {verificationQueueBusyId === `request-info:${user._id || user.id}` ? "Sending..." : "Request more info"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">
              <h4>No pending verification requests</h4>
              <p>Verified users will continue to appear in the overall user list.</p>
            </div>
          )}
        </article>
      </FeatureShell>
    );
  }

  if (feature === "reports") {
    const completionRate = contractCounts.total ? Math.round((contractCounts.completed / contractCounts.total) * 100) : 0;
    const averageRating = ratingStats.averageRating;
    const revenue = transactionList.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0);
    const topRatings = [5, 4, 3, 2, 1].map((score) => ({
      score,
      value: userList.filter((user) => Math.round(Number(user.averageRating) || 0) === score).length,
    }));
    return (
      <FeatureShell feature={feature} action={<Link to="/admin/wallet-payments" className="button-primary">View revenue</Link>}>
        {error && <ErrorBanner error={error} />}
        <div className="admin-summary-grid admin-summary-grid-wide">
          <StatCard title="User growth" value={userList.length.toLocaleString()} note="Loaded marketplace users" loading={loadingAny} />
          <StatCard title="Contract activity" value={contractList.length.toLocaleString()} note="Loaded contracts" loading={loadingAny} />
          <StatCard title="Revenue / commission" value={formatCurrency(revenue, wallet?.currency || "KSH")} note="Loaded transaction volume" loading={transactionsLoading} />
          <StatCard title="Completion rate" value={`${completionRate}%`} note="Completed contracts / total contracts" loading={contractsLoading} />
          <StatCard title="Average rating" value={averageRating ? averageRating.toFixed(1) : "0.0"} note="Across user profiles" loading={usersLoading} />
          <StatCard title="5-star users" value={ratingStats.fiveStar.toLocaleString()} note="Rated 4.5 and above" loading={usersLoading} />
        </div>
        <div className="admin-panel-grid">
          <article className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <h3>User growth</h3>
                <p>Current user counts by role.</p>
              </div>
            </div>
            <div className="mini-bar-list">
              {[
                { label: "Users", value: userCounts.totalUsers, display: userCounts.totalUsers.toLocaleString() },
                { label: "Hustlers", value: userCounts.hustlers, display: userCounts.hustlers.toLocaleString() },
                { label: "Managers", value: userCounts.managers, display: userCounts.managers.toLocaleString() },
              ].map((item) => (
                <div className="mini-bar-row" key={item.label}>
                  <span>{item.label}</span>
                  <div><i style={{ width: `${Math.max(10, (item.value / Math.max(userCounts.totalUsers, 1)) * 100)}%` }} /></div>
                  <strong>{item.display}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <h3>Ratings statistics</h3>
                <p>Distribution of average user ratings.</p>
              </div>
            </div>
            <div className="mini-bar-list">
              {topRatings.map((row) => (
                <div className="mini-bar-row" key={row.score}>
                  <span>{row.score} stars</span>
                  <div><i style={{ width: `${Math.max(8, (row.value / Math.max(userList.length, 1)) * 100)}%` }} /></div>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      </FeatureShell>
    );
  }

  if (feature === "messages") {
    const systemAnnouncements = notificationList.filter((notification) => {
      const type = String(notification.type || "").toLowerCase();
      return type === "system" || !type || type === "notification";
    });
    return (
      <FeatureShell feature={feature} action={<Link to="/admin/settings" className="button-secondary">Platform logs</Link>}>
        {error && <ErrorBanner error={error} />}
        <div className="admin-summary-grid admin-summary-grid-wide">
          <StatCard title="Support notifications" value={systemAnnouncements.length.toLocaleString()} note="System-visible messages" loading={notificationsLoading} />
          <StatCard title="Open support tickets" value={supportTicketList.length.toLocaleString()} note="Tickets waiting for admin review" loading={notificationsLoading} />
        </div>
        <div className="admin-panel-grid">
          <article className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <h3>Support tickets</h3>
                <p>Tickets created by restricted users and routed to the admin team.</p>
              </div>
            </div>
            {notificationsLoading ? (
              <Loader label="Loading support tickets..." />
            ) : supportTicketList.length ? (
              <div className="admin-activity-list">
                {supportTicketList.slice(0, 10).map((conversation) => {
                  const conversationId = conversation._id || conversation.id;
                  const metadata = conversation?.metadata || {};
                  const participants = Array.isArray(conversation?.participants) ? conversation.participants : [];
                  const requester = participants.find((participant) => String(participant?.role || "").toLowerCase() !== "admin") || participants[0];
                  const participantName = formatName(requester);

                  return (
                  <div key={conversationId} className="admin-activity-item">
                    <div>
                      <strong>{participantName}</strong>
                      <span>{metadata.supportEmail || "Support ticket"} · {conversation.contractId ? "Contract linked" : "No contract linked"}</span>
                    </div>
                    <div className="admin-row-actions">
                      <small>{formatDate(conversation.createdAt)}</small>
                      <Link to={`/admin/chat/${conversationId}`} className="button-secondary">
                        Open ticket
                      </Link>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="admin-empty-state">
                <h4>No open support tickets</h4>
                <p>Tickets from suspended users will appear here when they contact support.</p>
              </div>
            )}
          </article>

          <article className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <h3>Reported conversations</h3>
                <p>Hidden by default to avoid exposing private chats.</p>
              </div>
            </div>
            <div className="admin-empty-state">
              <h4>Support tickets only</h4>
              <p>Private chats stay hidden here; only support conversations are surfaced to admins.</p>
            </div>

            <div className="admin-panel-header" style={{ marginTop: "16px" }}>
              <div>
                <h3>System announcements</h3>
                <p>Platform-wide updates and notices.</p>
              </div>
            </div>
            <div className="admin-empty-state">
              <h4>Announcements use notifications</h4>
              <p>Use the notification stream for platform-wide broadcasts.</p>
            </div>
          </article>
        </div>
      </FeatureShell>
    );
  }

  if (feature === "settings") {
    return (
      <FeatureShell feature={feature} action={<Link to="/admin/profile" className="button-primary">Admin profile</Link>}>
        {error && <ErrorBanner error={error} />}
        <div className="admin-summary-grid admin-summary-grid-wide">
          <StatCard title="Security" value={userList.filter((user) => user.isEmailVerified).length.toLocaleString()} note="Email-verified accounts" loading={usersLoading} />
          <StatCard title="Activity logs" value={transactionList.length.toLocaleString()} note="Latest wallet and payment events" loading={transactionsLoading} />
        </div>
        <div className="admin-panel-grid">
          <article className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <h3>Admin profile</h3>
                <p>Keep the current profile, password, and account details up to date.</p>
              </div>
            </div>
            <Link to="/admin/profile" className="button-secondary">Open profile</Link>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <h3>Security settings</h3>
                <p>Session controls and account protection options.</p>
              </div>
            </div>
            <div className="admin-empty-state">
              <h4>Security controls follow the existing auth flow</h4>
              <p>Authentication and role permissions remain unchanged.</p>
            </div>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <h3>Activity logs</h3>
                <p>Recent platform actions and operational events.</p>
              </div>
            </div>
            {transactionsLoading ? (
              <Loader label="Loading activity logs..." />
            ) : transactionList.length ? (
              <div className="admin-activity-list">
                {transactionList.slice(0, 8).map((transaction) => (
                  <div key={transaction._id || transaction.id} className="admin-activity-item">
                    <div>
                      <strong>{transaction.description || formatStatus(transaction.type)}</strong>
                      <span>{transaction.status || "completed"} - {formatCurrency(transaction.amount, transaction.currency || wallet?.currency || "KSH")}</span>
                    </div>
                    <small>{formatDate(transaction.createdAt)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-empty-state">
                <h4>No activity logs loaded</h4>
                <p>Activity entries will appear as payments and contracts move through the marketplace.</p>
              </div>
            )}
          </article>
        </div>
      </FeatureShell>
    );
  }

  return (
    <FeatureShell feature="settings" action={<Link to="/admin/profile" className="button-primary">Admin profile</Link>}>
      <div className="admin-empty-state">
        <h4>Unknown admin section</h4>
        <p>Select a section from the sidebar.</p>
      </div>
    </FeatureShell>
  );
}
