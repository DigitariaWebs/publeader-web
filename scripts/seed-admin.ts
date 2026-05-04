import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@driveads.local";
  const password = process.env.ADMIN_PASSWORD ?? "admin123!";
  const name = process.env.ADMIN_NAME ?? "Admin";

  const existing = await db.collection("user").findOne({ email });
  if (existing) {
    await db.collection("user").updateOne(
      { _id: existing._id },
      {
        $set: {
          role: "admin",
          status: "validated",
          emailVerified: true,
        },
      },
    );
    console.log(`Admin already exists, promoted: ${email}`);
    process.exit(0);
  }

  const result = await auth.api.signUpEmail({
    body: { email, password, name },
    asResponse: false,
  });

  await db.collection("user").updateOne(
    { _id: result.user.id } as never,
    {
      $set: {
        role: "admin",
        status: "validated",
        emailVerified: true,
      },
    },
  );

  console.log(`Admin created: ${email} / ${password}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
