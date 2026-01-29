
import React, { useState, useEffect, useCallback } from 'react';
import { CameraScanner } from './components/CameraScanner';
import { StaffRegistration } from './components/StaffRegistration';
import { StaffList } from './components/StaffList';
import { SheetConfig } from './components/SheetConfig';
import { AttendanceRecord, RecognitionResult, StaffMember } from './types';
import { geminiService } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'attendance' | 'registration' | 'staff' | 'settings'>('attendance');
  const [clockMode, setClockMode] = useState<'SIGN_IN' | 'SIGN_OUT'>('SIGN_IN');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [lastRecognition, setLastRecognition] = useState<{ name: string; type: 'SIGN_IN' | 'SIGN_OUT'; timestamp: string } | null>(null);
  const [errorOverlay, setErrorOverlay] = useState<string | null>(null);

  const isScriptUrl = (url: string) => 
    url.startsWith('https://script.google.com') && url.includes('/exec');

  useEffect(() => {
    try {
      const savedStaff = localStorage.getItem('facetrack-v1-staff');
      if (savedStaff) setStaffList(JSON.parse(savedStaff));
      
      const savedHistory = localStorage.getItem('facetrack-v1-history');
      if (savedHistory) setHistory(JSON.parse(savedHistory));
      
      const savedUrl = localStorage.getItem('facetrack-v1-webhook');
      if (savedUrl) setWebhookUrl(savedUrl);
    } catch (e) {
      console.error("Storage Error:", e);
    }
  }, []);

  const fetchFromCloud = useCallback(async () => {
    if (!webhookUrl || !isScriptUrl(webhookUrl) || isSyncing) return;
    setIsSyncing(true);
    try {
      const cloudData = await geminiService.fetchCloudData(webhookUrl);
      if (cloudData) {
        if (Array.isArray(cloudData.history)) {
          setHistory(prev => {
            const existingIds = new Set(prev.map(r => r.id));
            const newRecords = cloudData.history.filter((r: any) => r && r.id && !existingIds.has(r.id));
            return [...newRecords, ...prev].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100);
          });
        }
        if (Array.isArray(cloudData.staff)) {
          setStaffList(prev => {
            const existingIds = new Set(prev.map(s => s.id));
            const newStaff = cloudData.staff.filter((s: any) => s && s.id && !existingIds.has(s.id));
            return [...prev, ...newStaff].slice(0, 100); // Terminal limit enforced here too
          });
        }
      }
    } catch (err) {
      console.error("Sync Error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [webhookUrl, isSyncing]);

  useEffect(() => {
    if (webhookUrl && isScriptUrl(webhookUrl)) {
      fetchFromCloud();
      const interval = setInterval(fetchFromCloud, 300000);
      return () => clearInterval(interval);
    }
  }, [webhookUrl, fetchFromCloud]);

  useEffect(() => {
    try { localStorage.setItem('facetrack-v1-staff', JSON.stringify(staffList)); } catch (e) {}
  }, [staffList]);
  
  useEffect(() => {
    try { localStorage.setItem('facetrack-v1-history', JSON.stringify(history)); } catch (e) {}
  }, [history]);

  useEffect(() => {
    if (webhookUrl) localStorage.setItem('facetrack-v1-webhook', webhookUrl);
  }, [webhookUrl]);

  const handleRegister = async (newStaff: StaffMember) => {
    if (staffList.length >= 100) {
      setToast({ message: "Identity capacity (100) reached.", type: 'error' });
      return;
    }
    if (staffList.some(s => s.id === newStaff.id)) {
      setToast({ message: `ID conflict detected.`, type: 'error' });
      return;
    }
    setStaffList(prev => [...prev, newStaff]);
    if (webhookUrl && isScriptUrl(webhookUrl)) {
      geminiService.syncStaffToCloud(newStaff, webhookUrl);
      setToast({ message: `Stored in cloud.`, type: 'success' });
    } else {
      setToast({ message: `Stored in local terminal.`, type: 'success' });
    }
    setActiveTab('attendance');
  };

  const handleDeleteStaff = (id: string) => {
    if (confirm("Revoke access for this identity?")) {
      setStaffList(prev => prev.filter(s => s.id !== id));
      setToast({ message: "Identity purged.", type: 'info' });
    }
  };

  const handleRecognition = useCallback(async (result: RecognitionResult) => {
    if (!process.env.API_KEY) {
       setErrorOverlay("Security Key Missing.");
       return;
    }
    if (staffList.length === 0) {
      setToast({ message: "No authorized staff found.", type: 'error' });
      return;
    }

    setIsProcessing(true);
    try {
      if (result.identified && result.staffId && result.staffName) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const staff = staffList.find(s => s.id === result.staffId);
        
        const newRecord: AttendanceRecord = {
          id: Math.random().toString(36).substring(2, 9),
          staffId: result.staffId,
          staffName: result.staffName,
          staffRole: staff?.role || 'Unknown',
          timestamp: timeStr,
          date: now.toLocaleDateString(),
          status: 'PRESENT',
          type: clockMode,
          method: 'FACE_RECOGNITION'
        };

        setHistory(prev => [newRecord, ...prev].slice(0, 100));
        setLastRecognition({
          name: result.staffName,
          type: clockMode,
          timestamp: timeStr
        });

        if (webhookUrl && isScriptUrl(webhookUrl)) {
           geminiService.syncToGoogleSheets(newRecord, webhookUrl).catch(() => {});
        }
        // Reduced from 2000ms to 1200ms for even faster feedback
        setTimeout(() => setLastRecognition(null), 1200);
      } else {
        const msg = result.message?.toLowerCase().includes("confidence") 
          ? "Low Confidence." 
          : "Identity Unknown.";
        setToast({ message: msg, type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: "System Busy.", type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, [staffList, webhookUrl, clockMode]);

  return (
    <div className="h-screen-dynamic bg-[#020617] relative flex flex-col overflow-hidden text-slate-100 font-jakarta antialiased">
      
      {/* SUCCESS OVERLAY (Snappier animations) */}
      {lastRecognition && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 backdrop-blur-3xl animate-in fade-in zoom-in duration-200 px-6">
           <div className={`w-full max-w-md p-1 bg-gradient-to-br rounded-[48px] ${lastRecognition.type === 'SIGN_IN' ? 'from-emerald-500/50 to-emerald-900/50' : 'from-indigo-500/50 to-indigo-900/50'}`}>
             <div className="bg-[#020617] rounded-[47px] p-10 text-center relative overflow-hidden">
                <div className={`absolute top-0 inset-x-0 h-1 ${lastRecognition.type === 'SIGN_IN' ? 'bg-emerald-500' : 'bg-indigo-500'} opacity-20`}></div>
                
                <div className={`w-20 h-20 rounded-2xl mx-auto flex items-center justify-center mb-8 ${lastRecognition.type === 'SIGN_IN' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                   {lastRecognition.type === 'SIGN_IN' ? (
                     <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                   ) : (
                     <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                   )}
                </div>

                <p className="text-[10px] font-black uppercase tracking-[6px] text-slate-500 mb-2">{lastRecognition.type === 'SIGN_IN' ? 'Login Success' : 'Logout Success'}</p>
                <h1 className="text-3xl font-black text-white tracking-tighter mb-4">{lastRecognition.name}</h1>
                
                <div className="py-6 px-4 bg-white/5 rounded-3xl mb-8">
                   <p className="text-lg font-semibold text-slate-300 leading-tight">
                     {lastRecognition.type === 'SIGN_IN' 
                       ? "Welcome back!"
                       : "Safe journey!"}
                   </p>
                </div>

                <p className="text-[9px] font-mono text-slate-600 uppercase tracking-[4px]">{lastRecognition.timestamp}</p>
             </div>
           </div>
        </div>
      )}

      {toast && (
        <div className={`fixed top-12 left-1/2 -translate-x-1/2 z-[1100] px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-3 border animate-in slide-in-from-top-4 duration-200 backdrop-blur-3xl
          ${toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 
            toast.type === 'error' ? 'bg-rose-500/20 border-rose-500/30 text-rose-300' : 'bg-slate-800 border-white/10 text-slate-300'}`}>
          <div className={`w-1.5 h-1.5 rounded-full bg-current ${toast.type === 'error' ? 'animate-pulse' : ''}`}></div>
          <span className="text-[10px] font-bold uppercase tracking-[2px]">{toast.message}</span>
        </div>
      )}

      <header className="fixed top-0 inset-x-0 z-[100] h-20 px-8 flex items-center pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-2xl shadow-indigo-500/20">
             <div className="w-4 h-4 bg-indigo-600 rounded-sm rotate-12"></div>
          </div>
          <div>
             <p className="text-[10px] font-black uppercase tracking-[3px] text-white/90">Facetrack Pro</p>
             <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">v1.2.4 Beta</p>
          </div>
        </div>
      </header>

      <main className="flex-grow relative overflow-hidden flex flex-col">
        {activeTab === 'attendance' ? (
          <div className="absolute inset-0 z-0">
            <CameraScanner onResult={handleRecognition} isProcessing={isProcessing} staffList={staffList} />
            <div className="absolute top-24 left-1/2 -translate-x-1/2 flex items-center p-1 bg-black/50 border border-white/10 rounded-[30px] backdrop-blur-3xl z-40 shadow-2xl">
              <button 
                onClick={() => setClockMode('SIGN_IN')} 
                className={`px-8 py-3.5 rounded-[26px] text-[10px] font-black uppercase tracking-[3px] transition-all flex items-center gap-3 ${clockMode === 'SIGN_IN' ? 'bg-white text-black shadow-xl scale-100' : 'text-white/40 hover:text-white'}`}
              >
                {clockMode === 'SIGN_IN' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>}
                Check In
              </button>
              <button 
                onClick={() => setClockMode('SIGN_OUT')} 
                className={`px-8 py-3.5 rounded-[26px] text-[10px] font-black uppercase tracking-[3px] transition-all flex items-center gap-3 ${clockMode === 'SIGN_OUT' ? 'bg-white text-black shadow-xl scale-100' : 'text-white/40 hover:text-white'}`}
              >
                {clockMode === 'SIGN_OUT' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366f1]"></div>}
                Check Out
              </button>
            </div>

            <div className="absolute bottom-32 right-8 z-[50]">
              <button 
                onClick={fetchFromCloud}
                disabled={isSyncing || !webhookUrl}
                className={`w-14 h-14 bg-white/5 border border-white/10 rounded-full flex items-center justify-center backdrop-blur-2xl shadow-2xl active:scale-90 transition-all group ${isSyncing ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                title="Cloud Sync"
              >
                <div className={`w-2 h-2 rounded-full absolute top-3 right-3 ${isSyncing ? 'bg-indigo-400 animate-ping' : 'bg-emerald-500'}`}></div>
                <svg className={`w-5 h-5 text-white ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-grow overflow-y-auto pt-24 pb-32 no-scrollbar mesh-gradient">
            <div className="max-w-xl mx-auto px-6 space-y-12">
               <div className="space-y-2">
                 <p className="text-[10px] font-black uppercase tracking-[5px] text-indigo-400 ml-1">Administration</p>
                 <h2 className="text-4xl font-black text-white tracking-tight capitalize">{activeTab} Manager</h2>
               </div>

               <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
                  {activeTab === 'registration' && <StaffRegistration onRegister={handleRegister} staffCount={staffList.length} />}
                  {activeTab === 'staff' && <StaffList staffList={staffList} onDelete={handleDeleteStaff} />}
                  {activeTab === 'settings' && <SheetConfig webhookUrl={webhookUrl} onUrlChange={setWebhookUrl} />}
               </div>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[800] p-1.5 bg-black/50 border border-white/10 rounded-[40px] backdrop-blur-3xl shadow-[0_40px_80px_rgba(0,0,0,0.5)] flex items-center gap-1">
        {[
          { id: 'attendance', label: 'Monitor', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
          { id: 'registration', label: 'Add', icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z' },
          { id: 'staff', label: 'Team', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
          { id: 'settings', label: 'Cloud', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-3 px-6 py-4 rounded-[34px] transition-all duration-300 relative ${activeTab === tab.id ? 'bg-white text-black shadow-lg scale-105' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={tab.icon} /></svg>
            {activeTab === tab.id && <span className="text-[10px] font-black uppercase tracking-[3px]">{tab.label}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
