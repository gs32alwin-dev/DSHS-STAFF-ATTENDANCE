
import React from 'react';

interface SheetConfigProps {
  webhookUrl: string;
  onUrlChange: (url: string) => void;
}

export const SheetConfig: React.FC<SheetConfigProps> = ({ webhookUrl, onUrlChange }) => {
  const scriptCode = `function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  // Append data: Name, Staff ID, Date, Time, Type, Method, Status
  sheet.appendRow([
    data.staffName,
    data.staffId,
    data.date,
    data.timestamp,
    data.type,      // SIGN_IN or SIGN_OUT
    data.method,
    data.status
  ]);
  
  return ContentService.createTextOutput("Success")
    .setMimeType(ContentService.MimeType.TEXT);
}`;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="text-2xl font-bold text-slate-900 mb-2">Cloud Sync Setup</h3>
        <p className="text-slate-500 mb-6">If Google Sheets is not responding, ensure your Web App is deployed as <b>"Anyone"</b>.</p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Google Apps Script URL</label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm bg-slate-50"
            />
          </div>
          <div className="flex gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
             <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
             <p className="text-xs text-amber-800"><b>Note:</b> Your Google Sheet should have columns in this order: Name, Staff ID, Date, Time, Type, Method, Status.</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl overflow-hidden relative border border-slate-800">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
        </div>
        
        <h4 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 bg-indigo-500 rounded-full text-xs">1</span>
          Setup Instructions
        </h4>
        
        <ol className="space-y-4 text-sm text-slate-300 list-decimal list-inside mb-8">
          <li>Create a new <span className="text-white font-bold">Google Sheet</span>.</li>
          <li>Go to <span className="text-white font-mono">Extensions</span> &gt; <span className="text-white font-mono">Apps Script</span>.</li>
          <li>Paste the code below into the editor.</li>
          <li>Click <span className="text-white font-bold">Deploy</span> &gt; <span className="text-white font-bold">New Deployment</span>.</li>
          <li>Type: <span className="text-white font-bold">Web App</span>.</li>
          <li>Execute as: <span className="text-white font-bold">Me</span>.</li>
          <li>Who has access: <span className="text-white font-bold">Anyone</span>.</li>
          <li>Copy the URL and paste it above.</li>
        </ol>

        <h4 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 bg-indigo-500 rounded-full text-xs">2</span>
          The Script Code
        </h4>
        
        <div className="relative">
          <pre className="bg-black/80 p-6 rounded-xl font-mono text-xs overflow-x-auto border border-white/10 text-emerald-400">
            {scriptCode}
          </pre>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(scriptCode);
              alert("Code copied!");
            }}
            className="absolute top-3 right-3 bg-white/10 hover:bg-indigo-600 px-3 py-1.5 rounded-lg text-xs transition-all font-bold"
          >
            Copy Script
          </button>
        </div>
      </div>
    </div>
  );
};
