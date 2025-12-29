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

  const scriptCode = `// 1. Create a Google Sheet
// 2. Extensions > Apps Script
// 3. Paste this code & SAVE
// 4. Deploy > New Deployment > Web App
// 5. IMPORTANT: Execute as "Me", Who has access: "Anyone"

function doGet(e) {
  var action = e.parameter.action;
  
  if (action === 'test') {
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var historySheet = ss.getSheetByName("Attendance") || ss.insertSheet("Attendance");
  var staffSheet = ss.getSheetByName("Staff") || ss.insertSheet("Staff");
  
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
      staffName: String(row[0]), staffId: String(row[1]), date: String(row[2]), timestamp: String(row[3]), type: String(row[4]), method: String(row[5]), status: String(row[6]), id: String(row[7])
    })) : [];
    
    var staffData = staff.length > 1 ? staff.slice(1).map(row => ({
      name: String(row[0]), role: String(row[1]), id: String(row[2]), avatarUrl: String(row[3])
    })) : [];

    var result = JSON.stringify({ history: historyData, staff: staffData });
    return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
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
          <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-3xl">
             <div className="flex items-center gap-3 mb-3">
               <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                 <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
               </div>
               <h4 className="font-black text-indigo-900 text-sm">Essential: Environment Variable</h4>
             </div>
             <p className="text-[11px] text-indigo-800 leading-relaxed font-medium">
               For face recognition to work, you MUST set an environment variable named <code className="bg-white/50 px-1 rounded font-bold">API_KEY</code> in your Netlify or hosting dashboard. This is independent of the Google Sheet URL below.
             </p>
          </div>

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

          <div className="p-6 bg-amber-50 border border-amber-100 rounded-3xl">
             <div className="flex items-center gap-3 mb-3">
               <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shadow-lg shadow-amber-200">
                 <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
               </div>
               <h4 className="font-black text-amber-900 text-sm">Deployment Check: Avoid "Failed to Fetch"</h4>
             </div>
             <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
               1. In Apps Script, click <span className="font-bold underline">Deploy {' > '} New Deployment</span>.<br/>
               2. Select <span className="font-bold underline">Web App</span>.<br/>
               3. <b>Execute as:</b> Me.<br/>
               4. <b>Who has access:</b> <span className="font-bold italic underline">Anyone</span>.<br/>
               5. After deploying, copy the URL ending in <b>/exec</b> and paste it above.
             </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 text-white p-10 rounded-[40px] shadow-2xl overflow-hidden relative border border-slate-800">
        <h4 className="text-2xl font-black mb-6">Setup Script Code</h4>
        <div className="mt-4 relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[3px]">Script Editor</span>
            <button 
              onClick={() => { navigator.clipboard.writeText(scriptCode); alert("Code Copied!"); }}
              className="text-[10px] font-black text-indigo-400 hover:text-white transition-colors"
            >
              COPY CODE
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
