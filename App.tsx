
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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence: Load data on mount
  useEffect(() => {
    const savedStaff = localStorage.getItem('facetrack-v1-staff');
    if (savedStaff) {
      try {
        setStaffList(JSON.parse(savedStaff));
      } catch (e) {
        console.error("Error loading staff", e);
      }
    }

    const savedHistory = localStorage.getItem('facetrack-v1-history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Error loading history", e);
      }
    }

    const savedUrl = localStorage.getItem('facetrack-v1-webhook');
    if (savedUrl) setWebhookUrl(savedUrl);
  }, []);

  // Persistence: Save data on change
  useEffect(() => {
    localStorage.setItem('facetrack-v1-staff', JSON.stringify(staffList));
  }, [staffList]);

  useEffect(() => {
    localStorage.setItem('facetrack-v1-history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('facetrack-v1-webhook', webhookUrl);
  }, [webhookUrl]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleRegister = (newStaff: StaffMember) => {
    // Check if ID already exists
    if (staffList.some(s => s.id === newStaff.id)) {
      setToast({ message: `Staff ID ${newStaff.id} already exists!`, type: 'error' });
      return;
    }
    setStaffList(prev => [...prev, newStaff]);
    setToast({ message: `${newStaff.name} (ID: ${newStaff.id}) registered successfully!`, type: 'success' });
    setActiveTab('attendance');
  };

  const handleRecognition = useCallback(async (result: RecognitionResult) => {
    if (staffList.length === 0) {
      setToast({ message: "No staff registered. Please register someone first.", type: 'error' });
      return;
    }

    setIsProcessing(true);
    
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

      try {
        setHistory(prev => [newRecord, ...prev]);
        
        if (webhookUrl) {
           await geminiService.syncToGoogleSheets(newRecord, webhookUrl);
           setToast({ 
             message: `Success! ${result.staffName} ${clockMode === 'SIGN_IN' ? 'signed in' : 'signed out'}. Synced to Sheet.`, 
             type: 'success' 
           });
        } else {
           setToast({ 
             message: `Success! ${result.staffName} ${clockMode === 'SIGN_IN' ? 'signed in' : 'signed out'} locally.`, 
             type: 'info' 
           });
        }
      } catch (err) {
        setToast({ message: "Attendance saved locally, but cloud sync failed.", type: 'error' });
      }
    } else {
      setToast({ message: result.message || "Identity could not be verified.", type: 'error' });
    }
    
    setIsProcessing(false);
  }, [staffList, webhookUrl, clockMode]);

  const deleteStaff = (id: string) => {
    if (window.confirm("Are you sure you want to remove this staff member? This will stop recognition for them.")) {
      setStaffList(prev => prev.filter(s => s.id !== id));
      setToast({ message: "Staff member removed.", type: 'info' });
    }
  };

  const exportStaffData = () => {
    const dataStr = JSON.stringify(staffList);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `staff_backup_${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    setToast({ message: "Staff database backup downloaded!", type: 'success' });
  };

  const importStaffData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          if (window.confirm(`Merge ${imported.length} staff members with existing list?`)) {
            // Filter out duplicates by ID
            setStaffList(prev => {
              const existingIds = new Set(prev.map(s => s.id));
              const newItems = imported.filter(s => !existingIds.has(s.id));
              return [...prev, ...newItems];
            });
            setToast({ message: "Staff data imported and merged!", type: 'success' });
          }
        }
      } catch (err) {
        setToast({ message: "Invalid backup file.", type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const downloadCSV = () => {
    if (history.length === 0) {
      setToast({ message: "No data to export.", type: 'error' });
      return;
    }

    const headers = ["Name", "Staff ID", "Date", "Timestamp", "Type", "Status"];
    const rows = history.map(r => [
      r.staffName,
      `"${r.staffId}"`, // Wrap in quotes to preserve formatting in Excel
      r.date,
      r.timestamp,
      r.type,
      r.status
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
    setToast({ message: "Attendance report downloaded!", type: 'success' });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 leading-none tracking-tight">FaceTrack Pro</h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-1">Smart Attendance System</p>
          </div>
        </div>

        <nav className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('attendance')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'attendance' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Clock
          </button>
          <button 
            onClick={() => setActiveTab('registration')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'registration' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Directory
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'settings' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Settings
          </button>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 mt-8">
        {activeTab === 'attendance' && (
          <div className="grid lg:grid-cols-12 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center">
                <div className="mb-8 inline-flex bg-slate-100 p-1 rounded-2xl">
                  <button 
                    onClick={() => setClockMode('SIGN_IN')}
                    className={`px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${clockMode === 'SIGN_IN' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                  >
                    SIGN IN
                  </button>
                  <button 
                    onClick={() => setClockMode('SIGN_OUT')}
                    className={`px-8 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${clockMode === 'SIGN_OUT' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                  >
                    SIGN OUT
                  </button>
                </div>

                <h2 className="text-3xl font-extrabold text-slate-900">
                  {clockMode === 'SIGN_IN' ? 'Welcome Back!' : 'Signing Out?'}
                </h2>
                <p className="text-slate-500 mt-2 mb-8">Scan your face clearly to record your time.</p>
                
                <CameraScanner onResult={handleRecognition} isProcessing={isProcessing} staffList={staffList} />
                
                <div className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    AI Recognition Ready
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${webhookUrl ? 'bg-indigo-500' : 'bg-amber-400'}`}></span>
                    {webhookUrl ? 'Syncing to Sheets' : 'Saving Locally'}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-slate-800">Live Logs</h3>
                  <div className="flex gap-2">
                    <button onClick={downloadCSV} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold">
                      EXPORT CSV
                    </button>
                  </div>
                </div>
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {history.length > 0 ? (
                    history.map(record => <AttendanceCard key={record.id} record={record} />)
                  ) : (
                    <div className="text-center py-20 border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-sm">
                      No logs for this session.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'registration' && (
          <div className="grid lg:grid-cols-12 gap-10 animate-in fade-in duration-500">
            <div className="lg:col-span-5">
              <StaffRegistration onRegister={handleRegister} />
            </div>
            <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Staff List</h3>
                  <p className="text-xs text-slate-400 font-medium">Total: {staffList.length}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={exportStaffData}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    BACKUP
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    RESTORE
                  </button>
                  <input type="file" ref={fileInputRef} onChange={importStaffData} className="hidden" accept=".json" />
                </div>
              </div>
              
              <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar flex-grow">
                {staffList.length > 0 ? staffList.map(staff => (
                  <div key={staff.id} className="group flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all">
                    <div className="flex items-center gap-4">
                      <img src={staff.avatarUrl} alt={staff.name} className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm" />
                      <div>
                        <h4 className="font-bold text-slate-800">{staff.name}</h4>
                        <p className="text-xs text-slate-500">{staff.role}</p>
                        <p className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded inline-block mt-1">ID: {staff.id}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteStaff(staff.id)} 
                      className="p-3 bg-slate-50 hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded-xl transition-all shadow-sm"
                      title="Delete Staff"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                )) : (
                  <div className="text-center py-20 text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
                    <p>No staff registered.</p>
                    <p className="text-xs mt-1">Use the form on the left to add your team.</p>
                  </div>
                )}
              </div>

              {staffList.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <button 
                    onClick={() => { if(window.confirm("ERASE ALL STAFF? This cannot be undone!")) setStaffList([]); }}
                    className="text-rose-500 text-xs font-bold hover:underline"
                  >
                    Delete All Staff Data
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl mx-auto">
            <SheetConfig webhookUrl={webhookUrl} onUrlChange={setWebhookUrl} />
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Manual Export</h3>
              <p className="text-slate-500 mb-6 italic">Fallback option to export your local attendance logs if the cloud sync is failing.</p>
              <button 
                onClick={downloadCSV}
                className="w-full bg-slate-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download Attendance Report (CSV)
              </button>
            </div>
          </div>
        )}
      </main>

      {toast && (
        <div className={`fixed bottom-6 right-6 left-6 md:left-auto md:w-96 p-4 rounded-2xl shadow-2xl flex items-center gap-4 z-[60] animate-bounce-in border border-white/10
          ${toast.type === 'success' ? 'bg-slate-900 text-white' : toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-white/20'}`}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={toast.type === 'success' ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} /></svg>
          </div>
          <p className="text-sm font-bold leading-tight">{toast.message}</p>
        </div>
      )}

      <style>{`
        @keyframes bounce-in {
          0% { transform: translateY(100px); opacity: 0; }
          60% { transform: translateY(-5px); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-bounce-in {
          animation: bounce-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
