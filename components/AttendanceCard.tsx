import React from 'react';
import { AttendanceRecord } from '../types';

interface AttendanceCardProps {
  record: AttendanceRecord;
}

export const AttendanceCard: React.FC<AttendanceCardProps> = ({ record }) => {
  const isSignIn = record.type === 'SIGN_IN';
  
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between transition-all hover:shadow-md">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isSignIn ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-900'}`}>
          {record.staffName.charAt(0)}
        </div>
        <div>
          <h4 className="font-semibold text-slate-800">{record.staffName}</h4>
          <p className="text-[10px] text-slate-400 font-mono">ID: {record.staffId}</p>
          <p className="text-[10px] text-slate-500">{record.date} • {record.method}</p>
        </div>
      </div>
      <div className="text-right">
        <span className="text-sm font-medium text-slate-900 block">{record.timestamp}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isSignIn ? 'bg-emerald-500 text-white' : 'bg-indigo-900 text-white'}`}>
          {record.type.replace('_', ' ')}
        </span>
      </div>
    </div>
  );
};