
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [successOverlay, setSuccessOverlay] = useState<{ name: string; avatar: string; message: string; type: 'SIGN_IN' | 'SIGN_OUT' } | null>(null);
  const [errorOverlay, setErrorOverlay] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);

  // Exact requested messages
  const SIGN_IN_MSG = "Welcome back! Glad you’re here, your presence makes a difference.";
  const SIGN_OUT_MSG = "Thank you for giving your best today. Safe journey home.";

  const initAudio = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    } catch (e) {
      console.warn("Audio Context init failed", e);
    }
  }, []);

  useEffect(() => {
    const savedStaff = localStorage.getItem('facetrack-v1-staff');
    if (savedStaff) setStaffList(JSON.parse(savedStaff));

    const savedHistory = localStorage.getItem('facetrack-v1-history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const savedUrl = localStorage.getItem('facetrack-v1-webhook');
    if (savedUrl) setWebhookUrl(savedUrl);
  }, []);

  const fetchFromCloud = useCallback(async () => {
    if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com') || isSyncing) return;
    setIsSyncing(true);
    try {
      const cloudData = await geminiService.fetchCloudData(webhookUrl);
      if (cloudData) {
        if (cloudData.history) {
          setHistory(prev => {
            const existingIds = new Set(prev.map(r => r.id));
            const newRecords = cloudData.history.filter((r: any) => !existingIds.has(r.id));
            if (newRecords.length === 0) return prev;
            return [...newRecords, ...prev].sort((a, b) => 
              new Date(b.date + ' ' + b.timestamp).getTime() - new Date(a.date + ' ' + a.timestamp).getTime()
            );
          });
        }
        if (cloudData.staff) {
          setStaffList(prev => {
            const existingIds = new Set(prev.map(s => s.id));
            const newStaff = cloudData.staff.filter((s: any) => !existingIds.has(s.id));
            if (newStaff.length === 0) return prev;
            return [...prev, ...newStaff];
          });
        }
        setLastSync(new Date());
      }
    } catch (err) {
      // Background sync error handled silently
    } finally {
      setIsSyncing(false);
    }
  }, [webhookUrl, isSyncing]);

  useEffect(() => {
    if (webhookUrl) {
      fetchFromCloud();
      const interval = setInterval(fetchFromCloud, 300000);
      return () => clearInterval(interval);
    }
  }, [webhookUrl, fetchFromCloud]);

  useEffect(() => localStorage.setItem('facetrack-v1-staff', JSON.stringify(staffList)), [staffList]);
  useEffect(() => localStorage.setItem('facetrack-v1-history', JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem('facetrack-v1-webhook', webhookUrl), [webhookUrl]);

  const playGreeting = async (type: 'SIGN_IN' | 'SIGN_OUT') => {
    initAudio();
    const text = type === 'SIGN_IN' ? SIGN_IN_MSG : SIGN_OUT_MSG;
    const audioData = await geminiService.generateSpeech(text);
    if (audioData && audioContextRef.current) {
      try {
        const ctx = audioContextRef.current;
        const audioBuffer = await geminiService.decodeAudioData(audioData, ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();
      } catch (err) {
        console.warn("Audio playback failed.");
      }
    }
  };

  const handleRegister = async (newStaff: StaffMember) => {
    if (staffList.some(s => s.id === newStaff.id)) {
      setToast({ message: `ID ${newStaff.id} already exists.`, type: 'error' });
      return;
    }
    setStaffList(prev => [...prev, newStaff]);
    if (webhookUrl) {
      geminiService.syncStaffToCloud(newStaff, webhookUrl);
      setToast({ message: `${newStaff.name} saved. Cloud syncing...`, type: 'success' });
    } else {
      setToast({ message: `${newStaff.name} registered locally.`, type: 'success' });
    }
    setActiveTab('attendance');
  };

  const handleRecognition = useCallback(async (result: RecognitionResult) => {
    // Robust check for injected build-time API key
    const currentApiKey = process.env.API_KEY;
    if (!currentApiKey || currentApiKey === "undefined" || currentApiKey === "") {
       setErrorOverlay("API Key is missing. Please ensure your environment is configured by adding API_KEY to your Netlify/Vercel dashboard and triggering a new build.");
       return;
    }

    if (staffList.length === 0) {
      setToast({ message: "No staff registered. Please register team members first.", type: 'error' });
      return;
    }

    setIsProcessing(true);
    try {
      if (result.identified && result.staffId && result.staffName) {
        const now = new Date();
        const newRecord: AttendanceRecord = {
          id: Math.random().toString(36).substr(2, 9),
          staffId: result.staffId,
          staffName: result.staffName,
          timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: now.toLocaleDateString(),
          status: 'PRESENT',
          type: clockMode,
          method: 'FACE_RECOGNITION'
        };

        const currentStaff = staffList.find(s => s.id === result.staffId);

        setHistory(prev => [newRecord, ...prev]);
        
        // Show high-impact on-screen success overlay with requested messages
        setSuccessOverlay({
          name: result.staffName,
          avatar: currentStaff?.avatarUrl || '',
          message: clockMode === 'SIGN_IN' ? SIGN_IN_MSG : SIGN_OUT_MSG,
          type: clockMode
        });

        playGreeting(clockMode);
        
        // Success overlay persistence
        setTimeout(() => setSuccessOverlay(null), 10000);

        if (webhookUrl) {
           geminiService.syncToGoogleSheets(newRecord, webhookUrl)
             .then(() => fetchFromCloud())
             .catch(() => {});
        }
      } else {
        setToast({ message: result.message || "Identification failed. Ensure clear lighting.", type: 'error' });
      }
    } catch (err: any) {
      if (err.message.includes("API Key")) {
        setErrorOverlay(err.message);
      } else {
        setToast({ message: err.message || "Unexpected error during recognition.", type: 'error' });
      }
    } finally {
      setIsProcessing(false);
    }
  }, [staffList, webhookUrl, clockMode, fetchFromCloud, initAudio]);

  return (
    <div className="min-h-screen bg-slate-50 pb-12 font-sans relative">
      {/* ERROR OVERLAY */}
      {errorOverlay && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-slate-900/95 backdrop-blur-3xl animate-in fade-in duration-300">
           <div className="bg-white rounded-[40px] p-10 max-w-lg w-full shadow-2xl text-center border border-rose-100 scale-up-center">
              <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Configuration Required</h3>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                The Gemini API Key is missing. Please add <code className="bg-slate-100 px-1 rounded">API_KEY</code> to your environment variables and redeploy.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all"
              >
                Retry Connection
              </button>
           </div>
        </div>
      )}

      {/* SUCCESS OVERLAY */}
      {successOverlay && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-indigo-900/90 backdrop-blur-xl animate-in fade-in duration-500">
           <div className="bg-white rounded-[40px] p-10 max-w-sm w-full shadow-2xl text-center scale-up-center border-4 border-white/20">
              <div className="relative inline-block mb-6">
                 {successOverlay.avatar ? (
                   <img src={successOverlay.avatar} alt={successOverlay.name} className="w-32 h-32 rounded-full object-cover border-4 border-indigo-100 mx-auto" />
                 ) : (
                   <div className="w-32 h-32 rounded-full bg-indigo-100 flex items-center justify-center text-4xl font-black text-indigo-600 mx-auto">
                     {successOverlay.name.charAt(0)}
                   </div>
                 )}
                 <div className={`absolute -bottom-2 -right-2 w-12 h-12 rounded-full flex items-center justify-center border-4 border-white shadow-lg ${successOverlay.type === 'SIGN_IN' ? 'bg-emerald-500' : 'bg-indigo-600'}`}>
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                 </div>
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">Verified!</h2>
              <p className="text-indigo-600 font-bold mb-4">{successOverlay.name}</p>
              <p className="text-slate-500 text-sm italic">"{successOverlay.message}"</p>
              <div className="mt-8">
                 <button 
                  onClick={() => setSuccessOverlay(null)}
                  className="px-8 py-3 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                 >
                   Dismiss
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* TOASTS */}
      {toast && (
        <div className={`fixed top-10 left-1/2 -translate-x-1/2 z-[600] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border animate-in slide-in-from-top-10 duration-300
          ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 
            toast.type === 'error' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>
          <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-rose-500' : 'bg-indigo-500'}`}></div>
          <span className="text-xs font-bold uppercase tracking-wider">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-50 transition-opacity">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
             <div className="w-5 h-5 border-[3px] border-white rounded-full"></div>
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-[3px]">FaceTrack AI</h1>
            <div className="flex items-center gap-2">
               <span className="flex w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Biometric Security Active</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {lastSync && (
             <span className="hidden md:block text-[9px] font-bold text-slate-400 uppercase tracking-widest">
               Cloud Synced: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
             </span>
           )}
           <button 
            onClick={fetchFromCloud}
            disabled={isSyncing || !webhookUrl}
            className={`p-2.5 rounded-xl border border-slate-100 transition-all ${isSyncing ? 'animate-spin' : 'hover:bg-slate-50 active:scale-95'}`}
           >
             <svg className={`w-5 h-5 ${webhookUrl ? 'text-indigo-600' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
             </svg>
           </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-6 mt-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
           
           {/* LEFT COLUMN: SCANNER */}
           <div className="lg:col-span-5 space-y-8">
              <div className="flex items-center justify-between bg-white p-2 rounded-3xl border border-slate-100 shadow-sm">
                 <button 
                   onClick={() => setClockMode('SIGN_IN')}
                   className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[3px] transition-all
                     ${clockMode === 'SIGN_IN' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'text-slate-400 hover:bg-slate-50'}`}
                 >
                   Sign In
                 </button>
                 <button 
                   onClick={() => setClockMode('SIGN_OUT')}
                   className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[3px] transition-all
                     ${clockMode === 'SIGN_OUT' ? 'bg-indigo-900 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:bg-slate-50'}`}
                 >
                   Sign Out
                 </button>
              </div>

              <div className="relative">
                <CameraScanner 
                  onResult={handleRecognition} 
                  isProcessing={isProcessing} 
                  staffList={staffList}
                />
              </div>

              <div className="bg-indigo-600 rounded-[40px] p-8 text-white shadow-2xl relative overflow-hidden">
                 <div className="relative z-10">
                    <h3 className="text-lg font-black uppercase tracking-widest mb-1">Status Report</h3>
                    <p className="text-white/60 text-xs mb-6">Real-time attendance summary</p>
                    
                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/10">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-60 block mb-1">Registered</span>
                          <span className="text-2xl font-black">{staffList.length}</span>
                       </div>
                       <div className="bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/10">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-60 block mb-1">Today</span>
                          <span className="text-2xl font-black">
                            {new Set(history.filter(h => h.date === new Date().toLocaleDateString()).map(h => h.staffId)).size}
                          </span>
                       </div>
                    </div>
                 </div>
                 {/* Decorative element */}
                 <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
              </div>
           </div>

           {/* RIGHT COLUMN: DATA */}
           <div className="lg:col-span-7 space-y-8">
              {/* TABS */}
              <div className="flex gap-6 border-b border-slate-200">
                 {['attendance', 'registration', 'settings'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as any)}
                      className={`pb-4 text-[10px] font-black uppercase tracking-[3px] transition-all relative
                        ${activeTab === tab ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {tab}
                      {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full"></div>}
                    </button>
                 ))}
              </div>

              {/* TAB CONTENT */}
              <div className="min-h-[600px]">
                 {activeTab === 'attendance' && (
                    <div className="space-y-6 animate-in fade-in duration-500">
                       <div className="flex items-center justify-between">
                          <h2 className="text-xl font-black text-slate-900">Recent Logs</h2>
                          <button 
                            onClick={() => { setHistory([]); localStorage.removeItem('facetrack-v1-history'); }}
                            className="text-[10px] font-black text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest"
                          >
                            Clear Local History
                          </button>
                       </div>
                       
                       {history.length === 0 ? (
                         <div className="bg-white border border-slate-100 rounded-[40px] p-20 text-center shadow-sm">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                               <svg className="w-8 h-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No attendance recorded yet</p>
                         </div>
                       ) : (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {history.slice(0, 10).map(record => (
                              <AttendanceCard key={record.id} record={record} />
                            ))}
                         </div>
                       )}
                    </div>
                 )}

                 {activeTab === 'registration' && (
                    <div className="animate-in slide-in-from-right-10 duration-500">
                      <StaffRegistration onRegister={handleRegister} />
                      <div className="mt-10">
                         <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Registered Team Members</h3>
                         <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {staffList.map(staff => (
                              <div key={staff.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm text-center relative group">
                                 <button 
                                   onClick={() => setStaffList(prev => prev.filter(s => s.id !== staff.id))}
                                   className="absolute top-2 right-2 w-6 h-6 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                 >
                                   <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                 </button>
                                 <img 
                                   src={staff.avatarUrl} 
                                   alt={staff.name} 
                                   className="w-16 h-16 rounded-full object-cover mx-auto mb-3 border-2 border-slate-50"
                                   onError={(e) => { (e.target as any).src = 'https://ui-avatars.com/api/?name=' + staff.name; }}
                                 />
                                 <h4 className="font-bold text-slate-800 text-xs truncate">{staff.name}</h4>
                                 <p className="text-[9px] text-slate-400 font-medium uppercase tracking-widest">{staff.role}</p>
                              </div>
                            ))}
                         </div>
                      </div>
                    </div>
                 )}

                 {activeTab === 'settings' && (
                    <SheetConfig webhookUrl={webhookUrl} onUrlChange={setWebhookUrl} />
                 )}
              </div>
           </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="mt-20 border-t border-slate-100 py-10 text-center">
         <p className="text-[10px] font-black text-slate-300 uppercase tracking-[5px]">Biometric Attendance Terminal • v1.2.0</p>
      </footer>
    </div>
  );
};

export default App;
