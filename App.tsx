
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
  
  const audioContextRef = useRef<AudioContext | null>(null);

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
      // Background fetch error silenced
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
        console.warn("Audio blocked.");
      }
    }
  };

  const handleRegister = async (newStaff: StaffMember) => {
    if (staffList.some(s => s.id === newStaff.id)) {
      setToast({ message: `ID ${newStaff.id} is already in use.`, type: 'error' });
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
    if (staffList.length === 0) {
      setToast({ message: "Register staff first to enable recognition.", type: 'error' });
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
        
        // Show prominent on-screen overlay
        setSuccessOverlay({
          name: result.staffName,
          avatar: currentStaff?.avatarUrl || '',
          message: clockMode === 'SIGN_IN' ? SIGN_IN_MSG : SIGN_OUT_MSG,
          type: clockMode
        });

        playGreeting(clockMode);
        
        // Clear overlay after 6 seconds
        setTimeout(() => setSuccessOverlay(null), 6000);

        if (webhookUrl) {
           geminiService.syncToGoogleSheets(newRecord, webhookUrl)
             .then(() => fetchFromCloud())
             .catch(() => {});
        }
      } else {
        setToast({ message: result.message || "Could not identify person.", type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message || "Recognition Error.", type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }, [staffList, webhookUrl, clockMode, fetchFromCloud, initAudio]);

  return (
    <div className="min-h-screen bg-slate-50 pb-12 font-sans relative">
      {/* Success Modal Overlay */}
      {successOverlay && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-xl animate-in fade-in duration-500">
           <div className="bg-white rounded-[40px] p-8 md:p-12 max-w-lg w-full shadow-2xl text-center border border-white/20 scale-up-center">
              <div className="relative inline-block mb-8">
                <img 
                  src={successOverlay.avatar} 
                  className="w-32 h-32 md:w-40 md:h-40 rounded-[35px] mx-auto object-cover shadow-2xl border-4 border-white" 
                  alt="" 
                />
                <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg ${
                  successOverlay.type === 'SIGN_IN' ? 'bg-emerald-500' : 'bg-indigo-600'
                }`}>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              
              <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
                {successOverlay.name}
              </h2>
              
              <div className={`inline-block px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[3px] mb-8 ${
                successOverlay.type === 'SIGN_IN' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-900'
              }`}>
                {successOverlay.type.replace('_', ' ')} SUCCESSFUL
              </div>
              
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <p className="text-xl font-bold text-slate-700 leading-relaxed italic">
                  "{successOverlay.message}"
                </p>
              </div>
              
              <button 
                onClick={() => setSuccessOverlay(null)}
                className="mt-8 text-slate-400 text-xs font-black uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Tap to dismiss
              </button>
           </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 leading-none tracking-tight">FaceTrack Pro</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`w-2 h-2 rounded-full ${webhookUrl ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {webhookUrl ? 'Netlify Live Sync' : 'Standalone Mode'}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex bg-slate-100 p-1.5 rounded-2xl">
          {[
            { id: 'attendance', label: 'Scan' },
            { id: 'registration', label: 'Staff' },
            { id: 'settings', label: 'Setup' }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => { initAudio(); setActiveTab(tab.id as any); }}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8">
        {activeTab === 'attendance' && (
          <div className="grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-7">
              <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-xl text-center relative overflow-hidden">
                <div className="mb-6 inline-flex bg-slate-100 p-1.5 rounded-2xl shadow-inner">
                  <button 
                    onClick={() => { initAudio(); setClockMode('SIGN_IN'); }}
                    className={`px-10 py-4 rounded-xl text-sm font-black transition-all ${clockMode === 'SIGN_IN' ? 'bg-emerald-500 text-white shadow-xl scale-105' : 'text-slate-500'}`}
                  >
                    SIGN IN
                  </button>
                  <button 
                    onClick={() => { initAudio(); setClockMode('SIGN_OUT'); }}
                    className={`px-10 py-4 rounded-xl text-sm font-black transition-all ${clockMode === 'SIGN_OUT' ? 'bg-indigo-900 text-white shadow-xl scale-105' : 'text-slate-500'}`}
                  >
                    SIGN OUT
                  </button>
                </div>

                <div className="mb-8 h-16 flex flex-col justify-center">
                  <h2 className={`text-xl font-black ${clockMode === 'SIGN_IN' ? 'text-emerald-600' : 'text-indigo-900'}`}>
                    {clockMode === 'SIGN_IN' ? 'Morning Sign-In' : 'Evening Sign-Out'}
                  </h2>
                </div>
                
                <CameraScanner onResult={handleRecognition} isProcessing={isProcessing} staffList={staffList} />
                
                <div className="mt-10 flex items-center justify-center gap-8 border-t border-slate-50 pt-8">
                  <div className="text-left">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">AI Core</p>
                    <p className="text-xs font-bold text-slate-600">Gemini 3 Flash</p>
                  </div>
                  <div className="w-px h-8 bg-slate-100"></div>
                  <div className="text-left">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">Last Sync</p>
                    <p className="text-xs font-bold text-slate-600">
                      {lastSync ? lastSync.toLocaleTimeString() : 'Local Only'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl h-full">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-8">Activity Logs</h3>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {history.length > 0 ? (
                    history.map(record => <AttendanceCard key={record.id} record={record} />)
                  ) : (
                    <div className="text-center py-24 border-2 border-dashed border-slate-100 rounded-[30px] text-slate-300">
                      <p className="font-bold text-sm">No activity logged yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'registration' && (
          <div className="grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5">
              <StaffRegistration onRegister={handleRegister} />
            </div>
            <div className="lg:col-span-7 bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl">
              <h3 className="text-2xl font-black text-slate-900 mb-8">Staff Directory</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {staffList.length > 0 ? staffList.map(staff => (
                  <div key={staff.id} className="bg-slate-50 p-5 rounded-3xl border border-transparent hover:border-indigo-200 transition-all flex items-center gap-4">
                    <img src={staff.avatarUrl} className="w-14 h-14 rounded-2xl object-cover shadow-sm" alt="" />
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-900 leading-tight truncate">{staff.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{staff.role}</p>
                    </div>
                  </div>
                )) : (
                   <div className="col-span-2 text-center py-20 text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
                     <p className="font-bold">Database Empty</p>
                   </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto">
            <SheetConfig webhookUrl={webhookUrl} onUrlChange={setWebhookUrl} />
          </div>
        )}
      </main>

      {toast && (
        <div className={`fixed bottom-8 right-8 left-8 md:left-auto md:w-[450px] p-6 rounded-3xl shadow-2xl flex items-center gap-4 z-[110] animate-bounce-in border border-white/10 backdrop-blur-xl
          ${toast.type === 'success' ? 'bg-slate-900 text-white' : toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
          <div className="shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold">
             {toast.type === 'success' ? '✓' : '!'}
          </div>
          <p className="text-sm font-bold leading-snug">{toast.message}</p>
        </div>
      )}

      <style>{`
        @keyframes scale-up-center {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .scale-up-center { animation: scale-up-center 0.5s cubic-bezier(0.390, 0.575, 0.565, 1.000) both; }
        
        @keyframes bounce-in {
          0% { transform: translateY(100px); opacity: 0; }
          70% { transform: translateY(-10px); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-bounce-in { animation: bounce-in 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>
    </div>
  );
};

export default App;
