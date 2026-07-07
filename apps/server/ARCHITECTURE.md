# Backend Architecture Guide

## 🏛️ Overall Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT REQUESTS                         │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │   SECURITY MIDDLEWARE           │
         │ ✓ Helmet (HTTP Headers)         │
         │ ✓ CORS (Cross-Origin)           │
         │ ✓ Rate Limiting                 │
         └───────────────┬────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │   REQUEST PROCESSING            │
         │ ✓ Request ID (Tracing)          │
         │ ✓ Body Parser (JSON/URL)        │
         │ ✓ Request Logging               │
         └───────────────┬────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │   VALIDATION & AUTH             │
         │ ✓ Input Validation              │
         │ ✓ JWT Authentication            │
         └───────────────┬────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │   ROUTE HANDLERS                │
         │ ✓ Controllers                   │
         │ ✓ Async Error Wrapper           │
         └───────────────┬────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │   BUSINESS LOGIC                │
         │ ✓ Services                      │
         │ ✓ Model Queries                 │
         │ ✓ Data Transformation           │
         └───────────────┬────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │   DATABASE LAYER                │
         │ ✓ Mongoose Models               │
         │ ✓ MongoDB                       │
         └───────────────┬────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │   ERROR HANDLING                │
         │ ✓ Global Error Handler          │
         │ ✓ Error Logging                 │
         └───────────────┬────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │   RESPONSE SENT TO CLIENT       │
         │ JSON with Status Code           │
         └─────────────────────────────────┘
```

## 📊 Request Flow Diagram

```
Request ──> Helmet ──> CORS ──> Rate Limit ──> Request ID ──> Body Parser ──> Logger
                                                                                    │
                                                                                    ▼
                                                                        Input Validation
                                                                                    │
                                                                                    ▼
                                                                        JWT Auth (if required)
                                                                                    │
                                                                                    ▼
                                                                        Route Handler (Controller)
                                                                                    │
                                                                                    ▼
                                                                        Async Error Wrapper
                                                                                    │
                                                                                    ▼
                                                                        Service Layer
                                                                                    │
                                                                                    ▼
                                                                        Database Query
                                                                                    │
                                                                        ┌───────────┴──────────┐
                                                                        │                      │
                                                                        ▼                      ▼
                                                                      Success              Error
                                                                        │                      │
                                                                        ▼                      ▼
                                                                    Send Response    Error Handler
                                                                                        │
                                                                                        ▼
                                                                                    Log Error
                                                                                        │
                                                                                        ▼
                                                                                  Send Error Response
```

## 🔄 Data Flow

### 1. Authentication Flow

```javascript
// 1. Client sends credentials
POST /api/v1/auth/login
{ email, password }
        │
        ├─> Request ID assigned
        ├─> Body parsed
        ├─> Input validated
        ├─> Controller receives
        │
        ▼
// 2. Service layer processes
authService.login(credentials)
        │
        ├─> Find user in database
        ├─> Compare password
        ├─> Generate JWT tokens
        │
        ▼
// 3. Response sent to client
{
  success: true,
  user: { id, email, role },
  accessToken: "jwt...",
  refreshToken: "jwt...",
  timestamp: "2024-01-01T00:00:00Z"
}
```

### 2. Async Error Handling Flow

```javascript
// Without async handler (❌ Don't do this)
router.post('/route', (req, res, next) => {
  try {
    const result = await asyncOperation(); // Might throw
    res.json(result);
  } catch (error) {
    next(error); // Must manually call next
  }
});

// With async handler (✓ Do this)
router.post('/route', asyncHandler(async (req, res) => {
  const result = await asyncOperation(); // Error automatically caught
  res.json(result);
}));
```

### 3. Error Handling Flow

```
Async Operation Throws
        │
        ▼
asyncHandler Catches
        │
        ▼
Error Middleware (next(error))
        │
        ▼
Error Handler Middleware
        │
        ├─> Check error type
        │   ├─> ApiError
        │   ├─> JWT Error
        │   ├─> Validation Error
        │   └─> Other Error
        │
        ├─> Log error
        │
        └─> Send JSON Response
            {
              success: false,
              message: "User friendly message",
              timestamp: "..."
            }
```

## 🎯 Design Patterns

### 1. Service Layer Pattern

```
Controller (Route Handler)
        │
        ├─> Validate input
        ├─> Call service
        ├─> Format response
        │
        ▼
Service (Business Logic)
        │
        ├─> Business logic
        ├─> Query models
        ├─> Transform data
        │
        ▼
Model (Data Access)
        │
        ├─> Database query
        ├─> Data validation
        ├─> Hooks/middleware
        │
        ▼
Database
```

### 2. Middleware Chain Pattern

```javascript
// Request goes through middleware chain in order
app.use(middleware1); // Security
app.use(middleware2); // Parsing
app.use(middleware3); // Validation
app.use(routes);      // Routes
app.use(middleware4); // Error handling (MUST BE LAST)

// Middleware can:
// - next() → continue to next middleware
// - res.send() → send response (skip rest)
// - next(error) → jump to error handler
```

### 3. Controller-Service-Model Pattern

```javascript
// controllers/userController.js
export function getUser(asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  res.json(user);
}));

// services/userService.js
export async function getUserById(id) {
  return await User.findById(id);
}

// models/User.js
const userSchema = new Schema({ ... });
export const User = model('User', userSchema);
```

## 🔐 Security Best Practices

### 1. Helmet Headers
Automatically set security headers:
- `X-Frame-Options` - Prevents clickjacking
- `X-XSS-Protection` - XSS protection
- `X-Content-Type-Options` - MIME type safety
- `Strict-Transport-Security` - HTTPS enforcement

### 2. CORS Configuration
```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS, // Whitelist specific origins
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### 3. Rate Limiting
```javascript
// Prevent brute force attacks
authRateLimit() // 5 requests per 15 minutes for login
apiRateLimit()  // 100 requests per minute for API
```

### 4. JWT Authentication
```javascript
// Access tokens: Short-lived (7 days)
// Refresh tokens: Long-lived (30 days)
// Store in httpOnly cookies in production

const token = generateAccessToken({ userId, email, role });
```

### 5. Password Hashing
```javascript
// bcryptjs: Automatic salt + hash
const hashed = await bcrypt.hash(password, 10); // 10 salt rounds
const isValid = await bcrypt.compare(password, hashed);
```

### 6. Input Validation
```javascript
// Validate on two levels:
// 1. Schema validation (Joi)
// 2. Database validation (Mongoose)

validateRequest([
  { field: 'email', type: 'email', required: true },
  { field: 'password', type: 'string', minLength: 8 },
]);
```

## 📈 Scalability Considerations

### 1. Rate Limiting at Scale
```javascript
// Current: In-memory store
// Production: Use Redis
import redis from 'redis';
const client = redis.createClient();

// Redis maintains rate limit state across multiple server instances
```

### 2. Session Management
```javascript
// Current: JWT only
// Production: Add Redis sessions for quick logout
// Store: { token: true } in Redis with expiry
```

### 3. Caching
```javascript
// Cache frequently accessed data
const cacheKey = `user:${userId}`;
const cached = await redis.get(cacheKey);
if (cached) return cached;

// Cache with expiry
await redis.setex(cacheKey, 3600, JSON.stringify(user));
```

### 4. Database Indexing
```javascript
// Create indexes for frequently queried fields
userSchema.index({ email: 1 }); // Unique email lookup
userSchema.index({ createdAt: -1 }); // Sorting by date
userSchema.index({ status: 1, createdAt: -1 }); // Compound index
```

### 5. Logging & Monitoring
```javascript
// Structured logging for analysis
logger.info('User login', {
  userId: user._id,
  email: user.email,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  timestamp: new Date().toISOString(),
});

// Send to Elasticsearch/ELK for analysis
// Send to Sentry for error tracking
```

## 🧪 Testing Strategy

### Unit Tests
```javascript
// Test individual functions
describe('AuthService', () => {
  it('should hash password', async () => {
    const hash = await hashPassword('password123');
    expect(hash).not.toEqual('password123');
  });
});
```

### Integration Tests
```javascript
// Test API endpoints with database
describe('POST /api/v1/auth/login', () => {
  it('should return user and tokens', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.com', password: 'password123' });
    
    expect(response.body.accessToken).toBeDefined();
  });
});
```

## 📋 Deployment Checklist

- [ ] All secrets in environment variables
- [ ] Database backups configured
- [ ] Monitoring set up (error tracking, APM)
- [ ] Logging configured (centralized)
- [ ] Rate limiting with Redis
- [ ] Load balancing configured
- [ ] Health check endpoints verified
- [ ] HTTPS enabled
- [ ] CORS origins set correctly
- [ ] JWT secrets rotated
- [ ] Database indexes created
- [ ] Error handling tested
- [ ] Performance benchmarks done
- [ ] Security headers verified
- [ ] CI/CD pipeline working

## 🔗 Related Documentation

- `README.md` - Setup and usage guide
- `src/config/constants.js` - HTTP status codes and messages
- `src/middleware/` - Detailed middleware documentation
- `.env.example` - Environment variable reference
