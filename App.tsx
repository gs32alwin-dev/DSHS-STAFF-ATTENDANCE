
import React, { useState, useEffect, useCallback } from 'react';
import { CameraScanner } from './components/CameraScanner';
import { AttendanceCard } from './components/AttendanceCard';
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
  const [lastRecognition, setLastRecognition] = useState<{ name: string; avatar: string; type: 'SIGN_IN' | 'SIGN_OUT'; timestamp: string } | null>(null);
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
            return [...prev, ...newStaff];
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
    if (staffList.some(s => s.id === newStaff.id)) {
      setToast({ message: `ID conflict detected.`, type: 'error' });
      return;
    }
    setStaffList(prev => [...prev, newStaff]);
    if (webhookUrl && isScriptUrl(webhookUrl)) {
      geminiService.syncStaffToCloud(newStaff, webhookUrl);
      setToast({ message: `Securely stored in cloud.`, type: 'success' });
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
      setToast({ message: "No authorized staff.", type: 'error' });
      return;
    }

    setIsProcessing(true);
    try {
      if (result.identified && result.staffId && result.staffName) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const newRecord: AttendanceRecord = {
          id: Math.random().toString(36).substring(2, 9),
          staffId: result.staffId,
          staffName: result.staffName,
          timestamp: timeStr,
          date: now.toLocaleDateString(),
          status: 'PRESENT',
          type: clockMode,
          method: 'FACE_RECOGNITION'
        };

        const currentStaff = staffList.find(s => s.id === result.staffId);
        setHistory(prev => [newRecord, ...prev].slice(0, 100));
        setLastRecognition({
          name: result.staffName,
          avatar: currentStaff?.avatarUrl || '',
          type: clockMode,
          timestamp: timeStr
        });

        if (webhookUrl && isScriptUrl(webhookUrl)) {
           geminiService.syncToGoogleSheets(newRecord, webhookUrl).catch(() => {});
        }
        setTimeout(() => setLastRecognition(null), 4000);
      } else {
        setToast({ message: "Unauthorized Entry Attempt.", type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: "Biometric analysis failed.", type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, [staffList, webhookUrl, clockMode]);

  return (
    <div className="h-screen-dynamic bg-black relative flex flex-col overflow-hidden text-white font-jakarta selection:bg-indigo-500/30">
      
      {/* SUCCESS FULLSCREEN OVERLAY */}
      {lastRecognition && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/80 backdrop-blur-3xl animate-in fade-in zoom-in duration-500">
           <div className={`w-32 h-32 rounded-full p-1 mb-8 relative ${lastRecognition.type === 'SIGN_IN' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
              <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-current"></div>
              {lastRecognition.avatar ? (
                <img src={lastRecognition.avatar} className="w-full h-full rounded-full object-cover border-4 border-black" alt="" />
              ) : (
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-4xl font-black">{lastRecognition.name.charAt(0)}</div>
              )}
           </div>
           <h2 className="text-4xl font-black tracking-tighter mb-2 text-center px-6">{lastRecognition.name}</h2>
           <p className={`text-xl font-medium tracking-tight px-8 py-2 rounded-full ${lastRecognition.type === 'SIGN_IN' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
             {lastRecognition.type === 'SIGN_IN' ? 'System Access Granted' : 'Terminal Session Closed'}
           </p>
           <p className="mt-12 text-[10px] font-bold text-white/20 uppercase tracking-[6px]">{lastRecognition.timestamp}</p>
        </div>
      )}

      {/* ERROR MODAL */}
      {errorOverlay && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-8 bg-black/95 backdrop-blur-2xl">
           <div className="glass-dark rounded-[48px] p-10 max-w-sm w-full text-center">
              <div className="w-20 h-20 bg-rose-500/20 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h3 className="text-2xl font-black mb-2 tracking-tight">Security Alert</h3>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed">{errorOverlay}</p>
              <button onClick={() => window.location.reload()} className="w-full py-5 bg-white text-black rounded-[24px] font-black text-sm uppercase tracking-[4px] hover:bg-slate-100 active:scale-95 transition-all">Reinitialize</button>
           </div>
        </div>
      )}

      {/* NOTIFICATIONS */}
      {toast && (
        <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-[900] px-6 py-4 rounded-[28px] shadow-2xl flex items-center gap-3 border animate-in slide-in-from-top-10 fade-in duration-500 max-w-[85vw] backdrop-blur-3xl
          ${toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 
            toast.type === 'error' ? 'bg-rose-500/20 border-rose-500/30 text-rose-400' : 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'}`}>
          <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
          <span className="text-[10px] font-black uppercase tracking-[3px]">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-40 hover:opacity-100 transition-opacity"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      )}

      {/* CORE VIEW */}
      <main className="flex-grow relative h-full w-full overflow-hidden">
        
        {/* SCANNER VIEW */}
        {activeTab === 'attendance' && (
          <div className="absolute inset-0 z-0 bg-slate-950">
            <CameraScanner onResult={handleRecognition} isProcessing={isProcessing} staffList={staffList} />
            
            {/* FLOATING HEADER */}
            <div className="absolute top-10 inset-x-8 flex items-center justify-between z-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 glass rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl">
                   <div className="w-4 h-4 bg-white rounded-sm rotate-45"></div>
                </div>
                <div>
                   <h1 className="text-[10px] font-black uppercase tracking-[5px] text-white/90 drop-shadow-lg">Biometric</h1>
                   <div className="flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                     <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">Active System</span>
                   </div>
                </div>
              </div>
              <button 
                onClick={fetchFromCloud} 
                disabled={isSyncing || !webhookUrl} 
                className={`w-12 h-12 glass rounded-2xl flex items-center justify-center border border-white/10 active:scale-90 transition-all ${isSyncing ? 'text-indigo-400' : 'text-white/60'}`}
              >
                <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            </div>

            {/* INTERACTIVE MODE SWITCHER */}
            <div className="absolute top-32 left-1/2 -translate-x-1/2 p-1.5 glass-dark rounded-[24px] z-40 shadow-2xl flex items-center gap-1 border border-white/5">
              <button onClick={() => setClockMode('SIGN_IN')} className={`px-7 py-3 rounded-[18px] font-black text-[10px] uppercase tracking-[3px] transition-all flex items-center gap-2 ${clockMode === 'SIGN_IN' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}>
                {clockMode === 'SIGN_IN' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>}
                Check In
              </button>
              <button onClick={() => setClockMode('SIGN_OUT')} className={`px-7 py-3 rounded-[18px] font-black text-[10px] uppercase tracking-[3px] transition-all flex items-center gap-2 ${clockMode === 'SIGN_OUT' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}>
                {clockMode === 'SIGN_OUT' && <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>}
                Check Out
              </button>
            </div>
          </div>
        )}

        {/* MANAGEMENT INTERFACES */}
        {activeTab !== 'attendance' && (
          <div className="h-full mesh-gradient overflow-y-auto no-scrollbar px-6 pt-32 pb-40">
            <div className="max-w-xl mx-auto space-y-10">
              <div className="flex flex-col gap-1">
                 <p className="text-[10px] font-black uppercase tracking-[6px] text-white/30 ml-1">Terminal Core</p>
                 <h2 className="text-4xl font-black tracking-tight text-white capitalize">{activeTab.replace('_', ' ')}</h2>
              </div>
              
              <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                {activeTab === 'registration' && <StaffRegistration onRegister={handleRegister} />}
                {activeTab === 'staff' && <StaffList staffList={staffList} onDelete={handleDeleteStaff} />}
                {activeTab === 'settings' && <SheetConfig webhookUrl={webhookUrl} onUrlChange={setWebhookUrl} />}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* INNOVATIVE DYNAMIC NAV BAR */}
      <nav className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[800] glass-dark p-2 rounded-[36px] border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.6)] flex items-center gap-1.5 transition-all">
        {[
          { id: 'attendance', label: 'Scan', icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z' },
          { id: 'registration', label: 'Add', icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z' },
          { id: 'staff', label: 'Team', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
          { id: 'settings', label: 'Cloud', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
        ].map((item) => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={`flex items-center gap-3 px-6 py-4 rounded-[28px] transition-all duration-300 relative group overflow-hidden ${activeTab === item.id ? 'bg-white text-black font-black' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <svg className="w-5 h-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={item.icon} /></svg>
            {activeTab === item.id && <span className="text-[10px] uppercase tracking-[3px] font-black relative z-10">{item.label}</span>}
            {activeTab === item.id && <div className="absolute inset-0 bg-white shadow-[0_0_20px_rgba(255,255,255,0.4)]"></div>}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
