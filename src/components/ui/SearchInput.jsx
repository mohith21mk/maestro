import React from 'react';
import { Search, X } from 'lucide-react';

export default function SearchInput({ value, onChange, placeholder = "Search...", onClear, className = "" }) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2 text-sm font-medium rounded-xl border border-[#1E293B] bg-[#141C2B] hover:border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-slate-400 text-slate-100 shadow-2xs h-9 min-h-[36px]"
      />
      {value && onClear && (
        <button
          onClick={onClear}
          className="absolute right-2.5 p-0.5 text-slate-400 hover:text-white rounded-md cursor-pointer"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}