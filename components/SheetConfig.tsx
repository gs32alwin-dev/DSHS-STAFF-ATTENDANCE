
import React, { useState } from 'react';
import { geminiService } from '../services/geminiService';

interface SheetConfigProps {
  webhookUrl: string;
  onUrlChange: (url: string) => void;
}

export const SheetConfig: React.FC<SheetConfigProps> = ({ webhookUrl, onUrlChange }) => {
  const [testStatus, setTestStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });

  const handleTest = async () => {
    setTestStatus({ type: 'loading', message: 'Testing connection...' });
    const result = await geminiService.testConnection(webhookUrl);
    setTestStatus({ 
      type: result.success ? 'success' : 'error', 
      message: result.message 
    });
  };

  const scriptCode = `// PASTE THIS IN GOOGLE APPS SCRIPT
// This script is optimized for Google Sheets environment
function doGet(e) {
  var action = e.parameter.action;
  
  // Basic connectivity test
  if (action === 'test') {
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var historySheet = ss.getSheetByName("Attendance") || ss.insertSheet("Attendance");
  var staffSheet = ss.getSheetByName("Staff") || ss.insertSheet("Staff");
  
  // Ensure headers exist
  if (historySheet.getLastRow() === 0) {
    historySheet.appendRow(["Name", "ID", "Date", "Time", "Type", "Method", "Status", "UID"]);
  }
  if (staffSheet.getLastRow() === 0) {
    staffSheet.appendRow(["Name", "Role", "ID", "Avatar"]);
  }

  if (action === 'get_data') {
    var history = historySheet.getDataRange().getValues();
    var staff = staffSheet.getDataRange().getValues();
    
    var historyData = history.length > 1 ? history.slice(1).map(row => ({
      staffName: row[0], staffId: row[1], date: row[2], timestamp: row[3], type: row[4], method: row[5], status: row[6], id: row[7]
    })) : [];
    
    var staffData = staff.length > 1 ? staff.slice(1).map(row => ({
      name: row[0], role: row[1], id: row[2], avatarUrl: row[3]
    })) : [];

    return ContentService.createTextOutput(JSON.stringify({ history: historyData, staff: staffData }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (payload.action === 'add_record') {
      var sheet = ss.getSheetByName("Attendance") || ss.insertSheet("Attendance");
      var d = payload.data;
      sheet.appendRow([d.staffName, d.staffId, d.date, d.timestamp, d.type, d.method, d.status, d.id]);
    }
    
    if (payload.action === 'add_staff') {
      var sheet = ss.getSheetByName("Staff") || ss.insertSheet("Staff");
      var s = payload.data;
      sheet.appendRow([s.name, s.role, s.id, s.avatarUrl]);
    }
    
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService.createTextOutput("Error: " + err.message).setMimeType(ContentService.MimeType.TEXT);
  }
}`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-xl">
        <h3 className="text-2xl font-black text-slate-900 mb-2">Cloud Configuration</h3>
        <p className="text-sm text-slate-500 mb-8">Connect your app to Google Sheets to track attendance <b>from anywhere</b>.</p>
        
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Apps Script Web App URL</label>
            <div className="flex gap-3">
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-grow px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none font-mono text-sm bg-slate-50 transition-all"
              />
              <button 
                onClick={handleTest}
                disabled={!webhookUrl || testStatus.type === 'loading'}
                className={`px-6 py-4 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95
                  ${testStatus.type === 'loading' ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                TEST
              </button>
            </div>
            {testStatus.message && (
              <p className={`mt-3 text-xs font-bold px-4 py-2 rounded-xl border ${
                testStatus.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'
              }`}>
                {testStatus.message}
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl">
               <div className="flex items-center gap-3 mb-3">
                 <div className="w-8 h-8 bg-rose-500 rounded-full flex items-center justify-center shadow-lg shadow-rose-200">
                   <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                 </div>
                 <h4 className="font-black text-rose-900 text-sm">Bypass Verification Warning</h4>
               </div>
               <p className="text-[11px] text-rose-800 leading-relaxed font-medium">
                 1. Click <span className="font-bold underline">Advanced</span> on the Google warning screen.<br/>
                 2. Click <span className="font-bold underline">Go to [Project Name] (unsafe)</span>.<br/>
                 3. This screen only appears during first authorization.
               </p>
            </div>

            <div className="p-6 bg-amber-50 border border-amber-100 rounded-3xl">
               <div className="flex items-center gap-3 mb-3">
                 <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shadow-lg shadow-amber-200">
                   <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 </div>
                 <h4 className="font-black text-amber-900 text-sm">Critical: Fix "Failed to fetch"</h4>
               </div>
               <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                 In the <b>New Deployment</b> settings, you MUST set:<br/>
                 <b>Who has access:</b> <span className="font-bold underline">Anyone</span>.<br/>
                 If you set it to "Only myself", the app cannot talk to your sheet.
               </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 text-white p-10 rounded-[40px] shadow-2xl overflow-hidden relative border border-slate-800">
        <h4 className="text-2xl font-black mb-6">Setup Global Sync</h4>
        
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <span className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-black shrink-0">1</span>
            <p className="text-sm text-slate-400 leading-relaxed">Create a Google Sheet and name two tabs: <span className="text-white font-bold italic">Attendance</span> and <span className="text-white font-bold italic">Staff</span>.</p>
          </div>
          <div className="flex items-start gap-4">
            <span className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-black shrink-0">2</span>
            <p className="text-sm text-slate-400 leading-relaxed">Go to <span className="text-white font-bold">Extensions > Apps Script</span> and paste the code below.</p>
          </div>
          <div className="flex items-start gap-4">
            <span className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-black shrink-0">3</span>
            <p className="text-sm text-slate-400 leading-relaxed">Click <span className="text-white font-bold">Deploy > New Deployment</span>. Select <span className="text-white font-bold">Web App</span>. <b>IMPORTANT:</b> Set access to <span className="text-white font-bold italic underline">Anyone</span>.</p>
          </div>
        </div>

        <div className="mt-10 relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[3px]">Script Editor</span>
            <button 
              onClick={() => { navigator.clipboard.writeText(scriptCode); alert("Code Copied!"); }}
              className="text-[10px] font-black text-indigo-400 hover:text-white transition-colors"
            >
              COPY FULL SCRIPT
            </button>
          </div>
          <pre className="bg-black/50 p-6 rounded-3xl font-mono text-[11px] overflow-x-auto border border-white/5 text-emerald-400 leading-relaxed max-h-[300px] custom-scrollbar">
            {scriptCode}
          </pre>
        </div>
      </div>
    </div>
  );
};
