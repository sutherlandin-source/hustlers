# Backend Dependencies Guide

## 📦 Complete Dependency List

### Production Dependencies

#### Core Framework
- **express** (^4.18.2) - Web server framework
  - Handles HTTP requests/responses
  - Routing
  - Middleware system
  - https://expressjs.com

#### Database
- **mongoose** (^7.5.1) - MongoDB object mapper
  - Schema validation
  - Data modeling
  - Query builder
  - Hooks/middleware
  - https://mongoosejs.com

#### Authentication & Security
- **bcryptjs** (^2.4.3) - Password hashing
  - Secure password storage
  - Salt generation
  - Comparison for login
  - Pure JavaScript (works everywhere)
  
- **jsonwebtoken** (^9.0.3) - JWT token generation
  - Create access tokens
  - Create refresh tokens
  - Verify tokens
  - Decode payloads
  - https://jwt.io

#### Security Middleware
- **helmet** (^7.1.0) - HTTP security headers
  - X-Frame-Options (clickjacking)
  - X-XSS-Protection (XSS attacks)
  - X-Content-Type-Options (MIME type)
  - Content-Security-Policy (CSP)
  - Strict-Transport-Security (HTTPS)
  - https://helmetjs.github.io

- **cors** (^2.8.5) - Cross-Origin Resource Sharing
  - Handle requests from different origins
  - Whitelist specific domains
  - Allow credentials
  - Configure allowed headers
  - https://github.com/expressjs/cors

#### Configuration
- **dotenv** (^16.4.0) - Environment variables
  - Load .env file
  - Access via process.env
  - Local development
  - Different configs per environment
  - https://github.com/motdotla/dotenv

#### Utilities
- **uuid** (^9.0.1) - Unique ID generation
  - Request IDs (tracing)
  - User IDs
  - Transaction IDs
  - Pure JavaScript implementation
  - https://github.com/uuidjs/uuid

- **joi** (^17.11.0) - Schema validation
  - Validate request data
  - Type checking
  - Custom rules
  - Error messages
  - https://joi.dev

- **express-async-errors** (^3.1.1) - Async error handling
  - Automatically catch async/await errors
  - Works with middleware
  - Simplifies error handling
  - https://github.com/davidyaha/express-async-errors

### Development Dependencies

```json
{
  "devDependencies": {
    "nodemon": "^3.0.1",        // Auto-reload on file changes
    "eslint": "^8.57.0",         // Code linting
    "eslint-config-prettier": "^9.0.0",  // Prettier integration
    "eslint-plugin-import": "^2.30.0",   // Import rules
    "eslint-plugin-react": "^7.37.5",    // React rules (if needed)
    "eslint-plugin-react-hooks": "^4.6.0", // Hooks rules
    "prettier": "^3.8.3"         // Code formatting
  }
}
```

## 🚀 Recommended Additional Dependencies

### For Production

#### Logging & Monitoring
```bash
npm install winston    # Structured logging
npm install morgan     # HTTP request logging
npm install sentry     # Error tracking
```

#### Performance
```bash
npm install compression  # Response compression
npm install redis       # Caching & session store
npm install bull        # Job queue
```

#### API Documentation
```bash
npm install swagger-ui-express  # API documentation
npm install swagger-jsdoc       # JSDoc to Swagger
```

#### Testing
```bash
npm install jest         # Testing framework
npm install supertest    # HTTP assertion
npm install mongo-memory-server  # In-memory MongoDB
```

#### Database
```bash
npm install redis        # Caching
npm install elasticsearch # Full-text search
```

### Installation Commands

```bash
# Logging
npm install winston morgan

# Performance
npm install compression redis bull

# API Docs
npm install swagger-ui-express swagger-jsdoc

# Testing
npm install --save-dev jest supertest mongo-memory-server

# Data Validation
npm install validator
```

## 📊 Dependency Tree

```
Express App
├── express (web server)
│   ├── helmet (security headers)
│   ├── cors (cross-origin)
│   └── middleware...
│
├── mongoose (database)
│   ├── MongoDB driver
│   └── Schema validation
│
├── jsonwebtoken (auth)
│   └── Token generation
│
├── bcryptjs (passwords)
│   └── Password hashing
│
├── dotenv (config)
│   └── Environment variables
│
├── joi (validation)
│   └── Schema validation
│
├── uuid (IDs)
│   └── Unique identifier generation
│
└── express-async-errors (error handling)
    └── Async error wrapper
```

## 🔧 Configuration by Environment

### Development
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.5.1",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.3",
    "helmet": "^7.1.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.0",
    "uuid": "^9.0.1",
    "joi": "^17.11.0",
    "express-async-errors": "^3.1.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "eslint": "^8.57.0",
    "prettier": "^3.8.3"
  }
}
```

### Production
```json
{
  "dependencies": {
    // All above, plus:
    "compression": "^1.7.4",
    "helmet": "^7.1.0",
    "redis": "^4.6.12",
    "winston": "^3.11.0",
    "morgan": "^1.10.0",
    "joi": "^17.11.0"
  },
  "devDependencies": {
    // Testing and linting only
    "jest": "^29.7.0",
    "supertest": "^6.3.3"
  }
}
```

## 📈 Dependency Version Management

### Semver Rules

```
Version: MAJOR.MINOR.PATCH
Example: 4.18.2

^ (Caret)    - Compatible with version
  ^4.18.2    - >=4.18.2 <5.0.0

~ (Tilde)    - Approximately equivalent
  ~4.18.2    - >=4.18.2 <4.19.0

* (Wildcard) - Any version
  *          - Latest

= (Exact)    - Exact version
  =4.18.2    - Only 4.18.2
```

### Update Strategy

```bash
# Check for updates
npm outdated

# Update to latest minor/patch
npm update

# Update to latest major (breaking changes!)
npm install express@latest

# Update specific package
npm install mongoose@latest

# Lock versions
npm ci  # Uses package-lock.json
```

## 🔒 Security Considerations

### Vulnerable Packages
- Always run `npm audit` to check vulnerabilities
- Fix critical/high vulnerabilities immediately
- Use `npm audit fix` for automatic fixes
- Review breaking changes before updating

### Best Practices
1. **Keep dependencies updated**
   ```bash
   npm audit
   npm update
   ```

2. **Use exact versions in production**
   ```bash
   npm ci  # Install exact versions from package-lock.json
   ```

3. **Minimize dependencies**
   - Each dependency is a security risk
   - Only install what you need
   - Consider alternatives for large packages

4. **Lock file in git**
   - Commit `package-lock.json`
   - Ensures consistent installations
   - Prevents dependency drift

## 📚 Documentation Links

- **Express**: https://expressjs.com/en/api/express.html
- **Mongoose**: https://mongoosejs.com/docs/models.html
- **JWT**: https://tools.ietf.org/html/rfc7519
- **Helmet**: https://helmetjs.github.io/docs/
- **CORS**: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- **bcryptjs**: https://github.com/dcodeIO/bcrypt.js
- **UUID**: https://tools.ietf.org/html/rfc4122
- **Joi**: https://joi.dev/api/

## 🎯 Recommended Next Steps

1. **Add logging**: Winston or Pino
2. **Add caching**: Redis
3. **Add job queue**: Bull or RabbitMQ
4. **Add API docs**: Swagger/OpenAPI
5. **Add tests**: Jest + Supertest
6. **Add monitoring**: Sentry + DataDog
7. **Add metrics**: Prometheus
8. **Add database migration**: Mongoose migrations

## ⚠️ Notes

- All versions use `^` which allows updates to MINOR and PATCH
- Test after updating dependencies
- Document breaking changes
- Use `npm ci` in CI/CD pipelines
- Keep Node.js version up to date
- Review security advisories regularly
