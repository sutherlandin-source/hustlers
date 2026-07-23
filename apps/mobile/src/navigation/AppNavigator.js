import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext.js";
import AuthStack from "./AuthStack.js";
import MainTabs from "./MainTabs.js";
import ContractDetailsScreen from "../screens/contracts/ContractDetailsScreen.js";
import ContractCreateScreen from "../screens/contracts/ContractCreateScreen.js";
import MilestoneCreateScreen from "../screens/contracts/MilestoneCreateScreen.js";
import ApplicationsScreen from "../screens/applications/ApplicationsScreen.js";
import ApplicationDetailsScreen from "../screens/applications/ApplicationDetailsScreen.js";
import TaskDetailsScreen from "../screens/tasks/TaskDetailsScreen.js";
import StageDetailsScreen from "../screens/tasks/StageDetailsScreen.js";
import MilestonesScreen from "../screens/tasks/MilestonesScreen.js";
import TaskApprovalsScreen from "../screens/tasks/TaskApprovalsScreen.js";
import WalletScreen from "../screens/more/WalletScreen.js";
import NotificationsScreen from "../screens/more/NotificationsScreen.js";
import ProfileScreen from "../screens/more/ProfileScreen.js";
import SupportScreen from "../screens/more/SupportScreen.js";
import ChatScreen from "../screens/messages/ChatScreen.js";
import RaiseDisputeScreen from "../screens/disputes/RaiseDisputeScreen.js";
import DisputeScreen from "../screens/disputes/DisputeScreen.js";
import AdminUsersScreen from "../screens/admin/AdminUsersScreen.js";
import AdminUserDetailScreen from "../screens/admin/AdminUserDetailScreen.js";
import AdminDisputesScreen from "../screens/admin/AdminDisputesScreen.js";
import AdminWalletScreen from "../screens/admin/AdminWalletScreen.js";
import AdminContractsScreen from "../screens/admin/AdminContractsScreen.js";
import ReviewScreen from "../screens/reviews/ReviewScreen.js";
import SplashScreen from "../screens/auth/SplashScreen.js";

const Stack = createNativeStackNavigator();

function getInitialTabForRole(role) {
  if (role === "manager") return "Contracts";
  if (role === "admin") return "More";
  return "Home";
}

function isSupportedRole(role) {
  return role === "hustler" || role === "manager" || role === "admin";
}

function UnsupportedRoleScreen({ role, onSignOut }) {
  return (
    <View style={styles.unsupportedContainer}>
      <View style={styles.unsupportedCard}>
        <Text style={styles.unsupportedTitle}>Account role unavailable</Text>
        <Text style={styles.unsupportedText}>
          We could not load a mobile workspace for this account role{role ? ` (${role})` : ""}. Please sign out and
          sign in again, or contact support if this keeps happening.
        </Text>
        <Pressable style={styles.unsupportedButton} onPress={onSignOut}>
          <Text style={styles.unsupportedButtonText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AppNavigator() {
  const { user, role, hydrating, logout } = useAuth();

  if (hydrating) {
    return <SplashScreen />;
  }

  if (user && !isSupportedRole(role)) {
    return <UnsupportedRoleScreen role={role} onSignOut={logout} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : (
        <>
          <Stack.Screen name="Tabs">{() => <MainTabs initialRouteName={getInitialTabForRole(role)} />}</Stack.Screen>
          <Stack.Screen name="ContractDetails" component={ContractDetailsScreen} />
          <Stack.Screen name="CreateContract"  component={ContractCreateScreen} />
          <Stack.Screen name="CreateMilestone" component={MilestoneCreateScreen} />
          <Stack.Screen name="TaskDetails"      component={TaskDetailsScreen} />
          <Stack.Screen name="StageDetails"     component={StageDetailsScreen} />
          <Stack.Screen name="Milestones"       component={MilestonesScreen} />
          <Stack.Screen name="TaskApprovals"    component={TaskApprovalsScreen} />
          <Stack.Screen name="Applications" component={ApplicationsScreen} />
          <Stack.Screen name="ApplicationDetails" component={ApplicationDetailsScreen} />
          <Stack.Screen name="Wallet" component={WalletScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Support" component={SupportScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="RaiseDispute" component={RaiseDisputeScreen} />
          <Stack.Screen name="Dispute"      component={DisputeScreen} />
          <Stack.Screen name="AdminUsers"      component={AdminUsersScreen} />
          <Stack.Screen name="AdminUserDetail" component={AdminUserDetailScreen} />
          <Stack.Screen name="AdminDisputes"   component={AdminDisputesScreen} />
          <Stack.Screen name="AdminWallet"     component={AdminWalletScreen} />
          <Stack.Screen name="AdminContracts"  component={AdminContractsScreen} />
          <Stack.Screen name="Reviews"         component={ReviewScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  unsupportedContainer: {
    flex: 1,
    backgroundColor: "#F6F7FB",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  unsupportedCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
    gap: 12,
  },
  unsupportedTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "800",
  },
  unsupportedText: {
    color: "#64748B",
    lineHeight: 22,
  },
  unsupportedButton: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  unsupportedButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
