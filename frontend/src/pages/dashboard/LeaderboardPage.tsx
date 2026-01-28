import React from 'react';
import { useAnalytics } from '../../context/AnalyticsContext';
import { Trophy } from 'lucide-react';

const LeaderboardPage = () => {
  const { leaderboard, summary } = useAnalytics();
  const userId = summary?.user?.id;

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-gray-500">Global leaderboard</p>
          <h2 className="text-2xl font-semibold text-black">Weekly consistency</h2>
        </div>
        <Trophy className="h-6 w-6 text-gray-500" />
      </div>
      <div className="mt-6 space-y-3">
        {leaderboard.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
            <p className="text-base font-semibold text-black">No leaderboard data yet</p>
            <p className="mt-1 text-gray-500">
              Complete a few tasks and check back tomorrow to see your ranking.
            </p>
          </div>
        ) : (
          leaderboard.map((entry, idx) => (
            <div
              key={entry.id}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                entry.id === userId ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl font-semibold text-black">#{idx + 1}</span>
                <div>
                  <p className="text-lg font-semibold text-black">{entry.name}</p>
                  <p className="text-gray-500 text-xs">Streak: {entry.streak} days</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-black">{entry.completionRate}%</p>
                <p className="text-gray-500 text-xs">{entry.percentile}th percentile</p>
              </div>
            </div>
          ))
        )}
      </div>
      <p className="text-gray-500 text-xs mt-4">
        Rankings update nightly based on the last 7 days of completions and streaks.
      </p>
    </section>
  );
};

export default LeaderboardPage;
