import dotenv from "dotenv";
import path from "path";

// Load `.env` from the project root reliably, even if the server is started
// from a different working directory.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

// export them for easier import
export default {
  port: process.env.PORT || 5000,
  database_url: process.env.MONGODB_URI,
  database_name: process.env.MONGODB_DB_NAME,
  users_db_name: process.env.MONGODB_USERS_DB_NAME,
  posts_db_name: process.env.POSTS_DB_NAME,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS || 12,
  jwt_secret: process.env.JWT_SECRET,
  jwt_expires_in: process.env.JWT_EXPIRES_IN,
  gemini_api_key: process.env.GEMINI_API_KEY,
  gemini_model: process.env.GEMINI_MODEL,
  google_client_id: process.env.GOOGLE_CLIENT_ID,
  google_client_secret: process.env.GOOGLE_CLIENT_SECRET,
  cloudinary_cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinary_api_key:
    process.env.CLOUDINARY_API_KEY ?? process.env.CLOUDINARY_API_KEY,
  cloudinary_secret: process.env.CLOUDINARY_SECRET,
  cloudinary_db_name: process.env.CLOUDINARY_DB_NAME,
};
