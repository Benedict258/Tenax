import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

function App() {
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tenax_token');
    if (token) {
      loadUserData(token);
    } else {
      setLoading(false);
    }
  }, []);

  const loadUserData = async (token) => {
    try {
      const response = await axios.get(`${API_BASE}/tasks/today`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTasks(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load user data:', error);
      localStorage.removeItem('tenax_token');
      setLoading(false);
    }
  };

  const completionRate = tasks.length > 0 
    ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100)
    : 0;

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading Tenax...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🤖 Tenax Dashboard</h1>
        <p>Your AI-powered productivity companion</p>
      </header>

      <main className="app-main">
        <div className="stats-card">
          <h2>Today's Progress</h2>
          <div className="progress-circle">
            <span className="progress-text">{completionRate}%</span>
          </div>
          <p>{tasks.filter(t => t.status === 'done').length} of {tasks.length} tasks completed</p>
        </div>

        <div className="tasks-section">
          <h2>Today's Tasks</h2>
          {tasks.length === 0 ? (
            <div className="empty-state">
              <p>No tasks for today</p>
              <p>Add tasks through WhatsApp or the API</p>
            </div>
          ) : (
            <div className="tasks-list">
              {tasks.map(task => (
                <div key={task.id} className={`task-item ${task.status}`}>
                  <div className="task-content">
                    <h3>{task.title}</h3>
                    {task.description && <p>{task.description}</p>}
                    <div className="task-meta">
                      <span className="category">{task.category}</span>
                      <span className="status">{task.status}</span>
                      {task.start_time && (
                        <span className="time">
                          {new Date(task.start_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="task-status">
                    {task.status === 'done' ? '✅' : '⏳'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="whatsapp-info">
          <h3>📱 WhatsApp Commands</h3>
          <div className="commands">
            <code>"done [task name]"</code> - Mark task complete<br/>
            <code>"status"</code> - Check remaining tasks<br/>
            <code>"add [task name]"</code> - Add new task<br/>
            <code>"help"</code> - Show commands
          </div>
        </div>

        <div className="phase-status">
          <h3>🚀 Phase 0 Complete</h3>
          <div className="checklist">
            <div className="check-item">✅ Database & API</div>
            <div className="check-item">✅ WhatsApp Integration</div>
            <div className="check-item">✅ Task Management</div>
            <div className="check-item">✅ Job Queue System</div>
            <div className="check-item">✅ Dashboard UI</div>
          </div>
          <p>Ready for Phase 1 development!</p>
        </div>
      </main>
    </div>
  );
}

export default App;