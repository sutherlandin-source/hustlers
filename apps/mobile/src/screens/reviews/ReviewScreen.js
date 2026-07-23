import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { apiRequest } from "../../services/api.js";
import { useAuth } from "../../context/AuthContext.js";
import { colors, spacing } from "../../theme.js";
import { formatDate, getDisplayName } from "../../utils/format.js";
import BackButton from '../../components/BackButton.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lower(v) { return String(v || "").trim().toLowerCase(); }

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ratingColor(score) {
  if (score >= 4.5) return "#059669";
  if (score >= 3.5) return "#D97706";
  return "#DC2626";
}

function ratingLabel(score) {
  const n = Number(score || 0);
  if (n >= 4.5) return "Excellent";
  if (n >= 4.0) return "Great";
  if (n >= 3.0) return "Good";
  if (n >= 2.0) return "Fair";
  return "Poor";
}

function avg(reviews, key) {
  if (!reviews?.length) return 0;
  const sum = reviews.reduce((acc, r) => acc + Number(r?.[key] || 0), 0);
  return (sum / reviews.length).toFixed(1);
}

// ─── Star Row ─────────────────────────────────────────────────────────────────

function StarRow({ value, onChange, size = 28, readOnly = false }) {
  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => !readOnly && onChange?.(star)}
          hitSlop={6}
          disabled={readOnly}
          accessibilityRole="button"
          accessibilityLabel={`${star} star${star > 1 ? "s" : ""}`}
        >
          <Ionicons
            name={value >= star ? "star" : "star-outline"}
            size={size}
            color={value >= star ? "#F59E0B" : colors.border}
          />
        </Pressable>
      ))}
    </View>
  );
}

const starStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4 },
});

// ─── Review Card ──────────────────────────────────────────────────────────────

function ReviewCard({ review }) {
  const reviewer = review?.reviewer;
  const reviewerName = getDisplayName(reviewer);
  const overall = Number(review?.rating || 0);

  return (
    <View style={styles.reviewCard}>
      {/* Header */}
      <View style={styles.reviewHeader}>
        <View style={styles.reviewAvatar}>
          <Text style={styles.reviewAvatarText}>
            {String(reviewerName?.[0] || "?").toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reviewerName}>{reviewerName}</Text>
          <Text style={styles.reviewDate}>{formatDateTime(review?.createdAt)}</Text>
        </View>
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={12} color="#F59E0B" />
          <Text style={styles.ratingBadgeText}>{overall.toFixed(1)}</Text>
        </View>
      </View>

      {/* Stars */}
      <StarRow value={overall} size={18} readOnly />

      {/* Sub-scores */}
      {[
        ["Communication",    review?.communication],
        ["Professionalism",  review?.professionalism],
        ["Quality",          review?.quality],
        ["Timeliness",       review?.timeliness],
      ].map(([label, score]) => score != null ? (
        <View key={label} style={styles.subScoreRow}>
          <Text style={styles.subScoreLabel}>{label}</Text>
          <StarRow value={Number(score)} size={13} readOnly />
        </View>
      ) : null)}

      {/* Text */}
      {review?.reviewText ? (
        <Text style={styles.reviewText}>"{review.reviewText}"</Text>
      ) : null}

      {/* Contract ref */}
      {review?.contract?.title || review?.contract?.contractId ? (
        <View style={styles.contractRef}>
          <Ionicons name="briefcase-outline" size={12} color={colors.muted} />
          <Text style={styles.contractRefText} numberOfLines={1}>
            {review.contract.title || review.contract.contractId}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Rating Summary Bar ───────────────────────────────────────────────────────

function DistributionBar({ distribution, total }) {
  return (
    <View style={styles.distWrap}>
      {[5, 4, 3, 2, 1].map((star) => {
        const count = Number(distribution?.[star] || 0);
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <View key={star} style={styles.distRow}>
            <Text style={styles.distLabel}>{star}</Text>
            <Ionicons name="star" size={11} color="#F59E0B" />
            <View style={styles.distBarBg}>
              <View style={[styles.distBarFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.distCount}>{count}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Submit Review Form ───────────────────────────────────────────────────────

function SubmitForm({ contractId, revieweeId, onSuccess, onCancel }) {
  const [form, setForm] = useState({
    rating: 0,
    communication: 0,
    professionalism: 0,
    quality: 0,
    timeliness: 0,
    reviewText: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }));

  const isValid =
    form.rating > 0 &&
    form.communication > 0 &&
    form.professionalism > 0 &&
    form.quality > 0 &&
    form.timeliness > 0;

  const handleSubmit = async () => {
    if (!isValid) { setError("Please fill in all star ratings before submitting."); return; }
    setSubmitting(true);
    setError("");
    try {
      await apiRequest("/reviews", {
        method: "POST",
        body: {
          contractId,
          revieweeId,
          ...form,
        },
      });
      onSuccess?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Leave a Review</Text>
      <Text style={styles.formSubtitle}>
        Rate your experience working on this contract.
      </Text>

      {[
        ["Overall Rating",    "rating"],
        ["Communication",     "communication"],
        ["Professionalism",   "professionalism"],
        ["Quality of Work",   "quality"],
        ["Timeliness",        "timeliness"],
      ].map(([label, key]) => (
        <View key={key} style={styles.formField}>
          <Text style={styles.formLabel}>{label}</Text>
          <StarRow value={form[key]} onChange={set(key)} size={30} />
        </View>
      ))}

      <View style={styles.formField}>
        <Text style={styles.formLabel}>Comments (optional)</Text>
        <TextInput
          style={styles.textArea}
          value={form.reviewText}
          onChangeText={set("reviewText")}
          placeholder="Share your experience…"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={2000}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{form.reviewText.length}/2000</Text>
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.formActions}>
        <Pressable
          style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isValid || submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : (
              <>
                <Ionicons name="checkmark-outline" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Submit Review</Text>
              </>
            )
          }
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

/**
 * ReviewScreen
 *
 * Route params:
 *   userId        — whose reviews to show (required)
 *   userName      — display name for the header
 *   contractId    — when provided + canReview=true, shows the submit form
 *   revieweeId    — the user being reviewed (same as userId usually)
 *   canReview     — boolean, show submit form if true and no existing review
 */
export default function ReviewScreen({ route, navigation }) {
  const { accessToken, user } = useAuth();

  const userId     = route?.params?.userId;
  const userName   = route?.params?.userName || "User";
  const contractId = route?.params?.contractId || null;
  const revieweeId = route?.params?.revieweeId || userId;
  const canReview  = Boolean(route?.params?.canReview);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const result = await apiRequest(`/reviews/user/${userId}`, { token: accessToken });
      setData(result);

      // Check if current user already reviewed this contract
      if (contractId) {
        const currentUserId = user?._id || user?.id;
        const existingReview = (result?.reviews || []).find(
          (r) =>
            String(r?.reviewer?._id || r?.reviewer?.id || r?.reviewer || "") ===
              String(currentUserId || "") &&
            String(r?.contract?._id || r?.contract?.id || r?.contract || "") ===
              String(contractId || "")
        );
        setAlreadyReviewed(Boolean(existingReview));
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load reviews.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, accessToken, contractId, user?._id, user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleReviewSuccess = () => {
    setShowForm(false);
    setAlreadyReviewed(true);
    load(true);
  };

  const reviews     = data?.reviews || [];
  const total       = data?.total || 0;
  const distribution = data?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const overallAvg  = reviews.length ? avg(reviews, "rating") : null;

  const showSubmitEntry = canReview && contractId && revieweeId && !alreadyReviewed;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Navbar */}
      <View style={styles.navbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.navTitle} numberOfLines={1}>
          {userName}'s Reviews
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Submit form */}
        {showForm && showSubmitEntry ? (
          <SubmitForm
            contractId={contractId}
            revieweeId={revieweeId}
            onSuccess={handleReviewSuccess}
            onCancel={() => setShowForm(false)}
          />
        ) : null}

        {/* Leave a review CTA */}
        {showSubmitEntry && !showForm ? (
          <Pressable
            style={styles.leaveReviewBtn}
            onPress={() => setShowForm(true)}
            accessibilityRole="button"
          >
            <Ionicons name="star-outline" size={18} color="#fff" />
            <Text style={styles.leaveReviewBtnText}>Leave a Review</Text>
          </Pressable>
        ) : null}

        {/* Already reviewed badge */}
        {canReview && alreadyReviewed ? (
          <View style={styles.alreadyReviewed}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
            <Text style={styles.alreadyReviewedText}>You have already reviewed this contract.</Text>
          </View>
        ) : null}

        {/* Loading state */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.loadingText}>Loading reviews…</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBox}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
            <Text style={styles.errorMessage}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => load()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Summary */}
            {total > 0 ? (
              <View style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                  <View style={styles.summaryScore}>
                    <Text style={[styles.summaryAvgNum, { color: ratingColor(overallAvg) }]}>
                      {overallAvg}
                    </Text>
                    <Text style={styles.summaryAvgLabel}>
                      {ratingLabel(overallAvg)}
                    </Text>
                    <StarRow value={Math.round(Number(overallAvg))} size={16} readOnly />
                    <Text style={styles.summaryCount}>{total} review{total !== 1 ? "s" : ""}</Text>
                  </View>
                  <DistributionBar distribution={distribution} total={total} />
                </View>

                {/* Sub-score averages */}
                <View style={styles.subAvgGrid}>
                  {[
                    ["Communication",   "communication"],
                    ["Professionalism", "professionalism"],
                    ["Quality",         "quality"],
                    ["Timeliness",      "timeliness"],
                  ].map(([label, key]) => (
                    <View key={key} style={styles.subAvgItem}>
                      <Text style={styles.subAvgLabel}>{label}</Text>
                      <Text style={[styles.subAvgValue, { color: ratingColor(avg(reviews, key)) }]}>
                        {avg(reviews, key)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Ionicons name="star-outline" size={44} color={colors.border} />
                <Text style={styles.emptyTitle}>No reviews yet</Text>
                <Text style={styles.emptySubtitle}>
                  {canReview
                    ? "Be the first to leave a review for this contract."
                    : "Reviews will appear here after completed contracts."}
                </Text>
              </View>
            )}

            {/* Review list */}
            {reviews.length > 0 ? (
              <View style={styles.listSection}>
                <Text style={styles.listTitle}>All Reviews</Text>
                {reviews.map((review) => (
                  <ReviewCard
                    key={review._id || review.id || review.createdAt}
                    review={review}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: colors.background },

  // Navbar
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.25),
    gap: 10,
  },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },

  content: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(2),
    paddingBottom: spacing(5),
    gap: spacing(2),
  },

  // Leave review CTA
  leaveReviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  leaveReviewBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },

  // Already reviewed
  alreadyReviewed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    padding: 12,
  },
  alreadyReviewedText: {
    color: colors.success,
    fontWeight: "600",
    fontSize: 13,
  },

  // Loading / error
  centerBox: {
    alignItems: "center",
    paddingVertical: spacing(5),
    gap: spacing(1),
  },
  loadingText: { color: colors.muted, marginTop: 8 },
  errorMessage: { color: colors.danger, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryBtnText: { color: "#fff", fontWeight: "800" },

  // Summary card
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    gap: spacing(1.5),
  },
  summaryTop: {
    flexDirection: "row",
    gap: spacing(2),
    alignItems: "center",
  },
  summaryScore: {
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  summaryAvgNum: {
    fontSize: 46,
    fontWeight: "900",
    lineHeight: 50,
  },
  summaryAvgLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  summaryCount: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  subAvgGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(1),
  },
  subAvgItem: {
    flexBasis: "48%",
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  subAvgLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  subAvgValue: { fontSize: 18, fontWeight: "800" },

  // Distribution bar
  distWrap: { flex: 1, gap: 5 },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  distLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", width: 10 },
  distBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  distBarFill: {
    height: "100%",
    backgroundColor: "#F59E0B",
    borderRadius: 3,
  },
  distCount: { color: colors.muted, fontSize: 11, width: 16, textAlign: "right" },

  // Empty
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    alignItems: "center",
    gap: spacing(1),
  },
  emptyTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },
  emptySubtitle: { color: colors.muted, textAlign: "center", lineHeight: 20 },

  // Review list
  listSection: { gap: spacing(1.5) },
  listTitle: { color: colors.text, fontWeight: "800", fontSize: 16 },

  // Review card
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(1.5),
    gap: 10,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reviewAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent + "20",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  reviewAvatarText: { color: colors.accent, fontWeight: "800", fontSize: 15 },
  reviewerName:   { color: colors.text,  fontWeight: "700", fontSize: 14 },
  reviewDate:     { color: colors.muted, fontSize: 12 },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FFF7ED",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingBadgeText: { color: "#D97706", fontWeight: "800", fontSize: 13 },
  subScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subScoreLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  reviewText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    fontStyle: "italic",
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 10,
  },
  contractRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  contractRefText: { color: colors.muted, fontSize: 12, flex: 1 },

  // Submit form
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(2),
    gap: spacing(1.5),
  },
  formTitle:    { color: colors.text, fontWeight: "800", fontSize: 18 },
  formSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  formField: { gap: 8 },
  formLabel: { color: colors.text, fontWeight: "700", fontSize: 14 },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    minHeight: 90,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.background,
  },
  charCount: { color: colors.muted, fontSize: 11, textAlign: "right" },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 10,
  },
  errorText: { color: colors.danger, fontSize: 13, flex: 1 },
  formActions: { flexDirection: "row", gap: 10 },
  submitBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  cancelBtn: {
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  cancelBtnText: { color: colors.muted, fontWeight: "700" },
});
