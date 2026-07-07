import { io } from "socket.io-client";

let socket;

function getSocketBaseUrl() {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";
  return apiUrl.replace(/\/api\/v1\/?$/, "");
}

export function createChatSocket(accessToken) {
  if (!accessToken) return null;

  if (!socket) {
    socket = io(getSocketBaseUrl(), {
      auth: { token: accessToken },
      transports: ["websocket"],
      autoConnect: false,
    });
  }

  return socket;
}

export function disconnectChatSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
