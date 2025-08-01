import { NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { env } from "~/env";
import * as postmark from "postmark";

export const dynamic = "force-dynamic";

const client = new postmark.ServerClient(env.POSTMARK_API_TOKEN);

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    
    // In production, Vercel provides a special header for cron jobs
    // For development, we can check for a basic auth or skip this check
    if (env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const now = new Date();
    
    // Find all scheduled emails that are due to be sent
    const dueEmails = await db.scheduledEmail.findMany({
      where: {
        status: "scheduled",
        scheduledFor: {
          lte: now,
        },
      },
      take: 100, // Process max 100 emails per run to avoid timeouts
    });

    console.log(`Found ${dueEmails.length} emails to process`);

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
    };

    for (const email of dueEmails) {
      try {
        results.processed++;
        
        // Mark as processing to avoid duplicate processing
        await db.scheduledEmail.update({
          where: { id: email.id },
          data: { status: "processing" },
        });

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
            errorMessage: errorMessage,
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
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}