// Tenax Resolution Builder Agent Mode
// This service handles the guided flow for New Year resolution planning

const { createTask } = require('./taskPrioritizer');

class ResolutionBuilderAgent {
  constructor(userProfile) {
    this.userProfile = userProfile;
    this.state = {
      step: 1,
      resolution_goal: '',
      target_outcome: '',
      time_commitment: '',
      days_free: [],
      preferred_blocks: [],
      roadmap: [],
      resources: [],
      schedule_preview: [],
      permission: false,
    };
  }

  // Step 1: Capture Resolution
  captureResolution(goal) {
    this.state.resolution_goal = goal;
    this.state.step = 2;
    return 'What does success look like for this goal?';
  }

  // Step 2: Clarify Target Outcome
  clarifyOutcome(outcome) {
    this.state.target_outcome = outcome;
    this.state.step = 3;
    return 'How many hours per week can you commit? Which days are free? Preferred time blocks?';
  }

  // Step 3: Time Reality Check
  setTimeReality(hours, days, blocks) {
    this.state.time_commitment = hours;
    this.state.days_free = days;
    this.state.preferred_blocks = blocks;
    this.state.step = 4;
    return 'Generating a realistic roadmap...';
  }

  // Step 4: Roadmap Generation
  generateRoadmap(phases) {
    this.state.roadmap = phases;
    this.state.step = 5;
    return 'Would you like learning resources added?';
  }

  // Step 5: Optional Resource Enrichment
  addResources(resources) {
    this.state.resources = resources;
    this.state.step = 6;
    return 'Previewing your schedule...';
  }

  // Step 6: Convert Roadmap into Schedule Preview
  previewSchedule(schedule) {
    this.state.schedule_preview = schedule;
    this.state.step = 7;
    return 'Should I add this learning roadmap to your daily schedule? (Approve/Edit/Cancel)';
  }

  // Step 7: Explicit Permission Gate
  setPermission(permission) {
    this.state.permission = permission;
    this.state.step = 8;
    if (permission) {
      return this.handoffToExecution();
    } else {
      return 'No changes made. You can restart anytime.';
    }
  }

  // Step 8: Execution Handoff
  handoffToExecution() {
    // Create tasks in main system
    this.state.roadmap.forEach((phase, idx) => {
      createTask({
        userId: this.userProfile.id,
        taskName: `${this.state.resolution_goal}: ${phase.name}`,
        description: phase.description,
        priority: idx === 0 ? 'P1' : 'P2',
        recurrence: phase.recurrence,
        category: 'Resolution',
      });
    });
    return 'Your resolution roadmap is now part of your daily execution!';
  }
}

module.exports = ResolutionBuilderAgent;
