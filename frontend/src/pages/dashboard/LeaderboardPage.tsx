import React from 'react';
import { useAnalytics } from '../../context/AnalyticsContext';
import { Trophy } from 'lucide-react';

const LeaderboardPage = () => {
  const { leaderboard, summary } = useAnalytics();
  const userId = summary?.user?.id;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/40">Global leaderboard</p>
          <h2 className="text-2xl font-semibold">Weekly consistency</h2>
        </div>
        <Trophy className="h-6 w-6 text-white/70" />
      </div>
      <div className="mt-6 space-y-3">
        {leaderboard.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/70">
            <p className="text-base font-semibold text-white">No leaderboard data yet</p>
            <p className="mt-1 text-white/60">
              Complete a few tasks and check back tomorrow to see your ranking.
            </p>
          </div>
        ) : (
          leaderboard.map((entry, idx) => (
            <div
              key={entry.id}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                entry.id === userId ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/10 bg-black/30'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl font-semibold text-cyan-200">#{idx + 1}</span>
                <div>
                  <p className="text-lg font-semibold">{entry.name}</p>
                  <p className="text-white/60 text-xs">Streak: {entry.streak} days</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold">{entry.completionRate}%</p>
                <p className="text-white/60 text-xs">{entry.percentile}th percentile</p>
              </div>
            </div>
          ))
        )}
      </div>
      <p className="text-white/50 text-xs mt-4">
        Rankings update nightly based on the last 7 days of completions and streaks.
      </p>
    </section>
  );
};

export default LeaderboardPage;
