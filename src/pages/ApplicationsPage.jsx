import React, { useState } from 'react';
import {
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  Building,
  Calendar,
  ChevronRight,
  Plus
} from 'lucide-react';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import SearchInput from '../components/ui/SearchInput';
import EmptyState from '../components/ui/EmptyState';
import { useBusinessAnalysis } from '../context/BusinessAnalysisContext';

export default function ApplicationsPage({ showToast, setModalState }) {
  const { businessTemplateBundle } = useBusinessAnalysis();
  const { applicationsStats, applicationsList: initialApplicationsList } = businessTemplateBundle;

  const [applications, setApplications] = useState(initialApplicationsList);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const departments = ['All', ...new Set(initialApplicationsList.map((a) => a.department))];
  const statuses = ['All', 'Submitted', 'Under Review', 'Approved', 'Pending', 'In Progress'];

  const filteredApps = applications.filter((app) => {
    const matchSearch =
      app.id.toLowerCase().includes(search.toLowerCase()) ||
      app.application.toLowerCase().includes(search.toLowerCase()) ||
      app.department.toLowerCase().includes(search.toLowerCase()) ||
      app.referenceNo.toLowerCase().includes(search.toLowerCase());
    const matchDept = departmentFilter === 'All' || app.department === departmentFilter;
    const matchStatus = statusFilter === 'All' || app.status === statusFilter;
    return matchSearch && matchDept && matchStatus;
  });

  const handleOpenNewApplication = () => {
    setModalState({
      isOpen: true,
      title: 'Submit New Regulatory Application',
      type: 'new-application',
      data: {
        onSubmit: (newApp) => {
          setApplications((prev) => [newApp, ...prev]);
          showToast(`Application ${newApp.id} successfully lodged.`);
        },
      },
    });
  };

  const handleOpenDetail = (app) => {
    setModalState({
      isOpen: true,
      title: `Application Journey: ${app.id}`,
      type: 'application-timeline',
      data: app,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Applications
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Monitor and track your department submissions and statutory clearances.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={handleOpenNewApplication}
          className="self-start sm:self-auto min-h-[36px] text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          <span>New Application</span>
        </Button>
      </div>

      {/* Top 5 Stats Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        <div className="bg-[#111827] rounded-xl border border-[#1E293B] shadow-2xs p-4 sm:p-5 flex items-center justify-between">
          <div>
            <div className="text-xs sm:text-sm font-semibold text-slate-400">Total Applications</div>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1 leading-none">{applicationsStats.total || 3}</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-950/80 text-blue-400 flex items-center justify-center border border-blue-800/80 shrink-0">
            <Send className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#111827] rounded-xl border border-[#1E293B] shadow-2xs p-4 sm:p-5 flex items-center justify-between">
          <div>
            <div className="text-xs sm:text-sm font-semibold text-slate-400">Submitted</div>
            <div className="text-2xl sm:text-3xl font-black text-sky-400 mt-1 leading-none">{applicationsStats.submitted || 1}</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-sky-950/80 text-sky-400 flex items-center justify-center border border-sky-800/80 shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#111827] rounded-xl border border-[#1E293B] shadow-2xs p-4 sm:p-5 flex items-center justify-between">
          <div>
            <div className="text-xs sm:text-sm font-semibold text-slate-400">In Progress / Review</div>
            <div className="text-2xl sm:text-3xl font-black text-indigo-400 mt-1 leading-none">{applicationsStats.underReview || 2}</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-950/80 text-indigo-400 flex items-center justify-center border border-indigo-800/80 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#111827] rounded-xl border border-[#1E293B] shadow-2xs p-4 sm:p-5 flex items-center justify-between">
          <div>
            <div className="text-xs sm:text-sm font-semibold text-slate-400">Approved</div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 leading-none">{applicationsStats.approved || 0}</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-950/80 text-emerald-400 flex items-center justify-center border border-emerald-800/80 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#111827] rounded-xl border border-[#1E293B] shadow-2xs p-4 sm:p-5 flex items-center justify-between col-span-2 sm:col-span-1">
          <div>
            <div className="text-xs sm:text-sm font-semibold text-slate-400">Pending Docs</div>
            <div className="text-2xl sm:text-3xl font-black text-amber-400 mt-1 leading-none">{applicationsStats.pending || 0}</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-950/80 text-amber-400 flex items-center justify-center border border-amber-800/80 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#111827] rounded-xl border border-[#1E293B] shadow-2xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1 max-w-sm">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            placeholder="Search applications, ID, ref..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-1.5 min-h-[36px] h-9 text-sm font-medium rounded-lg border border-[#1E293B] bg-[#141C2B] hover:border-slate-700 focus:border-blue-500 focus:outline-none transition-all text-slate-200"
          >
            {departments.map((d) => (
              <option key={d} value={d}>
                Department: {d}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 min-h-[36px] h-9 text-sm font-medium rounded-lg border border-[#1E293B] bg-[#141C2B] hover:border-slate-700 focus:border-blue-500 focus:outline-none transition-all text-slate-200"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                Status: {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Applications Table */}
      {filteredApps.length === 0 ? (
        <EmptyState
          title="No applications found"
          description="Adjust your search filters or initiate a new statutory application."
          actionLabel="Clear Filters"
          onAction={() => {
            setSearch('');
            setDepartmentFilter('All');
            setStatusFilter('All');
          }}
        />
      ) : (
        <div className="bg-[#111827] rounded-xl border border-[#1E293B] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-xs bg-[#141C2B]/50">
                  <th className="py-3.5 px-4">Application ID</th>
                  <th className="py-3.5 px-4">Application Name</th>
                  <th className="py-3.5 px-4">Department</th>
                  <th className="py-3.5 px-4">Current Stage</th>
                  <th className="py-3.5 px-4">Reference No</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                {filteredApps.map((app) => (
                  <tr key={app.id} className="hover:bg-[#141C2B]/60 transition-colors group">
                    <td className="py-4 px-4 font-mono font-bold text-blue-400 text-sm">
                      {app.id}
                    </td>
                    <td className="py-4 px-4 font-bold text-white text-sm sm:text-base group-hover:text-blue-400 transition-colors">
                      {app.application}
                    </td>
                    <td className="py-4 px-4 text-slate-400 flex items-center gap-1.5 mt-2.5">
                      <Building className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{app.department}</span>
                    </td>
                    <td className="py-4 px-4 text-slate-200 font-medium">
                      <span className="px-2.5 py-0.5 rounded-md bg-[#141C2B] border border-slate-700 text-slate-300 text-xs">
                        {app.currentStage}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-mono text-slate-400 text-xs">
                      {app.referenceNo}
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant={app.status} withDot>
                        {app.status}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => handleOpenDetail(app)}
                        className="min-h-[32px] h-8 px-3 rounded-lg bg-[#141C2B] hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 transition-colors inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold cursor-pointer"
                      >
                        <span>Timeline</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}