"use client";

import { api } from "~/trpc/react";

export function EmailDashboard() {
  const { data: emailStats } = api.email.getStats.useQuery();
  const { data: scheduledEmailsData, isLoading } = api.email.getScheduled.useQuery({
    limit: 10,
  });

  const utils = api.useUtils();
  const cancelEmail = api.email.cancel.useMutation({
    onSuccess: async () => {
      await utils.email.invalidate();
    },
  });

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-500/20 text-blue-200';
      case 'processing':
        return 'bg-yellow-500/20 text-yellow-200';
      case 'sent':
        return 'bg-green-500/20 text-green-200';
      case 'failed':
        return 'bg-red-500/20 text-red-200';
      case 'cancelled':
        return 'bg-gray-500/20 text-gray-200';
      default:
        return 'bg-gray-500/20 text-gray-200';
    }
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl">
        <div className="text-center text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl">
      <h2 className="mb-6 text-3xl font-bold text-white">Email Dashboard</h2>
      
      {/* Stats Cards */}
      {emailStats && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-white/10 p-4">
            <h3 className="text-lg font-semibold text-white">Scheduled</h3>
            <p className="text-2xl font-bold text-blue-300">{emailStats.scheduled}</p>
          </div>
          <div className="rounded-lg bg-white/10 p-4">
            <h3 className="text-lg font-semibold text-white">Sent</h3>
            <p className="text-2xl font-bold text-green-300">{emailStats.sent}</p>
          </div>
          <div className="rounded-lg bg-white/10 p-4">
            <h3 className="text-lg font-semibold text-white">Failed</h3>
            <p className="text-2xl font-bold text-red-300">{emailStats.failed}</p>
          </div>
        </div>
      )}

      {/* Email List */}
      <div className="rounded-lg bg-white/10 p-6">
        <h3 className="mb-4 text-xl font-semibold text-white">Recent Emails</h3>
        
        {scheduledEmailsData?.items.length === 0 ? (
          <p className="text-center text-white/60">No emails found.</p>
        ) : (
          <div className="space-y-4">
            {scheduledEmailsData?.items.map((email) => (
              <div
                key={email.id}
                className="flex flex-col gap-3 rounded-lg bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(email.status)}`}>
                      {email.status}
                    </span>
                    <span className="text-sm text-white/80">
                      to {email.recipientEmail}
                    </span>
                  </div>
                  <h4 className="mt-1 font-medium text-white">{email.subject}</h4>
                  <div className="mt-1 flex flex-col gap-1 text-sm text-white/60 sm:flex-row sm:gap-4">
                    <span>Scheduled: {formatDate(email.scheduledFor)}</span>
                    {email.sentAt && (
                      <span>Sent: {formatDate(email.sentAt)}</span>
                    )}
                  </div>
                  {email.errorMessage && (
                    <p className="mt-1 text-sm text-red-300">Error: {email.errorMessage}</p>
                  )}
                </div>
                
                {email.status === 'scheduled' && (
                  <button
                    onClick={() => cancelEmail.mutate({ id: email.id })}
                    disabled={cancelEmail.isPending}
                    className="rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/30 disabled:opacity-50"
                  >
                    {cancelEmail.isPending ? "Cancelling..." : "Cancel"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}