# HUSTLERS Backend - Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Install Dependencies
```bash
cd apps/server
npm install
```

### Step 2: Setup Environment
```bash
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secrets
```

### Step 3: Start Development
```bash
cd ../..
npm run dev
```

Server runs at `http://localhost:5000`

---

## 📍 API Endpoints

### Health Checks
```bash
# Liveness check (is server up?)
curl http://localhost:5000/health

# Readiness check (is server ready for traffic?)
curl http://localhost:5000/ready

# API endpoint
curl http://localhost:5000/api/v1/health
```

### Authentication
```bash
# Register
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123","firstName":"John","lastName":"Doe"}'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'

# Response:
# {
#   "success": true,
#   "message": "Login successful",
#   "data": {
#     "user": { "id": "...", "email": "test@test.com" },
#     "accessToken": "eyJhbGc...",
#     "refreshToken": "eyJhbGc..."
#   },
#   "timestamp": "2024-01-01T00:00:00.000Z"
# }
```

---

## 🛠️ Project Structure

```
apps/server/
├── src/
│   ├── config/       # Configuration (env, database, constants)
│   ├── middleware/   # Express middleware (auth, errors, logging, etc.)
│   ├── controllers/  # Route handlers
│   ├── services/     # Business logic
│   ├── models/       # Mongoose schemas
│   ├── routes/       # API route definitions
│   ├── utils/        # Helper functions
│   ├── app.js        # Express app setup
│   └── index.js      # Entry point
├── .env.example      # Environment variables template
├── README.md         # Full documentation
├── ARCHITECTURE.md   # Architecture patterns
└── DEPENDENCIES.md   # Dependency guide
```

---

## ✅ Included Features

### Security ✓
- Helmet.js (HTTP security headers)
- CORS (Cross-origin handling)
- Rate limiting (Prevents abuse)
- Password hashing (bcryptjs)
- JWT authentication
- Input validation

### Architecture ✓
- Modular folder structure
- Service layer pattern
- Async error handling
- Global error handler
- Request logging
- Request ID tracing

### API Features ✓
- REST API best practices
- API versioning (/api/v1)
- Health check endpoints
- Error standardization
- Request validation
- JWT tokens

### Database ✓
- MongoDB + Mongoose
- User model with authentication
- Automatic timestamps
- Hooks & middleware
- Schema validation

---

## 🔑 Key Files Explained

### `src/app.js` - Express Setup
Configures middleware, routes, and error handling. The core of the application.

### `src/index.js` - Server Startup
Starts the HTTP server, connects to MongoDB, handles graceful shutdown.

### `src/config/env.js` - Configuration
Loads and validates environment variables.

### `src/middleware/asyncHandler.js` - Error Wrapper
Wraps async route handlers to automatically catch errors:
```javascript
router.post('/login', asyncHandler(async (req, res) => {
  // Errors automatically caught
}));
```

### `src/middleware/rateLimit.js` - Rate Limiting
Prevents API abuse with configurable limits:
- `authRateLimit()` - 5 requests per 15 minutes
- `apiRateLimit()` - 100 requests per minute

### `src/utils/logger.js` - Logging
Structured logging for debugging and monitoring:
```javascript
logger.info('User registered', { userId: user._id });
logger.error('Database error', error);
```

---

## 🚀 Adding New Routes

### 1. Create Controller
```javascript
// src/controllers/productController.js
import { asyncHandler } from '../middleware/asyncHandler.js';

export const getProducts = asyncHandler(async (req, res) => {
  const products = await Product.find();
  res.json({ success: true, data: products });
});
```

### 2. Create Routes
```javascript
// src/routes/api/products.js
import { Router } from 'express';
import { getProducts } from '../../controllers/productController.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

router.get('/', authenticate, getProducts);

export default router;
```

### 3. Register Routes
```javascript
// src/routes/index.js
import productRoutes from './api/products.js';

router.use('/products', productRoutes);
```

Now accessible at: `GET /api/v1/products`

---

## 🧪 Testing Endpoints

### Using cURL
```bash
# Health check
curl http://localhost:5000/health

# Register
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!","firstName":"John","lastName":"Doe"}'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!"}'
```

### Using Postman
1. Create new collection "HUSTLERS"
2. Create requests for each endpoint
3. Save authorization token from login response
4. Add `Authorization: Bearer {token}` header to protected routes

### Using Thunder Client (VS Code)
1. Install Thunder Client extension
2. Create requests for testing
3. Manage environment variables
4. View request history

---

## 🔧 Environment Variables

### Required
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT (>32 characters)

### Recommended
- `NODE_ENV` - development/production
- `PORT` - Server port (default: 5000)
- `ALLOWED_ORIGINS` - Frontend URLs

See `.env.example` for all options.

---

## 📊 Logs and Debugging

### View Logs
```bash
npm run dev
# Logs appear in console with timestamps
```

### Request Tracing
Every request gets a unique ID in logs:
```
[req-123e-456-789] POST /api/v1/auth/login
[req-123e-456-789] User login successful
```

### Error Logging
```javascript
logger.error('Operation failed', error);
// Logs: timestamp, error message, stack trace
```

---

## 🚀 Deployment

### Environment Setup
```bash
# Production .env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<strong-random-string>
ALLOWED_ORIGINS=https://yourdomain.com
```

### Install Dependencies
```bash
npm ci  # Uses package-lock.json for exact versions
```

### Start Server
```bash
npm start
# Server runs on specified PORT
```

### Monitoring
- Use `/health` endpoint for health checks
- Use `/ready` endpoint for readiness checks
- Setup log aggregation (ELK, Splunk)
- Setup error tracking (Sentry)
- Setup APM (New Relic, DataDog)

---

## 📚 Full Documentation

- **README.md** - Complete setup and features guide
- **ARCHITECTURE.md** - Design patterns and architecture
- **DEPENDENCIES.md** - Dependency explanation and recommendations

---

## 🆘 Troubleshooting

### Server won't start
- Check MongoDB is running: `mongod`
- Check port 5000 is available
- Check `.env` variables are correct
- Check Node.js version: `node --version`

### Rate limiting issues
- In-memory store cleared on restart
- Production should use Redis
- Check `src/middleware/rateLimit.js`

### Database connection error
- Verify MongoDB URI in `.env`
- Check MongoDB is running
- Check authentication credentials

### JWT errors
- Check JWT_SECRET is set in `.env`
- Check tokens are in Authorization header
- Check token hasn't expired

---

## 🎯 Next Steps

1. ✅ Backend running locally
2. Add more routes and models
3. Implement business logic
4. Add integration tests
5. Setup CI/CD pipeline
6. Deploy to production
7. Monitor and optimize

---

## 📝 Notes

- All timestamps are in UTC (ISO 8601 format)
- Responses always include `success`, `message`, `timestamp`
- Errors include helpful messages
- Request IDs help with debugging
- Rate limits are per-IP address

Enjoy building! 🚀
