import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import ScreenShell from "../../components/ScreenShell.js";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { formatDate, formatMoney, getDisplayName } from "../../utils/format.js";

// ─── Constants ────────────────────────────────────────────────────────────────

// Manager sees all statuses; hustler sees the same set
const STATUS_FILTERS = ["All", "Pending", "Accepted", "Rejected"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) {
  return String(v || "").trim().toLowerCase();
}

/**
 * The API unwraps response.data already, so the payload for list endpoints
 * is a plain array. Fall back gracefully for any envelope shape.
 */
function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.applications)) return payload.applications;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeStatus(raw) {
  const s = lower(raw).replace(/_/g, " ");
  if (!s || s === "pending review" || s === "under review") return "Pending";
  if (s === "accepted" || s === "approved") return "Accepted";
  if (s === "rejected" || s === "declined") return "Rejected";
  if (s === "cancelled") return "Cancelled";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPending(status) { return normalizeStatus(status) === "Pending"; }
function isAccepted(status) { return normalizeStatus(status) === "Accepted"; }
function isRejected(status) { return normalizeStatus(status) === "Rejected"; }

/** Applicant object lives in application.hustlerId (populated by the server) */
function getApplicant(app) {
  return app?.hustlerId || app?.applicant || {};
}

/** Contract object lives in application.contractId (populated by the server) */
function getContract(app) {
  return app?.contractId || app?.contract || {};
}

function getContractId(app) {
  const c = app?.contractId;
  if (c && typeof c === "object") return c._id || c.id || "";
  return String(c || app?.contract?._id || app?.contract?.id || "");
}

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
}

function sortTime(app) {
  return new Date(app?.updatedAt || app?.appliedAt || app?.createdAt || 0).getTime();
}

/** Group a flat application list by contract, returning stats per group */
function groupByContract(applications) {
  const map = new Map();
  for (const app of applications) {
    const cid = getContractId(app);
    if (!cid) continue;
    if (!map.has(cid)) {
      map.set(cid, {
        contractId: cid,
        contract: getContract(app),
        applications: [],
      });
    }
    map.get(cid).applications.push(app);
  }
  return Array.from(map.values()).map((group) => {
    const required = Number(group.contract?.numWorkers || 1);
    const accepted = group.applications.filter((a) => isAccepted(a.status)).length;
    const pending  = group.applications.filter((a) => isPending(a.status)).length;
    return {
      ...group,
      required,
      accepted,
      pending,
      remaining: Math.max(0, required - accepted),
      filled: accepted >= required,
    };
  });
}


// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ApplicationsScreen({ navigation, route }) {
  const { user, role, accessToken } = useAuth();
  const isManager = lower(role) === "manager";

  // If navigated from a specific contract, filter to that contract only
  const preselectedContractId = String(
    route?.params?.contractId || route?.params?.id || ""
  ).trim();

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");
  const [applications, setApplications] = useState([]);
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState("All");

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!accessToken) { setLoading(false); setRefreshing(false); return; }
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError("");

      try {
        if (isManager) {
          const userId = user?._id || user?.id;

          if (preselectedContractId) {
            // Fetch applications for one specific contract
            const payload = await apiRequest(
              `/applications/contract/${preselectedContractId}`,
              { token: accessToken }
            );
            setApplications(toArray(payload));
          } else {
            // Fetch all manager contracts, then applications for each
            const contractsPayload = await apiRequest("/contracts", {
              token: accessToken,
              query: { limit: 50 },
            });
            const allContracts = toArray(contractsPayload?.contracts ?? contractsPayload)
              .filter((c) => String(c?.buyer?._id || c?.buyer || "") === String(userId));

            if (!allContracts.length) {
              setApplications([]);
              return;
            }

            const results = await Promise.all(
              allContracts.map((contract) => {
                const cid = contract._id || contract.id;
                return apiRequest(`/applications/contract/${cid}`, {
                  token: accessToken,
                }).catch(() => []);
              })
            );

            // Flatten, attach the contract object, deduplicate by _id
            const seen = new Set();
            const flat = results.flatMap((payload, i) =>
              toArray(payload).map((app) => ({
                ...app,
                // Ensure populated contract is available client-side
                contractId: app.contractId && typeof app.contractId === "object"
                  ? app.contractId
                  : allContracts[i],
              }))
            ).filter((app) => {
              const id = String(app._id || app.id || "");
              if (!id || seen.has(id)) return false;
              seen.add(id);
              return true;
            });

            setApplications(flat);
          }
        } else {
          // Hustler: fetch own applications
          const payload = await apiRequest("/applications/hustler/my", {
            token: accessToken,
          });
          setApplications(toArray(payload));
        }
      } catch (err) {
        setError(
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load applications."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, isManager, preselectedContractId, user?._id, user?.id]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Derived lists ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return applications.filter((app) => {
      const contract  = getContract(app);
      const applicant = getApplicant(app);

      // contract filter (when arriving from a contract screen)
      if (preselectedContractId) {
        const cid = getContractId(app);
        if (cid && cid !== preselectedContractId) return false;
      }

      // status filter
      const ns = normalizeStatus(app.status);
      if (filter !== "All" && ns !== filter) return false;

      // search
      if (term) {
        const hay = [
          getDisplayName(applicant),
          contract?.title,
          app.status,
          app.coverLetter,
          contract?.jobCategory,
          contract?.workLocation,
        ].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }

      return true;
    });
  }, [applications, filter, preselectedContractId, search]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        // Pending first, then newest
        const pa = isPending(a.status) ? 0 : 1;
        const pb = isPending(b.status) ? 0 : 1;
        return pa !== pb ? pa - pb : sortTime(b) - sortTime(a);
      }),
    [filtered]
  );

  // Manager-specific groupings
  const pendingGroups   = useMemo(() => groupByContract(sorted.filter((a) => isPending(a.status))),  [sorted]);
  const acceptedGroups  = useMemo(() => groupByContract(sorted.filter((a) => isAccepted(a.status))), [sorted]);
  const rejectedGroups  = useMemo(() => groupByContract(sorted.filter((a) => isRejected(a.status))), [sorted]);

  // Summary counts (all applications, no filter applied)
  const counts = useMemo(() => ({
    total:    applications.length,
    pending:  applications.filter((a) => isPending(a.status)).length,
    accepted: applications.filter((a) => isAccepted(a.status)).length,
    rejected: applications.filter((a) => isRejected(a.status)).length,
  }), [applications]);

  // ── Navigation helpers ────────────────────────────────────────────────────

  const openDetails = (app) => {
    navigation.navigate("ApplicationDetails", {
      applicationId: app._id || app.id,
      contractId: getContractId(app),
    });
  };

  const openContractDetails = (contractId) => {
    const parent = navigation.getParent?.();
    (parent ?? navigation).navigate("ContractDetails", { contractId });
  };


  // ── Render ────────────────────────────────────────────────────────────────

  const renderCard = (app) => {
    const applicant = getApplicant(app);
    const contract  = getContract(app);
    const name      = getDisplayName(applicant);
    const status    = normalizeStatus(app.status);
    const avatar    = applicant?.avatar || applicant?.profilePhoto;
    const rate      = Number(app.proposedRate || app.requestedRate || 0);

    return (
      <Pressable
        key={app._id || app.id}
        style={styles.card}
        onPress={() => openDetails(app)}
      >
        <View style={styles.cardTop}>
          <View style={styles.avatarWrap}>
            {avatar
              ? <Image source={{ uri: avatar }} style={styles.avatar} />
              : <Text style={styles.avatarText}>{getInitials(name)}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{name}</Text>
            <Text style={styles.cardContract} numberOfLines={1}>
              {contract?.title || "Untitled contract"}
            </Text>
            <Text style={styles.cardMeta}>
              Applied {formatDate(app.appliedAt || app.createdAt)}
            </Text>
          </View>
          <StatusBadge status={status} />
        </View>

        {/* Info row */}
        <View style={styles.infoRow}>
          <InfoChip
            label="Proposed rate"
            value={rate > 0 ? formatMoney(rate, contract?.currency || "KSH") : "Not specified"}
          />
          {contract?.jobCategory
            ? <InfoChip label="Category" value={contract.jobCategory} />
            : null}
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.tapHint}>Tap to review →</Text>
        </View>
      </Pressable>
    );
  };

  const renderGroupCard = (group, variant) => {
    const isRej = variant === "rejected";
    return (
      <View key={group.contractId} style={styles.groupCard}>
        <View style={styles.groupTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupTitle}>
              {group.contract?.title || "Untitled contract"}
            </Text>
            <Text style={styles.groupMeta}>
              {variant === "pending"
                ? `${group.pending} pending · ${group.required} required · ${group.remaining} remaining`
                : variant === "accepted"
                ? `${group.accepted} accepted of ${group.required} required`
                : `${group.applications.length} rejected`}
            </Text>
          </View>
          <StatusBadge
            status={variant === "pending" ? "Pending" : variant === "accepted" ? "Accepted" : "Rejected"}
          />
        </View>
        <View style={styles.groupActions}>
          <SmallButton
            title="Review Applications"
            onPress={() => setFilter(variant === "pending" ? "Pending" : variant === "accepted" ? "Accepted" : "Rejected")}
          />
          <SmallButton
            title="Open Contract"
            secondary
            onPress={() => openContractDetails(group.contractId)}
          />
        </View>
      </View>
    );
  };

  return (
    <ScreenShell
      title={isManager ? "Applications" : "My Applications"}
      subtitle={
        isManager
          ? preselectedContractId
            ? "Applications for this contract."
            : "Review applications submitted by hustlers across all your contracts."
          : "Track every job you applied for and its current review status."
      }
      showBack={navigation.canGoBack()}
      onBackPress={() => navigation.goBack()}
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ isRefresh: true })}
          />
        ),
      }}
    >
      {/* Search */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder={isManager ? "Search by name, contract, or category…" : "Search by contract or status…"}
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Summary bar (manager only) */}
      {isManager ? (
        <View style={styles.summaryRow}>
          <SummaryStat label="Total" value={counts.total} />
          <SummaryStat label="Pending" value={counts.pending} accent />
          <SummaryStat label="Accepted" value={counts.accepted} green />
          <SummaryStat label="Rejected" value={counts.rejected} />
        </View>
      ) : null}

      {/* States */}
      {loading ? (
        <StateCard>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateTitle}>Loading applications…</Text>
        </StateCard>
      ) : error ? (
        <StateCard>
          <Text style={styles.stateTitle}>Could not load applications</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </StateCard>
      ) : isManager && filter === "All" ? (
        /* Manager default view: grouped by status */
        <>
          <SectionLabel title="Needs Review" count={counts.pending} />
          {pendingGroups.length
            ? pendingGroups.map((g) => renderGroupCard(g, "pending"))
            : <EmptyNote text="No pending applications." />}

          <SectionLabel title="Accepted" count={counts.accepted} />
          {acceptedGroups.length
            ? acceptedGroups.map((g) => renderGroupCard(g, "accepted"))
            : <EmptyNote text="No accepted applications yet." />}

          {rejectedGroups.length ? (
            <>
              <SectionLabel title="Rejected" count={counts.rejected} />
              {rejectedGroups.map((g) => renderGroupCard(g, "rejected"))}
            </>
          ) : null}
        </>
      ) : sorted.length ? (
        /* Filtered flat list */
        <>
          <Text style={styles.resultCount}>
            {sorted.length} {filter === "All" ? "" : filter.toLowerCase() + " "}
            application{sorted.length === 1 ? "" : "s"}
          </Text>
          {sorted.map(renderCard)}
        </>
      ) : (
        <StateCard>
          <Text style={styles.stateTitle}>No applications found</Text>
          <Text style={styles.stateText}>
            {filter !== "All"
              ? `No ${filter.toLowerCase()} applications match your search.`
              : isManager
              ? "Applications from hustlers will appear here."
              : "Apply to a contract and it will show here."}
          </Text>
        </StateCard>
      )}
    </ScreenShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = styles[`badge${status}`] || styles.badgePending;
  return <Text style={[styles.badge, s]}>{status}</Text>;
}

function InfoChip({ label, value }) {
  return (
    <View style={styles.infoChip}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SummaryStat({ label, value, accent, green }) {
  return (
    <View style={[styles.stat, accent && styles.statAccent, green && styles.statGreen]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionLabel({ title, count }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionLabelText}>{title}</Text>
      {count != null
        ? <Text style={styles.sectionLabelCount}>{count}</Text>
        : null}
    </View>
  );
}

function EmptyNote({ text }) {
  return (
    <View style={styles.emptyNote}>
      <Text style={styles.emptyNoteText}>{text}</Text>
    </View>
  );
}

function StateCard({ children }) {
  return <View style={styles.stateCard}>{children}</View>;
}

function SmallButton({ title, onPress, secondary }) {
  return (
    <Pressable
      style={[styles.smallBtn, secondary && styles.smallBtnSecondary]}
      onPress={onPress}
    >
      <Text style={[styles.smallBtnText, secondary && styles.smallBtnTextSecondary]}>
        {title}
      </Text>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  searchBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: {
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  chipTextActive: { color: colors.accent },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 10,
    alignItems: "center",
    gap: 2,
  },
  statAccent: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  statGreen:  { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  statValue: { fontSize: 20, fontWeight: "900", color: colors.text },
  statLabel: { fontSize: 11, fontWeight: "700", color: colors.muted },
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 4,
  },
  sectionLabelText: { fontSize: 15, fontWeight: "800", color: colors.text },
  sectionLabelCount: {
    backgroundColor: "#E2E8F0",
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: spacing(1.5),
    gap: 10,
  },
  groupTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  groupTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  groupMeta:  { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 18 },
  groupActions: { flexDirection: "row", gap: 8 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: spacing(1.5),
    gap: 10,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatarWrap: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "#E2E8F0",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatar: { width: "100%", height: "100%" },
  avatarText: { color: colors.text, fontWeight: "800", fontSize: 14 },
  cardName:     { fontSize: 15, fontWeight: "800", color: colors.text },
  cardContract: { color: colors.muted, marginTop: 2, lineHeight: 19 },
  cardMeta:     { color: colors.muted, fontSize: 12, marginTop: 3 },
  infoRow: { flexDirection: "row", gap: 8 },
  infoChip: {
    flex: 1, backgroundColor: "#F8FAFC",
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 10, gap: 3,
  },
  infoLabel: { fontSize: 11, fontWeight: "700", color: colors.muted },
  infoValue: { fontSize: 13, fontWeight: "700", color: colors.text },
  cardFooter: { alignItems: "flex-end" },
  tapHint: { fontSize: 12, color: colors.muted, fontWeight: "700" },
  badge: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, fontSize: 12, fontWeight: "800",
  },
  badgePending:   { backgroundColor: "#FEF3C7", color: "#B45309" },
  badgeAccepted:  { backgroundColor: "#DCFCE7", color: "#15803D" },
  badgeRejected:  { backgroundColor: "#FEE2E2", color: "#B91C1C" },
  badgeCancelled: { backgroundColor: "#F1F5F9", color: "#64748B" },
  resultCount: {
    fontSize: 13, fontWeight: "700", color: colors.muted, paddingBottom: 4,
  },
  emptyNote: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, padding: 14,
  },
  emptyNoteText: { color: colors.muted, lineHeight: 20 },
  stateCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: spacing(2), gap: 10,
  },
  stateTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  stateText:  { color: colors.muted, lineHeight: 22 },
  retryBtn: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 12, alignItems: "center",
  },
  retryText: { color: "#fff", fontWeight: "800" },
  smallBtn: {
    flex: 1, backgroundColor: colors.primary,
    borderRadius: 12, paddingVertical: 12, alignItems: "center",
  },
  smallBtnSecondary: { backgroundColor: "#E2E8F0" },
  smallBtnText:          { color: "#fff", fontWeight: "800", fontSize: 13 },
  smallBtnTextSecondary: { color: colors.text },
});
