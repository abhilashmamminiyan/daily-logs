'use client';

import React, { useEffect, useState } from 'react';
import {
  Clipboard,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Calendar,
  Search,
  Filter,
  GitCommit,
  GitPullRequest,
  ExternalLink,
  Activity,
  LayoutDashboard,
  Copy,
  Check,
  FileText,
  ChevronRight,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';

interface CommitInfo {
  sha: string;
  message: string;
  date: string;
}

interface MergeRequestInfo {
  iid: number;
  title: string;
  state: string;
  web_url: string;
  date: string;
}

interface Task {
  _id: string;
  title: string;
  status: string;
  requires_attention: boolean;
  updatedAt: string;
  latest_qa_comment?: {
    author: string;
    body: string;
    date: string;
  };
  my_commits: CommitInfo[];
  my_merge_requests: MergeRequestInfo[];
}

interface ActivityItem {
  type: 'commit' | 'mr';
  id: string;
  title: string;
  date: string;
  task_id: string;
  task_title: string;
  status?: string;
  url?: string;
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [standupText, setStandupText] = useState<string>('Loading standup update blocks...');
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSynced, setLastSynced] = useState<string>('');
  
  // Copy feedback states
  const [copiedStandup, setCopiedStandup] = useState<boolean>(false);
  const [copiedSha, setCopiedSha] = useState<string>('');

  // Tab State
  const [activeTab, setActiveTab] = useState<string>('board');

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('all-time');

  // Selected Task State (for split-pane detail view)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Load last synced from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('dailylogs_last_synced');
    if (stored) {
      setLastSynced(stored);
    }
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Auto-Generated Standup text
      const standupRes = await fetch('/api/tasks/standup');
      if (standupRes.ok) {
        const standupData = await standupRes.json();
        setStandupText(standupData.formattedText);
      }

      // 2. Fetch Active Tracker Pane Board
      const tasksRes = await fetch('/api/tasks');
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData);
        
        // Auto-select first task if none selected and tasks are available
        if (tasksData.length > 0) {
          setSelectedTaskId((prev) => prev || tasksData[0]._id);
        }
      }
    } catch (err) {
      console.error('Error connecting to NestJS API layer:', err);
      setStandupText('⚠️ Error establishing connection to background server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Trigger Manual Backend Sync
  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const syncRes = await fetch('/api/sync/trigger', { method: 'POST' });
      if (!syncRes.ok) {
        throw new Error('Sync endpoint returned error code');
      }
      
      await fetchDashboardData();
      
      const nowStr = new Date().toLocaleString();
      setLastSynced(nowStr);
      localStorage.setItem('dailylogs_last_synced', nowStr);
    } catch (err) {
      console.error('Error triggering sync:', err);
      alert('Failed to trigger sync cycle. Please check if backend is running.');
    } finally {
      setSyncing(false);
    }
  };

  // Helper to format date string to YYYY-MM-DD locally
  const getLocalDateString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Handle Preset Filters
  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    const today = new Date();

    if (preset === 'today') {
      const todayStr = getLocalDateString(today);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      setStartDate(yesterdayStr);
      setEndDate(yesterdayStr);
    } else if (preset === 'this-week') {
      const currentDay = today.getDay();
      const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1; // Monday start
      const monday = new Date();
      monday.setDate(today.getDate() - distanceToMonday);
      setStartDate(getLocalDateString(monday));
      setEndDate(getLocalDateString(today));
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Filter evaluation logic
  const matchesDateRange = (activityDateStr: string) => {
    if (!activityDateStr) return false;
    const d = new Date(activityDateStr);
    const dateStr = getLocalDateString(d);

    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    return true;
  };

  const matchesSearch = (task: Task) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    
    // Match ID, title, status
    if (task._id.toLowerCase().includes(q)) return true;
    if (task.title.toLowerCase().includes(q)) return true;
    if (task.status.toLowerCase().includes(q)) return true;
    
    // Match commit messages
    const commits = task.my_commits || [];
    if (commits.some(c => c.message.toLowerCase().includes(q) || c.sha.toLowerCase().includes(q))) {
      return true;
    }

    // Match Merge Request titles
    const mrs = task.my_merge_requests || [];
    if (mrs.some(mr => mr.title.toLowerCase().includes(q) || String(mr.iid).includes(q))) {
      return true;
    }

    return false;
  };

  const matchesStatus = (task: Task) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') {
      return task.status !== 'Done' && task.status !== 'Closed';
    }
    return task.status.toLowerCase() === statusFilter.toLowerCase();
  };

  // Compute tasks with active filtered commits and MRs
  const processedTasks = tasks.map((task) => {
    const commits = task.my_commits || [];
    const mrs = task.my_merge_requests || [];
    
    const filteredCommits = commits.filter(c => matchesDateRange(c.date));
    const filteredMRs = mrs.filter(mr => matchesDateRange(mr.date));
    
    return {
      ...task,
      filteredCommits,
      filteredMRs,
    };
  });

  // Filter tasks based on Search, Status, and Date (active commits/MRs inside range if date filter active)
  const filteredTasks = processedTasks.filter((task) => {
    const hasDateFilter = startDate || endDate;
    if (hasDateFilter) {
      // If filtering by date, only show tasks containing activity in that range
      if (task.filteredCommits.length === 0 && task.filteredMRs.length === 0) {
        return false;
      }
    }
    return matchesSearch(task) && matchesStatus(task);
  });

  // Calculate stats based on currently visible/filtered tasks
  const stats = {
    totalTasks: filteredTasks.length,
    totalCommits: filteredTasks.reduce((acc, t) => acc + t.filteredCommits.length, 0),
    totalMRs: filteredTasks.reduce((acc, t) => acc + (t.filteredMRs?.length || 0), 0),
    blockersCount: filteredTasks.filter(t => t.requires_attention).length,
  };

  // Compile Unified Activity Log for Timeline tab
  const activityTimeline: ActivityItem[] = [];
  filteredTasks.forEach(task => {
    task.filteredCommits.forEach(c => {
      activityTimeline.push({
        type: 'commit',
        id: c.sha,
        title: c.message,
        date: c.date,
        task_id: task._id,
        task_title: task.title,
      });
    });
    task.filteredMRs.forEach(mr => {
      activityTimeline.push({
        type: 'mr',
        id: String(mr.iid),
        title: mr.title,
        date: mr.date,
        task_id: task._id,
        task_title: task.title,
        status: mr.state,
        url: mr.web_url,
      });
    });
  });

  // Sort timeline chronologically (newest first)
  activityTimeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Group timeline by Day
  const groupedActivities: { [day: string]: ActivityItem[] } = {};
  activityTimeline.forEach(item => {
    const d = new Date(item.date);
    const dayStr = d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    if (!groupedActivities[dayStr]) {
      groupedActivities[dayStr] = [];
    }
    groupedActivities[dayStr].push(item);
  });

  // Copy helpers
  const copyToClipboard = (text: string, type: 'standup' | 'sha', shaVal?: string) => {
    navigator.clipboard.writeText(text);
    if (type === 'standup') {
      setCopiedStandup(true);
      setTimeout(() => setCopiedStandup(false), 2000);
    } else if (type === 'sha' && shaVal) {
      setCopiedSha(shaVal);
      setTimeout(() => setCopiedSha(''), 1500);
    }
  };

  // Currently Selected Task object
  const selectedTask = filteredTasks.find(t => t._id === selectedTaskId) || filteredTasks[0] || null;

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col md:flex-row font-sans">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900/60 backdrop-blur-md border-b md:border-b-0 md:border-r border-slate-800 p-6 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo & Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="relative">
              <span className="flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-wider text-slate-100 uppercase">DailyLogs</h1>
              <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">Workspace Node</p>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('board')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'board'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Task Manager Board
            </button>
            
            <button
              onClick={() => setActiveTab('activity')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'activity'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Activity className="w-4 h-4" />
              Activity Stream
            </button>

            <button
              onClick={() => setActiveTab('standup')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'standup'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <FileText className="w-4 h-4" />
              Standup Auto-Draft
            </button>
          </nav>
        </div>

        {/* Sync Control Block */}
        <div className="mt-8 pt-6 border-t border-slate-800 space-y-3">
          <button
            onClick={handleManualSync}
            disabled={syncing || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 active:scale-95 transition-all text-sm rounded-xl font-semibold text-slate-200"
          >
            <RefreshCw className={`w-4 h-4 text-cyan-400 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Ingesting Node...' : 'Sync Data Now'}
          </button>
          
          <div className="text-center">
            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider block">Last Synced</span>
            <span className="text-xs font-semibold text-slate-400 mt-0.5 block">
              {lastSynced ? lastSynced : 'Not synced yet'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-x-hidden min-h-screen">
        
        {/* Top Header Panel */}
        <header className="p-6 md:p-8 border-b border-slate-800 bg-slate-950/20 backdrop-blur flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white capitalize flex items-center gap-2">
              {activeTab === 'board' && <><LayoutDashboard className="w-6 h-6 text-indigo-400" /> Task Board</>}
              {activeTab === 'activity' && <><Activity className="w-6 h-6 text-indigo-400" /> Contribution Timeline</>}
              {activeTab === 'standup' && <><FileText className="w-6 h-6 text-indigo-400" /> Daily Standup Builder</>}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {activeTab === 'board' && 'Manage your active Jira issues and git contribution mappings.'}
              {activeTab === 'activity' && 'Detailed chronological feed of your commits and merge requests.'}
              {activeTab === 'standup' && 'Auto-generated Slack/Jira template based on code contributions.'}
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-xs bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Scope: This Week's Synced Workspace</span>
          </div>
        </header>

        {/* Content Workspace */}
        <div className="p-6 md:p-8 space-y-6 flex-1 flex flex-col">
          
          {/* 1. Overview Statistics Cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl"></div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Tracked Tasks</span>
              <span className="text-2xl font-black text-slate-100 mt-1 block">{stats.totalTasks}</span>
            </div>
            
            <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl"></div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Commits Logged</span>
              <span className="text-2xl font-black text-emerald-400 mt-1 block">{stats.totalCommits}</span>
            </div>

            <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-full blur-xl"></div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Merge Requests</span>
              <span className="text-2xl font-black text-purple-400 mt-1 block">{stats.totalMRs}</span>
            </div>

            <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-full blur-xl"></div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Attention Needed</span>
              <span className={`text-2xl font-black mt-1 block ${stats.blockersCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
                {stats.blockersCount}
              </span>
            </div>
          </section>

          {/* 2. Filters Row */}
          <section className="bg-slate-900/30 border border-slate-800/60 p-4 rounded-2xl flex flex-col gap-4">
            {/* Row 1: Search and Status filter */}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
              
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by ticket ID, description, commit content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-slate-200 text-sm pl-10 pr-4 py-2.5 rounded-xl outline-none transition-colors"
                />
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800/80 rounded-xl overflow-x-auto">
                {[
                  { id: 'all', label: 'All Status' },
                  { id: 'active', label: 'Active Work' },
                  { id: 'To Do', label: 'To Do' },
                  { id: 'In Progress', label: 'In Progress' },
                  { id: 'In Code Review', label: 'In Review' },
                  { id: 'Done', label: 'Done' }
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setStatusFilter(st.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      statusFilter === st.id
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

            </div>

            {/* Row 2: Date Filters */}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between pt-3 border-t border-slate-800/40">
              
              {/* Preset Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-500 font-medium mr-1.5 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-indigo-400" /> Filter Work:
                </span>
                {[
                  { id: 'all-time', label: 'All time' },
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'this-week', label: 'This week' }
                ].map((pr) => (
                  <button
                    key={pr.id}
                    onClick={() => handlePresetChange(pr.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedPreset === pr.id
                        ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                        : 'bg-slate-950 border border-slate-800/80 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {pr.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Range picker inputs */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 uppercase font-mono">From</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setSelectedPreset('custom');
                    }}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 uppercase font-mono">To</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setSelectedPreset('custom');
                    }}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-2.5 py-1.5 rounded-lg outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

            </div>
          </section>

          {/* 3. Main Dynamic Content Switcher */}
          <div className="flex-1 min-h-0 flex flex-col">
            
            {/* Loading state for entire board */}
            {loading && tasks.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-2">
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                <span>Reading synchronized mongo nodes...</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800/80 rounded-2xl p-16 text-center">
                <Info className="w-12 h-12 text-slate-600 mb-4" />
                <h3 className="text-lg font-bold text-slate-300">No matching activities found</h3>
                <p className="text-sm text-slate-500 max-w-sm mt-1">
                  Adjust your search keyword, status filter, or check if the activity is outside the selected date boundaries.
                </p>
                {(searchQuery || statusFilter !== 'all' || startDate || endDate) && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      handlePresetChange('all-time');
                    }}
                    className="mt-4 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold hover:bg-slate-800 text-indigo-400"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            ) : (
              
              /* Dashboard Views: Tab Conditionals */
              <div className="flex-1 min-h-0 flex flex-col">
                
                {/* VIEW A: Split Pane Task Manager Board */}
                {activeTab === 'board' && (
                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
                    
                    {/* Left Pane: Task Cards List */}
                    <div className="lg:col-span-5 flex flex-col min-h-0 space-y-3 overflow-y-auto pr-2 max-h-[600px] lg:max-h-none custom-scrollbar">
                      {filteredTasks.map((task) => {
                        const isSelected = selectedTaskId === task._id;
                        return (
                          <div
                            key={task._id}
                            onClick={() => setSelectedTaskId(task._id)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer select-none text-left relative overflow-hidden ${
                              isSelected
                                ? 'bg-indigo-950/20 border-indigo-500 shadow-md shadow-indigo-500/5'
                                : 'bg-slate-900/30 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/50'
                            } ${
                              task.requires_attention
                                ? 'border-rose-500/40 bg-rose-950/5 hover:bg-rose-950/10'
                                : ''
                            }`}
                          >
                            {/* Blue active line */}
                            {isSelected && <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>}
                            {task.requires_attention && !isSelected && <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500"></div>}

                            <div className="flex justify-between items-start gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-950 border border-slate-800 text-slate-300 rounded">
                                  {task._id}
                                </span>
                                
                                <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full ${
                                  task.status === 'Done' || task.status === 'Closed'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : task.status === 'In Progress'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    : task.status === 'In Code Review'
                                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  {task.status}
                                </span>
                              </div>

                              {task.requires_attention && (
                                <span className="flex items-center gap-0.5 text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/25 px-1.5 py-0.5 rounded-full animate-pulse">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Needs Attention
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm font-semibold text-slate-200 line-clamp-1 mb-3">
                              {task.title}
                            </h4>

                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              {task.filteredCommits.length > 0 && (
                                <span className="flex items-center gap-1 bg-slate-950/60 border border-slate-800/80 px-2 py-0.5 rounded text-[10px] font-medium">
                                  <GitCommit className="w-3 h-3 text-emerald-400" />
                                  {task.filteredCommits.length}
                                </span>
                              )}
                              {task.filteredMRs.length > 0 && (
                                <span className="flex items-center gap-1 bg-slate-950/60 border border-slate-800/80 px-2 py-0.5 rounded text-[10px] font-medium">
                                  <GitPullRequest className="w-3 h-3 text-purple-400" />
                                  {task.filteredMRs.length}
                                </span>
                              )}
                              
                              <span className="text-[10px] font-mono text-slate-500 ml-auto">
                                {new Date(task.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right Pane: Selected Task Detail Card */}
                    <div className="lg:col-span-7 flex flex-col min-h-0 bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden p-6 max-h-[600px] lg:max-h-none overflow-y-auto custom-scrollbar">
                      {selectedTask ? (
                        <div className="space-y-6">
                          
                          {/* Selected Task Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800/60 pb-4 gap-4">
                            <div>
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="font-mono text-sm font-black px-2.5 py-1 bg-slate-950 border border-slate-800 rounded">
                                  {selectedTask._id}
                                </span>
                                <span className={`text-xs uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full ${
                                  selectedTask.status === 'Done' || selectedTask.status === 'Closed'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : selectedTask.status === 'In Progress'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  {selectedTask.status}
                                </span>
                              </div>
                              <h3 className="text-lg font-bold text-slate-100 mt-3 leading-snug">
                                {selectedTask.title}
                              </h3>
                            </div>

                            {/* View external link */}
                            {selectedTask._id !== 'NO-JIRA' && (
                              <a
                                href={`https://kiework.atlassian.net/browse/${selectedTask._id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shrink-0"
                              >
                                View in Jira
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>

                          {/* Blocker Card */}
                          {selectedTask.requires_attention && selectedTask.latest_qa_comment && (
                            <div className="p-4 bg-rose-950/20 border border-rose-800/30 rounded-2xl relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500"></div>
                              <div className="flex items-center justify-between text-rose-400 font-bold text-xs mb-2">
                                <span className="flex items-center gap-1.5">
                                  <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse" />
                                  Blocked by QA: {selectedTask.latest_qa_comment.author}
                                </span>
                                <span className="font-mono text-[10px] text-slate-500">
                                  {new Date(selectedTask.latest_qa_comment.date).toLocaleDateString()} at{' '}
                                  {new Date(selectedTask.latest_qa_comment.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-slate-300 italic text-sm pl-5 font-medium leading-relaxed">
                                "{selectedTask.latest_qa_comment.body}"
                              </p>
                            </div>
                          )}

                          {/* Detail Section: Git Commits */}
                          <div className="space-y-3">
                            <h4 className="text-xs uppercase font-extrabold tracking-widest text-slate-400 flex items-center gap-1.5">
                              <GitCommit className="w-4 h-4 text-emerald-400" />
                              Pushed Code Commits ({selectedTask.filteredCommits.length})
                            </h4>

                            {selectedTask.filteredCommits.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800/80 rounded-xl">
                                No commits match active date boundaries.
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
                                {selectedTask.filteredCommits.map((c) => (
                                  <div
                                    key={c.sha}
                                    className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl flex items-start justify-between gap-4 group"
                                  >
                                    <div className="space-y-1">
                                      <p className="text-xs font-semibold text-slate-200 leading-normal">
                                        {c.message}
                                      </p>
                                      <p className="text-[10px] text-slate-500 font-medium">
                                        {new Date(c.date).toLocaleDateString()} at{' '}
                                        {new Date(c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    </div>
                                    
                                    <button
                                      onClick={() => copyToClipboard(c.sha, 'sha', c.sha)}
                                      className="flex items-center gap-1.5 px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 text-[10px] font-mono text-slate-400 hover:text-slate-200 transition-all shrink-0"
                                    >
                                      {copiedSha === c.sha ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-400" />
                                          <span className="text-emerald-400">Copied</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" />
                                          <span>{c.sha}</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Detail Section: GitLab Merge Requests */}
                          <div className="space-y-3 pt-2">
                            <h4 className="text-xs uppercase font-extrabold tracking-widest text-slate-400 flex items-center gap-1.5">
                              <GitPullRequest className="w-4 h-4 text-purple-400" />
                              Associated Merge Requests ({selectedTask.filteredMRs.length})
                            </h4>

                            {selectedTask.filteredMRs.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800/80 rounded-xl">
                                No merge requests match active date boundaries.
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
                                {selectedTask.filteredMRs.map((mr) => (
                                  <a
                                    key={mr.iid}
                                    href={mr.web_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl hover:border-slate-700 hover:bg-slate-900/10 transition-all"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-1">
                                        <p className="text-xs font-semibold text-slate-200 leading-normal">
                                          <span className="text-purple-400 font-black font-mono mr-1.5">!{mr.iid}</span>
                                          {mr.title}
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-medium">
                                          Created {new Date(mr.date).toLocaleDateString()} at{' '}
                                          {new Date(mr.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full ${
                                          mr.state === 'merged'
                                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/25'
                                            : mr.state === 'opened' || mr.state === 'active'
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/25'
                                        }`}>
                                          {mr.state}
                                        </span>
                                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                      </div>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>

                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-500">
                          <Layers className="w-10 h-10 mb-3 text-slate-700" />
                          <p className="text-sm font-semibold">No Task Selected</p>
                          <p className="text-xs max-w-xs mt-1">Select an active issue index on the left card panel to render nested log files.</p>
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* VIEW B: Unified Activity Timeline View */}
                {activeTab === 'activity' && (
                  <div className="space-y-6">
                    {activityTimeline.length === 0 ? (
                      <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800/80 rounded-2xl">
                        No activity found in the chosen date scope. Try selecting a broader filter range.
                      </div>
                    ) : (
                      <div className="space-y-8 relative before:absolute before:left-3 md:before:left-[35px] before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-800/80">
                        {Object.keys(groupedActivities).map((dayStr) => (
                          <div key={dayStr} className="space-y-4">
                            
                            {/* Day Header */}
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 md:w-[71px] flex justify-center items-center shrink-0 z-10">
                                <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full border-2 border-[#030712]"></span>
                              </div>
                              <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-widest font-mono">
                                {dayStr}
                              </h3>
                            </div>

                            {/* Activities Under Day */}
                            <div className="space-y-3 ml-8 md:ml-[71px]">
                              {groupedActivities[dayStr].map((item, idx) => (
                                <div
                                  key={`${item.type}-${item.id}-${idx}`}
                                  className="p-4 bg-slate-900/20 border border-slate-800/60 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition-colors"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                                      item.type === 'commit'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                                        : 'bg-purple-500/10 text-purple-400 border border-purple-500/10'
                                    }`}>
                                      {item.type === 'commit' ? (
                                        <GitCommit className="w-4 h-4" />
                                      ) : (
                                        <GitPullRequest className="w-4 h-4" />
                                      )}
                                    </div>
                                    
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[10px] font-black font-mono uppercase text-slate-500 bg-slate-950/60 border border-slate-800 px-1.5 py-0.5 rounded">
                                          {item.type === 'commit' ? `sha: ${item.id}` : `mr: !${item.id}`}
                                        </span>
                                        {item.status && (
                                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-full ${
                                            item.status === 'merged'
                                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                          }`}>
                                            {item.status}
                                          </span>
                                        )}
                                        <span className="text-[10px] font-semibold text-slate-400 hover:underline">
                                          Task: {item.task_id}
                                        </span>
                                      </div>

                                      <p className="text-sm font-semibold text-slate-200 mt-1.5 leading-snug">
                                        {item.title}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                                    <span className="text-xs text-slate-500 font-mono">
                                      {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>

                                    {item.url && (
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* VIEW C: Standup Mode Auto-Draft Drawer */}
                {activeTab === 'standup' && (
                  <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 space-y-4">
                    <div className="flex justify-between items-center pb-4 border-b border-slate-800/60">
                      <div>
                        <h3 className="text-base font-bold text-slate-200">Weekly/Daily Auto-Draft Block</h3>
                        <p className="text-xs text-slate-500">Formulated utilizing commit triggers and active ticket logs.</p>
                      </div>

                      <button
                        onClick={() => copyToClipboard(standupText, 'standup')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          copiedStandup
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-emerald-500/5'
                            : 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95'
                        }`}
                      >
                        {copiedStandup ? (
                          <>
                            <Check className="w-4 h-4" />
                            Copied To Clipboard!
                          </>
                        ) : (
                          <>
                            <Clipboard className="w-4 h-4" />
                            Copy Template
                          </>
                        )}
                      </button>
                    </div>

                    <textarea
                      readOnly
                      value={standupText}
                      className="w-full h-[380px] bg-slate-950 border border-slate-800 focus:border-indigo-500 text-slate-300 font-mono text-sm p-5 rounded-xl outline-none resize-none leading-relaxed custom-scrollbar shadow-inner"
                    />
                  </div>
                )}

              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
