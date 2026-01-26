import React from 'react';

// MVP: Tenax Resolution Builder Roadmap Display
const sampleRoadmap = [
  { phase: 'Fundamentals', description: 'Learn JS basics', week: 1 },
  { phase: 'DOM & Browser APIs', description: 'Interact with web pages', week: 2 },
  { phase: 'Async & APIs', description: 'Handle async code', week: 3 },
  { phase: 'Mini Projects', description: 'Build small apps', week: 4 },
  { phase: 'Real-world Project', description: 'Create a portfolio project', week: 5 },
];

export default function ResolutionBuilderPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Tenax Resolution Builder</h1>
      <p className="mb-6">Your personalized roadmap from resolution to daily execution.</p>
      <div className="bg-white rounded shadow p-4">
        <h2 className="text-xl font-semibold mb-2">Roadmap Preview</h2>
        <ul className="list-disc pl-6">
          {sampleRoadmap.map((step, idx) => (
            <li key={idx} className="mb-2">
              <span className="font-bold">Phase {idx + 1}: {step.phase}</span> — {step.description} <span className="text-gray-500">(Week {step.week})</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-6">
        <button className="bg-blue-600 text-white px-4 py-2 rounded mr-2">Download PDF</button>
        <button className="bg-green-600 text-white px-4 py-2 rounded">Download Image</button>
      </div>
    </div>
  );
}
