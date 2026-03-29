import bcrypt from "bcrypt";
import { Schema } from "mongoose";
import config from "../config";
import { getDbModel } from "./db";
import { IUser } from "../types/user.interface";

// create user schema
const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    // Optional handle shown in UI. Kept sparse so legacy users without username can coexist.
    username: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      trim: true,
    },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false, select: false },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    image: { type: String, required: true },
    bio: { type: String, required: false },
    googleId: { type: String, sparse: true },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    refreshToken: { type: String, default: null },
    // Friend/user connections. Stored as user ObjectId references.
    friends: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  },
  {
    timestamps: true,
    collection: "users",
  },
);

// Hash passwords on create/update when the password field changes.
userSchema.pre("save", async function () {
  const user = this;

  if (!user.isModified("password")) return;
  if (!user.password) return;

  user.password = await bcrypt.hash(
    user.password as string,
    Number(config.bcrypt_salt_rounds),
  );
});

userSchema.post("save", function (user, next) {
  console.log(
    `[Post-Save Hook]: A new user was created with email: ${user.email}`,
  );

  // Prevent leaking hashed password via the returned document instance.
  user.password = "";

  next();
});

export function getUserModel(dbName?: string) {
  return getDbModel<IUser>(
    "User",
    userSchema,
    dbName || config.users_db_name || config.database_name,
  );
}

export const User = getUserModel();
