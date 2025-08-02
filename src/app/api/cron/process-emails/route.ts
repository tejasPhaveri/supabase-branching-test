import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { env } from "~/env";
import * as postmark from "postmark";

export const dynamic = "force-dynamic";

const client = new postmark.ServerClient(env.POSTMARK_API_TOKEN);

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const vercelCronHeader = request.headers.get("x-vercel-cron");

    // Authorization: In production, accept either Vercel Cron header or Bearer token matching CRON_SECRET.
    // In non-production: require Bearer if CRON_SECRET is set, else allow.
    const bearer = `Bearer ${env.CRON_SECRET ?? ""}`;
    const isAuthorizedProd =
      (vercelCronHeader === "1") || (!!env.CRON_SECRET && authHeader === bearer);
    const isAuthorizedDev =
      env.CRON_SECRET ? authHeader === bearer : true;

    if (env.NODE_ENV === "production" ? !isAuthorizedProd : !isAuthorizedDev) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const now = new Date();

    // Reset stale processing rows older than 15 minutes back to 'scheduled'
    // Requires updatedAt column on ScheduledEmail for accurate staleness detection.
    try {
      await db.$executeRawUnsafe(`
        UPDATE "public"."ScheduledEmail"
        SET "status" = 'scheduled'
        WHERE "status" = 'processing'
          AND "updatedAt" < NOW() - INTERVAL '15 minutes'
      `);
    } catch (e) {
      // Log but don't fail the whole run
      console.error("Stale processing reset failed", e);
    }

    // Atomically claim up to 100 due emails by setting status to 'processing' and returning them.
    // Using ORDER BY scheduledFor ensures older emails are processed first.
    const claimed = await db.$queryRawUnsafe<Array<{
      id: string;
      userId: string;
      recipientEmail: string;
      subject: string;
      content: string;
      scheduledFor: Date;
      status: string;
      createdAt: Date;
      sentAt: Date | null;
      errorMessage: string | null;
    }>>(`
      UPDATE "public"."ScheduledEmail" AS s
      SET "status" = 'processing'
      WHERE s."id" IN (
        SELECT id
        FROM "public"."ScheduledEmail"
        WHERE "status" = 'scheduled'
          AND "scheduledFor" <= NOW()
        ORDER BY "scheduledFor" ASC
        LIMIT 100
        FOR UPDATE
      )
      RETURNING s.*
    `);

    console.log(`Claimed ${claimed.length} scheduled emails to process`);

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
    };

    for (const email of claimed) {
      try {
        results.processed++;

        // Send email via Postmark
        await client.sendEmail({
          From: env.POSTMARK_FROM_EMAIL,
          To: email.recipientEmail,
          Subject: email.subject,
          TextBody: email.content,
          MessageStream: "outbound",
        });

        // Mark as sent
        await db.scheduledEmail.update({
          where: { id: email.id },
          data: {
            status: "sent",
            sentAt: new Date(),
            errorMessage: null,
          },
        });

        results.sent++;
        console.log(`Successfully sent email ${email.id} to ${email.recipientEmail}`);
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        console.error(`Failed to send email ${email.id}:`, errorMessage);

        // Mark as failed and store error message
        await db.scheduledEmail.update({
          where: { id: email.id },
          data: {
            status: "failed",
            errorMessage,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
