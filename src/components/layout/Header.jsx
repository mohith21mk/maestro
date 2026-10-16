import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Search,
  HelpCircle,
  ChevronDown,
  Menu,
  Building,
  Shield,
  LogOut
} from 'lucide-react';
import { useBusinessAnalysis } from '../../context/BusinessAnalysisContext';
import { useAuth } from '../../context/AuthContext';

export default function Header({
  onOpenMobileMenu,
  onOpenProfile,
  onOpenNotification,
  onContactSupport,
  onSwitchBusiness,
}) {
  const auth = useAuth();
  const { analysisResult, businessTemplateBundle, resetOnboarding } = useBusinessAnalysis();
  const businessName = analysisResult?.businessSummary?.businessName || 'Tiruppur Textile Works';

  const userName = auth?.user?.fullName || 'Business Owner';
  const firstName = auth?.user?.fullName ? auth.user.fullName.trim().split(' ')[0] : 'Business Owner';
  const userInitials = auth?.user?.fullName
    ? auth.user.fullName
        .trim()
        .split(/\s+/)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'BO';

  const severityToType = { critical: 'warning', upcoming: 'warning', information: 'info' };
  const initialNotifications = (businessTemplateBundle?.alertsList || []).slice(0, 5).map((alert) => ({
    id: alert.id,
    title: alert.title,
    time: alert.date,
    unread: !alert.read,
    type: severityToType[alert.severity] || 'info',
  }));

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showBusinessMenu, setShowBusinessMenu] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setNotifications(initialNotifications);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessTemplateBundle]);

  const notifRef = useRef(null);
  const profileRef = useRef(null);
  const businessRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (businessRef.current && !businessRef.current.contains(event.target)) {
        setShowBusinessMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => n.unread).length || 3;

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, unread: false })));
  };

  const handleBusinessSwitch = () => {
    setShowBusinessMenu(false);
    if (onSwitchBusiness) {
      onSwitchBusiness();
    } else {
      resetOnboarding();
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur-md border-b border-[#1E293B] px-4 h-13 min-h-[52px] flex items-center justify-between gap-3 shrink-0">
      {/* Left Welcome Area */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#141C2B] lg:hidden cursor-pointer shrink-0"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-1.5 truncate leading-none">
            Good morning, {firstName ? firstName.toUpperCase() : 'USER'}! <span className="text-sm">👋</span>
          </h1>
          <p className="text-xs text-slate-400 truncate leading-none mt-1">
            Here&apos;s your compliance overview for today.
          </p>
        </div>
      </div>

      {/* Right Search, Actions & Profile Area */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Search Input Bar */}
        <div className="relative hidden md:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search licences, tasks, documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-52 lg:w-64 h-9 bg-[#111827] border border-[#1E293B] text-slate-200 placeholder:text-slate-400 text-sm rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Notifications Button */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative w-9 h-9 rounded-lg bg-[#111827] border border-[#1E293B] text-slate-300 hover:text-white hover:bg-[#141C2B] transition-colors cursor-pointer flex items-center justify-center"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 bg-rose-600 text-white text-xs font-bold rounded-full flex items-center justify-center ring-2 ring-[#0B0F17]">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-[#111827] rounded-xl shadow-2xl border border-[#1E293B] py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-3.5 py-2 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-white">Notifications</span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-blue-950 text-blue-400 font-bold border border-blue-800">
                    {unreadCount} new
                  </span>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60">
                {notifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onOpenNotification(item)}
                    className={`p-2.5 hover:bg-[#141C2B] transition-colors cursor-pointer flex items-start gap-2.5 ${
                      item.unread ? 'bg-blue-950/20' : ''
                    }`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-blue-500" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-200 leading-snug">
                        {item.title}
                      </p>
                      <span className="text-xs text-slate-400 mt-0.5 inline-block">
                        {item.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-3 py-1.5 border-t border-slate-800 text-center">
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    onOpenNotification({ title: 'All Notifications' });
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                >
                  View All Notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Help Button */}
        <button
          onClick={onContactSupport}
          className="w-8 h-8 rounded-lg bg-[#111827] border border-[#1E293B] text-slate-300 hover:text-white hover:bg-[#141C2B] transition-colors cursor-pointer flex items-center justify-center"
          aria-label="Help and Support"
          title="Need Help?"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Business Switcher Dropdown */}
        <div className="relative" ref={businessRef}>
          <button
            onClick={() => setShowBusinessMenu(!showBusinessMenu)}
            className="h-8 flex items-center gap-1.5 px-2.5 rounded-lg bg-[#111827] border border-[#1E293B] hover:bg-[#141C2B] text-slate-200 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            aria-label="Select Business"
            title={businessName}
          >
            <Building className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="max-w-[140px] truncate">{businessName}</span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {showBusinessMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-[#111827] rounded-xl shadow-2xl border border-[#1E293B] py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-3.5 py-2 border-b border-slate-800">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Current Active Unit
                </p>
                <p className="text-sm font-bold text-white mt-0.5">{businessName}</p>
              </div>
              <div className="p-1.5 space-y-0.5">
                {auth?.userBusinesses && auth.userBusinesses.length > 1 && (
                  <div className="mb-1.5 pb-1.5 border-b border-slate-800">
                    <p className="text-xs font-bold text-slate-400 uppercase px-2 mb-1">Your Businesses</p>
                    {auth.userBusinesses.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => {
                          setShowBusinessMenu(false);
                          if (auth.switchActiveBusiness) auth.switchActiveBusiness(b);
                        }}
                        className={`w-full px-2.5 py-2 text-left text-xs rounded-lg flex items-center justify-between cursor-pointer ${
                          b.id === auth.activeBusiness?.id
                            ? 'bg-blue-600/20 text-blue-400 font-semibold border border-blue-800/40'
                            : 'text-slate-300 hover:bg-[#141C2B]'
                        }`}
                      >
                        <span className="truncate">{b.business_name}</span>
                        <span className="text-xs text-slate-400">{b.city}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={handleBusinessSwitch}
                  className="w-full px-2.5 py-2 text-left text-sm text-slate-200 hover:bg-[#141C2B] rounded-lg flex items-center gap-2 cursor-pointer font-medium"
                >
                  <Building className="w-4 h-4 text-blue-400" />
                  <span>Switch / Describe New Business</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Capsule Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="h-9 min-h-[36px] flex items-center gap-2 px-2.5 rounded-lg hover:bg-[#141C2B] border border-[#1E293B] transition-colors cursor-pointer group"
            aria-label="User Profile Menu"
          >
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
              {userInitials}
            </div>
            <div className="text-left hidden xl:block pr-0.5">
              <div className="text-sm font-semibold text-white leading-none">
                {userName.toUpperCase()}
              </div>
              <div className="text-xs text-slate-400 mt-1 leading-none">
                Business Owner
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-colors shrink-0" />
          </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-[#111827] rounded-2xl shadow-2xl border border-[#1E293B] py-2 z-50">
                <div className="px-4 py-2 border-b border-slate-800">
                  <p className="text-sm font-bold text-white">{userName}</p>
                  <p className="text-xs text-slate-400">{businessName}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onOpenProfile('business');
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-[#141C2B] flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <Building className="w-4 h-4 text-slate-400" />
                    <span>Business Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onOpenProfile('security');
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-[#141C2B] flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <Shield className="w-4 h-4 text-slate-400" />
                    <span>Compliance Settings</span>
                  </button>
                </div>
                <div className="border-t border-slate-800 pt-1">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onOpenProfile('logout');
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-rose-400 hover:bg-[#141C2B] flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
    </header>
  );
}
