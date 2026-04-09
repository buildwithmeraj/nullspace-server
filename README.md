# NullSpace Server

Backend API for NullSpace, a developer-focused social platform.  
Built with Express, TypeScript, MongoDB, JWT auth, Google OAuth, Socket.IO, and Cloudinary uploads.

- Live API: [https://nullspace-server.onrender.com/](https://nullspace-server.onrender.com/)
- Live Frontend: [https://nullspace-ten.vercel.app/](https://nullspace-ten.vercel.app/)
- Frontend Repo: [https://github.com/buildwithmeraj/](https://github.com/buildwithmeraj/)

## Project Details

- REST API for authentication, users, posts, comments, reactions, friends, and notifications.
- JWT access/refresh token flow with protected routes.
- Real-time notification support via Socket.IO.
- Media upload handling with Cloudinary.

## Features

- Email/password login and Google OAuth login.
- User profile update and discovery endpoints.
- Create/read/update/delete post workflows.
- Post reactions and threaded comment flows.
- Friend request, accept/reject, and suggestions.
- Notification APIs and optional AI helper endpoints.

## Setup Instructions

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file with required values:

```env
PORT=5000
CLIENT_URL=http://localhost:3000
SERVER_URL=http://localhost:5000

MONGODB_URI=your_mongodb_uri
MONGODB_DB_NAME=nullspace
MONGODB_USERS_DB_NAME=users
POSTS_DB_NAME=posts

JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
JWT_EXPIRES_IN=1d
BCRYPT_SALT_ROUNDS=12

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_SECRET=your_api_secret
```

3. Run in development:

```bash
npm run dev
```

4. For production:

```bash
npm run build
npm start
```
