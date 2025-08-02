import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

export const emailRouter = createTRPCRouter({
  schedule: protectedProcedure
    .input(
      z.object({
        recipientEmail: z.string().email(),
        subject: z.string().min(1).max(250),
        content: z.string().min(1).max(10000),
        scheduledFor: z.date().refine((d) => d.getTime() > Date.now(), {
          message: "scheduledFor must be in the future",
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.scheduledEmail.create({
        data: {
          userId: ctx.session.user.id,
          recipientEmail: input.recipientEmail,
          subject: input.subject,
          content: input.content,
          scheduledFor: input.scheduledFor,
          status: "scheduled",
        },
      });
    }),

  getScheduled: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.scheduledEmail.findMany({
        where: { userId: ctx.session.user.id },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { scheduledFor: "desc" },
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (items.length > input.limit) {
        const nextItem = items.pop();
        nextCursor = nextItem!.id;
      }

      return {
        items,
        nextCursor,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const email = await ctx.db.scheduledEmail.findFirst({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
      });

      return email;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const email = await ctx.db.scheduledEmail.findFirst({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
          status: "scheduled",
        },
      });

      if (!email) {
        throw new Error("Email not found or cannot be cancelled");
      }

      return ctx.db.scheduledEmail.update({
        where: { id: input.id },
        data: { status: "cancelled" },
      });
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const [scheduled, sent, failed] = await Promise.all([
      ctx.db.scheduledEmail.count({
        where: { userId: ctx.session.user.id, status: "scheduled" },
      }),
      ctx.db.scheduledEmail.count({
        where: { userId: ctx.session.user.id, status: "sent" },
      }),
      ctx.db.scheduledEmail.count({
        where: { userId: ctx.session.user.id, status: "failed" },
      }),
    ]);

    return { scheduled, sent, failed };
  }),
});
