
import React, { useState, useEffect, useCallback } from 'react';
import { CameraScanner } from './components/CameraScanner';
import { AttendanceCard } from './components/AttendanceCard';
import { StaffRegistration } from './components/StaffRegistration';
import { SheetConfig } from './components/SheetConfig';
import { AttendanceRecord, RecognitionResult, StaffMember } from './types';
import { geminiService } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'attendance' | 'registration' | 'settings'>('attendance');
  const [clockMode, setClockMode] = useState<'SIGN_IN' | 'SIGN_OUT'>('SIGN_IN');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [lastRecognition, setLastRecognition] = useState<{ name: string; avatar: string; type: 'SIGN_IN' | 'SIGN_OUT'; timestamp: string } | null>(null);
  const [errorOverlay, setErrorOverlay] = useState<string | null>(null);

  // Helper for safe URL checking
  const isScriptUrl = (url: string) => 
    url.startsWith('https://script.google.com') && url.includes('/exec') && !url.includes('docs.google.com');

  useEffect(() => {
    try {
      const savedStaff = localStorage.getItem('facetrack-v1-staff');
      if (savedStaff) setStaffList(JSON.parse(savedStaff));
      
      const savedHistory = localStorage.getItem('facetrack-v1-history');
      if (savedHistory) setHistory(JSON.parse(savedHistory));
      
      const savedUrl = localStorage.getItem('facetrack-v1-webhook');
      if (savedUrl) setWebhookUrl(savedUrl);
    } catch (e) {
      console.error("Initial Storage Read Error:", e);
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
            if (newRecords.length === 0) return prev;
            return [...newRecords, ...prev]
              .sort((a, b) => {
                const dateA = new Date(a.date + ' ' + a.timestamp).getTime();
                const dateB = new Date(b.date + ' ' + b.timestamp).getTime();
                return isNaN(dateA) || isNaN(dateB) ? 0 : dateB - dateA;
              })
              .slice(0, 100);
          });
        }
        if (Array.isArray(cloudData.staff)) {
          setStaffList(prev => {
            const existingIds = new Set(prev.map(s => s.id));
            const newStaff = cloudData.staff.filter((s: any) => s && s.id && !existingIds.has(s.id));
            return newStaff.length === 0 ? prev : [...prev, ...newStaff];
          });
        }
      }
    } catch (err) {
      console.error("Cloud Fetch Error:", err);
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
    try {
      if (staffList.length >= 0) {
        localStorage.setItem('facetrack-v1-staff', JSON.stringify(staffList));
      }
    } catch (e) {
      console.warn("Storage quota exceeded for staff.");
    }
  }, [staffList]);
  
  useEffect(() => {
    try {
      localStorage.setItem('facetrack-v1-history', JSON.stringify(history));
    } catch (e) {
      console.warn("Storage quota exceeded for history.");
    }
  }, [history]);

  useEffect(() => {
    if (webhookUrl) localStorage.setItem('facetrack-v1-webhook', webhookUrl);
  }, [webhookUrl]);

  const handleRegister = async (newStaff: StaffMember) => {
    if (staffList.some(s => s.id === newStaff.id)) {
      setToast({ message: `ID ${newStaff.id} already exists.`, type: 'error' });
      return;
    }
    setStaffList(prev => [...prev, newStaff]);
    if (webhookUrl && isScriptUrl(webhookUrl)) {
      geminiService.syncStaffToCloud(newStaff, webhookUrl);
      setToast({ message: `${newStaff.name} saved to cloud.`, type: 'success' });
    } else {
      setToast({ message: `${newStaff.name} registered.`, type: 'success' });
    }
    setActiveTab('attendance');
  };

  const handleRecognition = useCallback(async (result: RecognitionResult) => {
    if (!process.env.API_KEY) {
       setErrorOverlay("API Key missing. Recognition disabled.");
       return;
    }

    if (staffList.length === 0) {
      setToast({ message: "No staff registered.", type: 'error' });
      return;
    }

    setIsProcessing(true);
    try {
      if (result.identified && result.staffId && result.staffName) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

        setTimeout(() => setLastRecognition(null), 5000);
      } else {
        setToast({ message: result.message || "Unknown face.", type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message || "Scanning failed.", type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, [staffList, webhookUrl, clockMode]);

  return (
    <div className="min-h-screen bg-slate-100 font-sans relative flex flex-col overflow-x-hidden">
      {/* GLOBAL ALERTS */}
      {errorOverlay && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-slate-900/95 backdrop-blur-3xl">
           <div className="bg-white rounded-[40px] p-10 max-w-lg w-full shadow-2xl text-center">
              <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Setup Needed</h3>
              <p className="text-slate-500 text-lg mb-6">{errorOverlay}</p>
              <button onClick={() => window.location.reload()} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg uppercase tracking-widest">Retry</button>
           </div>
        </div>
      )}

      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[600] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-2 border animate-in slide-in-from-top-6 duration-300 max-w-[90vw]
          ${toast.type === 'success' ? 'bg-emerald-600 border-emerald-700 text-white' : 
            toast.type === 'error' ? 'bg-rose-600 border-rose-700 text-white' : 'bg-indigo-600 border-indigo-700 text-white'}`}>
          <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      )}

      {/* COMPACT NAV HEADER */}
      <header className="bg-white px-6 py-4 flex items-center justify-between border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center shadow-lg"><div className="w-3 h-3 border-[2px] border-white rounded-full"></div></div>
          <h1 className="text-[10px] font-black text-slate-900 uppercase tracking-[4px]">FaceTrack Pro</h1>
        </div>
        <div className="flex gap-2">
           <button onClick={fetchFromCloud} disabled={isSyncing || !webhookUrl} title="Cloud Sync" className={`p-2.5 rounded-xl border border-slate-100 transition-all ${isSyncing ? 'animate-spin text-indigo-600' : 'text-slate-400 active:scale-95'}`}>
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
           </button>
        </div>
      </header>

      {/* MAIN SCREEN AREA */}
      <main className="flex-grow max-w-7xl mx-auto w-full flex flex-col lg:flex-row gap-0 lg:gap-8 px-0 lg:px-4 py-0 lg:py-8">
        
        {/* LEFT COLUMN: CAMERA & DASHBOARD */}
        <div className="flex-grow lg:w-3/5 flex flex-col gap-6">
          
          {/* SCANNER - FULL VIEW MODE */}
          <div className="flex-grow flex items-center justify-center bg-white lg:rounded-[40px] p-0 lg:p-2 shadow-inner lg:border border-slate-200 overflow-hidden min-h-[500px] lg:min-h-[600px] relative">
             <CameraScanner onResult={handleRecognition} isProcessing={isProcessing} staffList={staffList} />

             {/* CLOCK TOGGLES - FLOATING IN CAMERA FOR FULL VIEW FEEL */}
             <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 bg-black/40 backdrop-blur-xl rounded-2xl border border-white/10 z-30 shadow-2xl">
                <button onClick={() => setClockMode('SIGN_IN')} className={`px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-[2px] transition-all flex items-center gap-2 ${clockMode === 'SIGN_IN' ? 'bg-emerald-500 text-white' : 'text-white/60 hover:text-white'}`}>
                   Sign In
                </button>
                <button onClick={() => setClockMode('SIGN_OUT')} className={`px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-[2px] transition-all flex items-center gap-2 ${clockMode === 'SIGN_OUT' ? 'bg-white text-slate-900' : 'text-white/60 hover:text-white'}`}>
                   Sign Out
                </button>
             </div>

             {/* BOTTOM MESSAGE OVERLAY */}
             {lastRecognition && (
               <div className="absolute bottom-10 left-4 right-4 z-[100] animate-in slide-in-from-bottom-10 fade-in duration-500">
                 <div className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white flex items-center gap-6">
                    <div className="relative flex-shrink-0">
                      {lastRecognition.avatar ? (
                        <img src={lastRecognition.avatar} alt={lastRecognition.name} className="w-20 h-20 rounded-full object-cover border-4 border-slate-50 shadow-md" />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-3xl font-black text-indigo-600 uppercase">{lastRecognition.name.charAt(0)}</div>
                      )}
                      <div className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-lg ${lastRecognition.type === 'SIGN_IN' ? 'bg-emerald-500' : 'bg-slate-900'}`}>
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                      </div>
                    </div>
                    <div className="flex-grow">
                      <h2 className="text-xl font-black text-slate-900 tracking-tight mb-0.5">{lastRecognition.name}</h2>
                      <p className={`text-2xl font-black leading-tight ${lastRecognition.type === 'SIGN_IN' ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {lastRecognition.type === 'SIGN_IN' ? 'Glad you are Here.' : 'Have a safe journey.'}
                      </p>
                      <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mt-1.5">{lastRecognition.timestamp}</p>
                    </div>
                 </div>
               </div>
             )}
          </div>
        </div>

        {/* RIGHT COLUMN: MANAGEMENT TABS */}
        <div className="lg:w-2/5 flex flex-col gap-8 p-4 lg:p-0">
          <div className="bg-white rounded-[40px] shadow-xl border border-slate-200 flex flex-col h-full overflow-hidden">
            <div className="flex border-b border-slate-100 p-2">
              {['attendance', 'registration', 'settings'].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-4 text-[9px] font-black uppercase tracking-[3px] transition-all relative rounded-2xl ${activeTab === tab ? 'text-indigo-600 bg-indigo-50 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}>
                  {tab}
                </button>
              ))}
            </div>
            
            <div className="p-6 lg:p-8 flex-grow overflow-y-auto custom-scrollbar min-h-[400px]">
              {activeTab === 'attendance' && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[4px]">Activity Log</h3>
                    <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{history.length} / 100</span>
                  </div>
                  {history.length === 0 ? (
                    <div className="py-24 text-center text-slate-300 font-black uppercase tracking-[5px] text-[10px]">No records found</div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {history.slice(0, 15).map(record => record && <AttendanceCard key={record.id} record={record} />)}
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'registration' && <StaffRegistration onRegister={handleRegister} />}
              {activeTab === 'settings' && <SheetConfig webhookUrl={webhookUrl} onUrlChange={setWebhookUrl} />}
            </div>
          </div>
        </div>

      </main>

      {/* FOOTER STATUS */}
      <footer className="px-8 py-4 border-t border-slate-200 bg-white hidden lg:flex items-center justify-between text-[8px] font-black text-slate-400 uppercase tracking-[4px]">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></div>
          Secure Biometric Terminal
        </div>
        <div>
          v1.5.0 • Immersive Cam Update
        </div>
      </footer>
    </div>
  );
};

export default App;
