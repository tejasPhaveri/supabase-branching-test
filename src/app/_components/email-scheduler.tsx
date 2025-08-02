"use client";

import { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

import { api } from "~/trpc/react";

export function EmailScheduler() {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [scheduledFor, setScheduledFor] = useState<Date | null>(new Date());

  const utils = api.useUtils();
  const scheduleEmail = api.email.schedule.useMutation({
    onSuccess: async () => {
      await utils.email.invalidate();
      // Reset form
      setRecipientEmail("");
      setSubject("");
      setContent("");
      setScheduledFor(new Date());
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledFor || !recipientEmail || !subject || !content) return;

    // Ensure scheduled time is in the future
    const now = new Date();
    if (scheduledFor.getTime() <= now.getTime()) {
      return;
    }

    scheduleEmail.mutate({
      recipientEmail,
      subject,
      content,
      scheduledFor,
    });
  };

  return (
    <div className="w-full max-w-2xl">
      <h2 className="mb-6 text-3xl font-bold text-white">Schedule Email</h2>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="recipientEmail" className="mb-2 block text-sm font-medium text-white">
            Recipient Email
          </label>
          <input
            id="recipientEmail"
            type="email"
            placeholder="recipient@example.com"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            className="w-full rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/60 focus:bg-white/20 focus:outline-none"
            required
          />
        </div>

        <div>
          <label htmlFor="subject" className="mb-2 block text-sm font-medium text-white">
            Subject
          </label>
          <input
            id="subject"
            type="text"
            placeholder="Email subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/60 focus:bg-white/20 focus:outline-none"
            required
          />
        </div>

        <div>
          <label htmlFor="content" className="mb-2 block text-sm font-medium text-white">
            Message
          </label>
          <textarea
            id="content"
            placeholder="Your email message"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="w-full rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/60 focus:bg-white/20 focus:outline-none resize-none"
            required
          />
        </div>

        <div>
          <label htmlFor="scheduledFor" className="mb-2 block text-sm font-medium text-white">
            Schedule For
          </label>
          <div className="relative">
            <DatePicker
              id="scheduledFor"
              selected={scheduledFor}
              onChange={(date) => setScheduledFor(date)}
              showTimeSelect
              dateFormat="MMMM d, yyyy h:mm aa"
              minDate={new Date()}
              minTime={new Date()}
              maxTime={new Date(new Date().setHours(23, 59, 59, 999))}
              className="w-full rounded-lg bg-white/10 px-4 py-2 text-white placeholder-white/60 focus:bg-white/20 focus:outline-none"
              calendarClassName="bg-slate-800 border-slate-700"
              required
            />
          </div>
        </div>

        <div className="text-xs text-white/70">
          Times are interpreted in your local timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </div>

        <button
          type="submit"
          className="rounded-lg bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
          disabled={scheduleEmail.isPending || !scheduledFor || !recipientEmail || !subject || !content || (scheduledFor ? scheduledFor.getTime() <= Date.now() : true)}
        >
          {scheduleEmail.isPending ? "Scheduling..." : "Schedule Email"}
        </button>

        {scheduleEmail.error && (
          <div className="rounded-lg bg-red-500/20 px-4 py-2 text-red-200">
            Error: {scheduleEmail.error.message}
          </div>
        )}

        {scheduleEmail.isSuccess && (
          <div className="rounded-lg bg-green-500/20 px-4 py-2 text-green-200">
            Email scheduled successfully!
          </div>
        )}
      </form>
    </div>
  );
}
