/**
 * Auth Module Index
 * Exports auth router and service for use in other modules
 */

import authRoutes from "./routes.js";
import { authService } from "./service.js";

export { authRoutes, authService };
export default authRoutes;
