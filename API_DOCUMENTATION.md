# Job Platform API Documentation

## Overview

This is a comprehensive API documentation for the Job Platform project. The API provides authentication, user management, file uploads, and chat functionality.

## Base URL

```
http://localhost:5000/api
```

## Authentication

Most endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

---

## 🔐 Authentication Endpoints

### 1. User Registration

**POST** `/auth/register`

Register a new user account with profile photo upload.

**Request Body (multipart/form-data):**

```json
{
  "name": "string (required)",
  "email": "string (required)",
  "password": "string (required)",
  "role": "string (required)",
  "photo": "file (optional)"
}
```

**Response:**

- **201 Created:**
  ```json
  {
    "message": "User registered. Check email to verify."
  }
  ```
- **400 Bad Request:**
  ```json
  {
    "error": "Email already exists"
  }
  ```

**Features:**

- Password hashing with bcrypt
- Email verification token generation
- Profile photo upload support
- Input validation

---

### 2. Email Verification

**GET** `/auth/verify-email`

Verify user email using the token sent during registration.

**Query Parameters:**

```
?token=<verification_token>
```

**Response:**

- **200 OK:**
  ```json
  {
    "message": "Email verified successfully!"
  }
  ```
- **400 Bad Request:**
  ```json
  {
    "error": "Invalid token"
  }
  ```

---

### 3. User Login

**POST** `/auth/login`

Authenticate user and receive JWT token.

**Request Body:**

```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

**Response:**

- **200 OK:**
  ```json
  {
    "token": "jwt_token_string",
    "user": {
      "name": "string",
      "role": "string",
      "email": "string"
    }
  }
  ```
- **400 Bad Request:**
  ```json
  {
    "error": "Invalid credentials or email not verified"
  }
  ```

**Features:**

- Password verification
- Email verification check
- JWT token generation (7 days expiry)

---

### 4. Forgot Password

**POST** `/auth/forgot-password`

Request password reset link via email.

**Request Body:**

```json
{
  "email": "string (required)"
}
```

**Response:**

- **200 OK:**
  ```json
  {
    "message": "Password reset link sent to your email."
  }
  ```
- **404 Not Found:**
  ```json
  {
    "error": "User not found"
  }
  ```

**Features:**

- Reset token generation
- Email with reset link
- Token expiry (1 hour)

---

### 5. Reset Password

**POST** `/auth/reset-password`

Reset password using the token from email.

**Request Body:**

```json
{
  "token": "string (required)",
  "newPassword": "string (required)"
}
```

**Response:**

- **200 OK:**
  ```json
  {
    "success": true,
    "message": "Password reset successful"
  }
  ```
- **400 Bad Request:**
  ```json
  {
    "error": "Invalid or expired token."
  }
  ```

---

### 6. Upload Profile Photo

**POST** `/auth/upload-photo`

Upload or update user profile photo (requires authentication).

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Request Body (multipart/form-data):**

```
photo: file (required)
```

**Response:**

- **200 OK:**
  ```json
  {
    "message": "Profile photo updated successfully",
    "photo": "file_path_or_url"
  }
  ```
- **400 Bad Request:**
  ```json
  {
    "error": "No photo uploaded"
  }
  ```

---

### 7. Protected Route Example

**GET** `/auth/protected`

Example of a protected route that requires authentication.

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response:**

- **200 OK:**
  ```json
  {
    "message": "You are authorized",
    "user": {
      "id": "user_id",
      "role": "user_role"
    }
  }
  ```

---

## 📁 File Upload Endpoints

### 1. Image Upload

**POST** `/upload/image`

Upload an image file (general purpose).

**Request Body (multipart/form-data):**

```
file: file (required)
```

**Response:**

- **200 OK:**
  ```json
  {
    "message": "Upload successful",
    "url": "file_path"
  }
  ```
- **400 Bad Request:**
  ```json
  {
    "error": "No file uploaded"
  }
  ```

---

## 💬 Chat Endpoints

### 1. Send Chat Message

**POST** `/chat`

Send a chat message (requires RabbitMQ).

**Request Body:**

```json
{
  "senderId": "string (required)",
  "receiverId": "string (required)",
  "message": "string (required)"
}
```

**Response:**

- **200 OK:**
  ```json
  {
    "status": "sent"
  }
  ```

**Features:**

- Message queuing with RabbitMQ
- Timestamp tracking
- Asynchronous processing

---

## 🧪 Test Endpoint

### 1. Health Check

**GET** `/test`

Simple health check endpoint.

**Response:**

- **200 OK:**
  ```json
  {
    "message": "Test route is working!...... 🚀"
  }
  ```

---

## 🔧 Middleware

### 1. Authentication Middleware

- **File:** `src/middlewares/authMiddleware.ts`
- **Purpose:** Verifies JWT tokens and adds user data to request
- **Usage:** Applied to protected routes

### 2. Input Validation Middleware

- **File:** `src/middlewares/validateRegisterInput.ts`
- **Purpose:** Validates required fields for user registration
- **Usage:** Applied to registration endpoint

### 3. File Upload Middleware

- **File:** `src/middlewares/upload.ts`
- **Purpose:** Handles multipart/form-data file uploads
- **Usage:** Applied to photo upload endpoints

---

## 📊 Data Models

### User Model

```typescript
interface IUser {
  name: string; // Required
  email: string; // Required, unique
  password: string; // Required, hashed
  role: string; // Required
  isVerified: boolean; // Default: false
  verificationToken?: string; // For email verification
  resetPasswordToken?: string; // For password reset
  resetPasswordExpires?: Date; // Token expiry
  photo?: string; // Profile photo URL/path
}
```

---

## 🚀 Getting Started

### 1. Start the Server

```bash
npm run dev
```

### 2. Environment Variables Required

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/job-platform
JWT_SECRET=your_jwt_secret_key
RABBITMQ_URL=amqp://localhost:5672 (optional)
```

### 3. Start Dependencies (Optional)

```bash
# Start MongoDB and RabbitMQ with Docker
docker-compose -f docker-compose.dev.yml up -d
```

---

## 🔒 Security Features

- **Password Hashing:** bcrypt with salt rounds
- **JWT Authentication:** Secure token-based auth
- **Email Verification:** Required before login
- **Password Reset:** Secure token-based reset
- **Input Validation:** Server-side validation
- **File Upload Security:** Controlled file handling

---

## 📧 Email Integration

The API integrates with email services for:

- User registration verification
- Password reset links

**Note:** Email functionality requires proper SMTP configuration in environment variables.

---

## 🐰 RabbitMQ Integration

- **Purpose:** Message queuing for chat functionality
- **Port:** 5672 (default)
- **Management UI:** http://localhost:15672
- **Credentials:** admin/admin (development)

**Note:** Chat functionality works without RabbitMQ but messages won't be queued.

---

## 🧪 Testing the API

### 1. Test Registration

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -F "name=Test User" \
  -F "email=test@example.com" \
  -F "password=password123" \
  -F "role=user" \
  -F "photo=@profile.jpg"
```

### 2. Test Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 3. Test Protected Route

```bash
curl -X GET http://localhost:5000/api/auth/protected \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 📝 Error Handling

All endpoints return consistent error responses:

- **400:** Bad Request (validation errors, missing fields)
- **401:** Unauthorized (invalid/missing token)
- **404:** Not Found (user not found)
- **500:** Internal Server Error (server issues)

---

## 🔄 API Versioning

Currently using version 1.0.0. Future versions can be added by prefixing routes with `/v2/`, `/v3/`, etc.

---

## 📞 Support

For API support or questions, refer to the project documentation or contact the development team.
