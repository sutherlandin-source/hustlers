import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

dotenv.config({ path: ".env" });

const email = "admin@hustlers.com";
const plainPassword = "password123";
const phone = "admin-seed-phone";

const client = new MongoClient(process.env.MONGODB_URI);

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "hustlers");
  const users = db.collection("users");
  const password = await bcrypt.hash(plainPassword, 10);
  const now = new Date();

  const result = await users.updateOne(
    { email },
    {
      $set: {
        password,
        role: "admin",
        firstName: "Platform",
        lastName: "Admin",
        isActive: true,
        isEmailVerified: true,
        phone,
        phoneNumber: phone,
        updatedAt: now,
      },
      $setOnInsert: {
        email,
        createdAt: now,
        __v: 0,
      },
    },
    { upsert: true }
  );

  const user = await users.findOne(
    { email },
    {
      projection: {
        email: 1,
        role: 1,
        isActive: 1,
        isEmailVerified: 1,
        password: 1,
      },
    }
  );

  console.log(
    JSON.stringify(
      {
        action: result.upsertedCount ? "created" : "updated",
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        passwordLooksBcrypt: /^\$2[aby]\$/.test(user.password || ""),
      },
      null,
      2
    )
  );
} finally {
  await client.close();
}
