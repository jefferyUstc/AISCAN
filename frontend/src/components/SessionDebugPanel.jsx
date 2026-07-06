import { useState } from "react";
import { getUserInfo, clearStoredIds } from "../utils/userIdGenerator.js";
import { apiGet, apiPost } from "../api/client.js";

export default function SessionDebugPanel() {
  const [userInfo, setUserInfo] = useState(() => getUserInfo());
  const [sessionStats, setSessionStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [panelMode, setPanelMode] = useState('hidden');

  const fetchSessionStats = async () => {
    setLoading(true);
    try {
      setSessionStats(await apiGet("/api/assistant/session-stats"));
    } catch (error) {
      console.error("Failed to fetch session stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const cleanupSessions = async () => {
    setLoading(true);
    try {
      const result = await apiPost("/api/assistant/cleanup-sessions");
      alert(`Cleanup completed:\n- Expired: ${result.expired}\n- Idle: ${result.idle}`);
      fetchSessionStats(); // Refresh stats
    } catch (error) {
      console.error("Failed to cleanup sessions:", error);
      alert("Failed to cleanup sessions");
    } finally {
      setLoading(false);
    }
  };

  const resetUserSession = () => {
    clearStoredIds();
    setUserInfo(getUserInfo());
    alert('User session reset! New IDs generated.');
  };

  const isHidden = panelMode === 'hidden';

  const triggerButtonStyle = {
    padding: '6px 10px',
    fontSize: '11px',
    borderRadius: '999px',
    border: 'none',
    backgroundColor: '#1f2937',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
  };

  const panelStyle = {
    background: '#f9fafb',
    padding: '15px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '12px',
    maxWidth: '300px',
    width: '280px',
    boxShadow: '0 10px 25px rgba(15,23,42,0.2)'
  };

  const inlineButtonStyle = {
    padding: '5px 10px',
    fontSize: '11px',
    cursor: 'pointer',
    borderRadius: '4px',
    border: '1px solid transparent'
  };

  return (
    <div style={{ 
      position: 'fixed', 
      top: '10px', 
      right: '10px', 
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '8px'
    }}>
      {isHidden && (
        <button
          onClick={() => setPanelMode('display')}
          style={triggerButtonStyle}
        >
          🔧 Session Debug
        </button>
      )}

      {!isHidden && (
        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '14px' }}>🔧 Session Debug Panel</h4>
            <button
              onClick={() => setPanelMode('hidden')}
              style={{ ...inlineButtonStyle, backgroundColor: '#e5e7eb', color: '#111827' }}
            >
              Hide
            </button>
          </div>
        
          {userInfo && (
            <div style={{ marginBottom: '10px' }}>
              <strong>User Info:</strong>
              <div>ID: <code>{userInfo.userId}</code></div>
              <div>Session: <code>{userInfo.sessionId}</code></div>
            </div>
          )}

          {sessionStats && (
            <div style={{ marginBottom: '10px' }}>
              <strong>Session Stats:</strong>
              <div>Total: {sessionStats.total_sessions}</div>
              <div>Active: {sessionStats.active_sessions}</div>
              <div>Cached: {sessionStats.cached_sessions}</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <button 
              onClick={fetchSessionStats}
              disabled={loading}
              style={{ 
                ...inlineButtonStyle,
                cursor: loading ? 'not-allowed' : 'pointer',
                backgroundColor: '#eef2ff',
                color: '#312e81'
              }}
            >
              {loading ? 'Loading...' : 'Refresh Stats'}
            </button>
            
            <button 
              onClick={cleanupSessions}
              disabled={loading}
              style={{ 
                ...inlineButtonStyle,
                cursor: loading ? 'not-allowed' : 'pointer',
                backgroundColor: '#fef2f2',
                color: '#991b1b'
              }}
            >
              Cleanup Sessions
            </button>
            
            <button 
              onClick={resetUserSession}
              style={{ 
                ...inlineButtonStyle,
                backgroundColor: '#ecfeff',
                color: '#115e59'
              }}
            >
              Reset User ID
            </button>
          </div>

          <div style={{ marginTop: '10px', fontSize: '10px', color: '#6b7280' }}>
            💡 This panel helps debug the new session management system.
            <br />
            Remove this component in production.
          </div>
        </div>
      )}
    </div>
  );
}
