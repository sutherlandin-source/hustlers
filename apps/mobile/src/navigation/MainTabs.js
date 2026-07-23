import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import HomeScreen from "../screens/home/HomeScreen.js";
import ContractsScreen from "../screens/contracts/ContractsScreen.js";
import TasksScreen from "../screens/tasks/TasksScreen.js";
import MessagesScreen from "../screens/messages/MessagesScreen.js";
import MoreScreen from "../screens/more/MoreScreen.js";
import AdminDashboardScreen from "../screens/admin/AdminDashboardScreen.js";
import { useAuth } from "../context/AuthContext.js";
import { useUnreadNotifications } from "../hooks/useUnreadNotifications.js";

const Tab = createBottomTabNavigator();

const ICON_MAP = {
  Home:      "home-outline",
  Contracts: "briefcase-outline",
  Tasks:     "checkbox-outline",
  Messages:  "chatbubble-ellipses-outline",
  More:      "grid-outline",
  Admin:     "shield-outline",
};

export default function MainTabs({ initialRouteName = "Home" }) {
  const { role } = useAuth();
  const { count: unreadCount } = useUnreadNotifications();
  const isAdmin = role === "admin";

  const notifBadge = unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : undefined;

  const sharedOptions = {
    headerShown: false,
    tabBarActiveTintColor: "#0F172A",
    tabBarInactiveTintColor: "#94A3B8",
    tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
    tabBarStyle: {
      height: 62,
      paddingTop: 6,
      paddingBottom: 6,
      borderTopColor: "#E2E8F0",
      backgroundColor: "#FFFFFF",
    },
    tabBarBadgeStyle: {
      backgroundColor: "#EF4444",
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "800",
      minWidth: 17,
      height: 17,
      lineHeight: 17,
    },
    tabBarIcon: ({ color, size, route }) => (
      <Ionicons name={ICON_MAP[route?.name] || "ellipse-outline"} size={size} color={color} />
    ),
  };

  // ── Admin tab set ──────────────────────────────────────────────────────────
  if (isAdmin) {
    return (
      <Tab.Navigator
        initialRouteName={initialRouteName === "More" ? "Admin" : initialRouteName}
        screenOptions={({ route }) => ({
          ...sharedOptions,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={ICON_MAP[route.name] || "ellipse-outline"} size={size} color={color} />
          ),
        })}
      >
        <Tab.Screen name="Admin"     component={AdminDashboardScreen} options={{ title: "Dashboard" }} />
        <Tab.Screen name="Contracts" component={ContractsScreen}      options={{ title: "Contracts" }} />
        <Tab.Screen name="Messages"  component={MessagesScreen}        options={{ title: "Messages"  }} />
        <Tab.Screen
          name="More"
          component={MoreScreen}
          options={{ title: "More", tabBarBadge: notifBadge }}
        />
      </Tab.Navigator>
    );
  }

  // ── Regular user tab set ───────────────────────────────────────────────────
  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={({ route }) => ({
        ...sharedOptions,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICON_MAP[route.name] || "ellipse-outline"} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home"      component={HomeScreen}      options={{ title: "Home"      }} />
      <Tab.Screen name="Contracts" component={ContractsScreen} options={{ title: "Contracts" }} />
      <Tab.Screen name="Tasks"     component={TasksScreen}     options={{ title: "Tasks"     }} />
      <Tab.Screen name="Messages"  component={MessagesScreen}  options={{ title: "Messages"  }} />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ title: "More", tabBarBadge: notifBadge }}
      />
    </Tab.Navigator>
  );
}
