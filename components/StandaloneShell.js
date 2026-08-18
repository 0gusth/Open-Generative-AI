'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ImageStudio, VideoStudio, ClippingStudio, VibeMotionStudio, LipSyncStudio, RecastStudio, CinemaStudio, ProductionStudio, AudioStudio, MarketingStudio, WorkflowStudio, AgentStudio, AppsStudio, AiInfluencerStudio, LayersStudio, getUserBalance, getProviderKey, setProviderKey, getProviderBalances } from 'studio';

const DesignAgentStudio = dynamic(() => import('studio').then(mod => mod.DesignAgentStudio), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-black flex items-center justify-center text-white/20">Loading Design Studio...</div>
});
import { Image as ImageIcon, Layers as LayersIcon, Clapperboard, AudioLines, Scissors, Zap, Mic, PersonStanding, Film, FolderKanban, Megaphone, Workflow as WorkflowIcon, Bot, PenTool, LayoutGrid, Sparkles, Settings as SettingsIcon, PanelLeft, Menu as MenuIcon } from 'lucide-react';
import axios from 'axios';
import ApiKeyModal from './ApiKeyModal';
import toast, { Toaster } from 'react-hot-toast';
import { folderSyncSupported, saveFolderHandle, removeFolderHandle, folderStatus, syncProjectFolder } from './localFolderSync';

const TABS = [
  {
    id: 'image',
    label: 'Image Studio',
    icon: <ImageIcon size={18} strokeWidth={1.75} />
  },
  {
    id: 'layers',
    label: 'Layers Studio',
    icon: <LayersIcon size={18} strokeWidth={1.75} />
  },
  {
    id: 'video',
    label: 'Video Studio',
    icon: <Clapperboard size={18} strokeWidth={1.75} />
  },
  {
    id: 'audio',
    label: 'Audio Studio',
    icon: <AudioLines size={18} strokeWidth={1.75} />
  },
  {
    id: 'clipping',
    label: 'AI Clipping',
    icon: <Scissors size={18} strokeWidth={1.75} />
  },
  {
    id: 'vibe-motion',
    label: 'Vibe Motion',
    icon: <Zap size={18} strokeWidth={1.75} />
  },
  {
    id: 'lipsync',
    label: 'Lip Sync',
    icon: <Mic size={18} strokeWidth={1.75} />
  },
  {
    id: 'body-swap',
    label: 'Body Swap',
    icon: <PersonStanding size={18} strokeWidth={1.75} />
  },
  {
    id: 'cinema',
    label: 'Cinema Studio',
    icon: <Film size={18} strokeWidth={1.75} />
  },
  {
    id: 'production',
    label: 'Production',
    icon: <FolderKanban size={18} strokeWidth={1.75} />
  },
  {
    id: 'marketing',
    label: 'Marketing Studio',
    icon: <Megaphone size={18} strokeWidth={1.75} />
  },
  {
    id: 'workflows',
    label: 'Workflows',
    icon: <WorkflowIcon size={18} strokeWidth={1.75} />
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: <Bot size={18} strokeWidth={1.75} />
  },
  {
    id: 'design-agent',
    label: 'Design Agent',
    icon: <PenTool size={18} strokeWidth={1.75} />
  },
  {
    id: 'apps',
    label: 'Explore Apps',
    icon: <LayoutGrid size={18} strokeWidth={1.75} />
  },
  {
    id: 'ai-influencer',
    label: 'AI Influencer Studio',
    icon: <Sparkles size={18} strokeWidth={1.75} />
  }
];

const NAVIGATION_CATEGORIES = [
  {
    id: 'images',
    label: 'Images',
    tabIds: ['image', 'layers', 'design-agent', 'ai-influencer'],
    icon: <ImageIcon size={18} strokeWidth={1.75} />
  },
  {
    id: 'cinema-cat',
    label: 'Cinema',
    tabIds: ['cinema'],
    icon: <Film size={18} strokeWidth={1.75} />
  },
  {
    id: 'production-cat',
    label: 'Production',
    tabIds: ['production'],
    icon: <FolderKanban size={18} strokeWidth={1.75} />
  },
  {
    id: 'video',
    label: 'Video',
    tabIds: ['video', 'clipping', 'vibe-motion', 'lipsync', 'body-swap', 'marketing'],
    icon: <Clapperboard size={18} strokeWidth={1.75} />
  },
  {
    id: 'audio',
    label: 'Audio',
    tabIds: ['audio'],
    icon: <AudioLines size={18} strokeWidth={1.75} />
  },
  {
    id: 'agents-automation',
    label: 'Agents & Automation',
    tabIds: ['agents', 'workflows'],
    icon: <Bot size={18} strokeWidth={1.75} />
  }
];

const EXPLORE_APPS_TAB = TABS.find((tab) => tab.id === 'apps');

const getNavigationCategory = (tabId) => (
  NAVIGATION_CATEGORIES.find((category) => category.tabIds.includes(tabId))
);

const STORAGE_KEY = 'muapi_key';
const NOTIFICATIONS_STORAGE_KEY = 'open_gen_notifications_v1';
const MAX_VISIBLE_NOTIFICATIONS = 3;

const loadStoredNotifications = () => {
  if (typeof window === 'undefined') return [];

  try {
    const stored = JSON.parse(window.sessionStorage.getItem(NOTIFICATIONS_STORAGE_KEY) || '[]');
    const now = Date.now();
    return Array.isArray(stored)
      ? stored.filter((notification) => notification.expiresAt > now).slice(0, MAX_VISIBLE_NOTIFICATIONS)
      : [];
  } catch {
    return [];
  }
};

const persistNotifications = (notifications) => {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(
      NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify(notifications),
    );
  } catch {
    // Notification persistence is optional; rendering still works without storage.
  }
};

export default function StandaloneShell() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug || []; 
  const idFromParams = params?.id;
  const tabFromParams = params?.tab;

  // Helper to extract workflow details precisely from either route structure
  const getWorkflowInfo = useCallback(() => {
    if (idFromParams) {
        return { id: idFromParams, tab: tabFromParams || null };
    }
    const wfIndex = slug.findIndex(s => s === 'workflows' || s === 'workflow');
    if (wfIndex === -1) return { id: null, tab: null };
    return {
      id: slug[wfIndex + 1] || null,
      tab: slug[wfIndex + 2] || null
    };
  }, [slug, idFromParams, tabFromParams]);

  const { id: urlWorkflowId } = getWorkflowInfo();

  // Initialize activeTab from URL slug/params or default to 'image'
  const getInitialTab = () => {
    if (idFromParams || slug.includes('workflow')) return 'workflows';
    if (slug.includes('agents')) return 'agents';
    if (slug.includes('design-agent')) return 'design-agent';
    if (slug.includes('apps')) return 'apps';
    const firstSegment = slug[0];
    if (firstSegment && TABS.find(t => t.id === firstSegment)) return firstSegment;
    return 'image';
  };
  
  const [apiKey, setApiKey] = useState(null);
  const [activeTab, setActiveTab] = useState(getInitialTab());

  const [balance, setBalance] = useState(null);
  const [providerBalances, setProviderBalances] = useState({ runware: null, fal: null });
  const [showSettings, setShowSettings] = useState(false);
  const [runwareKey, setRunwareKey] = useState('');
  const [falKey, setFalKey] = useState('');
  // Projects
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [galleryScope, setGalleryScopeState] = useState(() => {
    if (typeof window === 'undefined') return 'all';
    return localStorage.getItem('gallery_scope') || 'all';
  });
  const setGalleryScope = useCallback((scope) => {
    setGalleryScopeState(scope);
    try { localStorage.setItem('gallery_scope', scope); } catch {}
    window.dispatchEvent(new CustomEvent('gallery-scope-changed', { detail: scope }));
  }, []);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [pickingFolder, setPickingFolder] = useState(false);
  // What this server can do with folders (local Mac: everything; cloud:
  // projects are logical groupings — no disk, no native picker).
  const [projectCaps, setProjectCaps] = useState({ folders: true, picker: false });

  const refreshProjects = useCallback(async () => {
    try {
      const r = await fetch('/api/projects');
      const data = await r.json();
      setProjects(data.projects || []);
      setActiveProjectId(data.activeId || null);
      if (data.capabilities) setProjectCaps(data.capabilities);
    } catch { /* server offline — projects unavailable */ }
  }, []);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  // Catch-up sync on open: generations made on OTHER devices land in this
  // browser's linked folder too. Silent when permission would need a click.
  useEffect(() => {
    if (!folderSyncSupported() || !activeProjectId) return;
    syncProjectFolder(activeProjectId).catch(() => {});
  }, [activeProjectId]);

  const selectProject = useCallback(async (id) => {
    setShowProjectMenu(false);
    setActiveProjectId(id);
    try {
      await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-active', id }) });
    } catch { /* best-effort */ }
  }, []);

  // Inline rename (double-click) and per-project browser folder sync state
  const [editingProject, setEditingProject] = useState(null); // { id, value }
  const [folderStates, setFolderStates] = useState({}); // projectId -> 'granted'|'prompt'|'none'
  const [syncingProject, setSyncingProject] = useState(null);

  const refreshFolderStates = useCallback(async (list) => {
    if (!folderSyncSupported()) return;
    const next = {};
    for (const p of list) next[p.id] = await folderStatus(p.id);
    setFolderStates(next);
  }, []);

  const renameProject = useCallback(async (id, name) => {
    const trimmed = (name || '').trim();
    setEditingProject(null);
    if (!trimmed) return;
    try {
      const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename', id, name: trimmed }) });
      if (!r.ok) throw new Error();
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
    } catch {
      toast.error('Não consegui renomear o projeto.');
    }
  }, []);

  const deleteProject = useCallback(async (project) => {
    if (!window.confirm(`Excluir o projeto "${project.name}"?

As gerações continuam no histórico (em Geral)${project.path ? ' e a pasta no computador não é apagada' : ''}.`)) return;
    try {
      const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: project.id }) });
      if (!r.ok) throw new Error();
      removeFolderHandle(project.id);
      if (activeProjectId === project.id) setActiveProjectId(null);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch {
      toast.error('Não consegui excluir o projeto.');
    }
  }, [activeProjectId]);

  // Browser-owned local folder (online app): pick once, then every
  // generation of the project lands in the folder — including ones made on
  // other devices, on the next visit from this browser.
  const linkProjectFolder = useCallback(async (project) => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveFolderHandle(project.id, handle);
      setFolderStates((prev) => ({ ...prev, [project.id]: 'granted' }));
      setSyncingProject(project.id);
      const res = await syncProjectFolder(project.id, { interactive: true });
      setSyncingProject(null);
      if (res?.denied) { toast.error('Sem permissão na pasta.'); return; }
      toast.success(`Pasta "${handle.name}" conectada — ${res?.saved || 0} arquivo(s) baixado(s)${res?.skipped ? `, ${res.skipped} já existiam` : ''}.`);
    } catch (e) {
      setSyncingProject(null);
      if (e?.name !== 'AbortError') toast.error('Não consegui conectar a pasta.');
    }
  }, []);

  const resyncProjectFolder = useCallback(async (project) => {
    setSyncingProject(project.id);
    const res = await syncProjectFolder(project.id, { interactive: true });
    setSyncingProject(null);
    setFolderStates((prev) => ({ ...prev, [project.id]: res?.denied || res?.needsPermission ? 'prompt' : 'granted' }));
    if (res?.saved || res?.skipped) toast.success(`Pasta em dia — ${res.saved} novo(s), ${res.skipped} já existiam.`);
    else if (res?.denied) toast.error('Sem permissão na pasta — escolha de novo.');
  }, []);

  const createProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    try {
      const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', name, path: newProjectPath.trim() }) });
      const data = await r.json();
      if (!r.ok) { alert(data.error || 'Could not create project'); return; }
      setShowNewProject(false);
      setNewProjectName('');
      setNewProjectPath('');
      refreshProjects();
    } catch { alert('Could not reach the server'); }
  }, [newProjectName, newProjectPath, refreshProjects]);
  useEffect(() => {
    if (showSettings) {
      setRunwareKey(getProviderKey('runware') || '');
      setFalKey(getProviderKey('fal') || '');
    }
  }, [showSettings]);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  // Sidebar Collapsed & Mobile Drawer State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('sidebar_collapsed') === 'true';
    return false;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState(() => (
    getNavigationCategory(getInitialTab())?.id || NAVIGATION_CATEGORIES[0].id
  ));
  const activeCategory = getNavigationCategory(activeTab);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', next ? 'true' : 'false');
      return next;
    });
  }, []);

  const handleCategoryToggle = useCallback((categoryId) => {
    const isCollapsedNavigation = isSidebarCollapsed && !isMobileOpen;

    if (!isCollapsedNavigation) {
      setExpandedCategoryId((currentId) => (
        currentId === categoryId ? null : categoryId
      ));
      return;
    }

    setExpandedCategoryId(categoryId);
    toggleSidebar();
  }, [isMobileOpen, isSidebarCollapsed, toggleSidebar]);

  useEffect(() => {
    if (activeCategory?.id) {
      setExpandedCategoryId(activeCategory.id);
    }
  }, [activeCategory?.id]);

  // Drag and Drop State
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState(null);

  // Global generation notifications remain mounted while users switch studios.
  const [notifications, setNotifications] = useState([]);
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);
  const [generationCounts, setGenerationCounts] = useState({});

  useEffect(() => {
    setNotifications(loadStoredNotifications());
    setNotificationsHydrated(true);
  }, []);

  const pushNotification = useCallback((notif) => {
    const now = Date.now();
    const id = `notif-${Date.now()}-${Math.random()}`;
    const ttl = 12000;
    const entry = { ...notif, id, expiresAt: now + ttl };
    setNotifications((previous) => {
      const next = [
        ...previous.filter((notification) => notification.expiresAt > now),
        entry,
      ].slice(-MAX_VISIBLE_NOTIFICATIONS);
      persistNotifications(next);
      return next;
    });
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((previous) => {
      const next = previous.filter((notification) => notification.id !== id);
      persistNotifications(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!notificationsHydrated) return;

    persistNotifications(notifications);
  }, [notifications, notificationsHydrated]);

  useEffect(() => {
    if (notifications.length === 0) return undefined;

    const nextExpiry = Math.min(...notifications.map((notification) => notification.expiresAt));
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setNotifications((previous) => previous.filter((notification) => notification.expiresAt > now));
    }, Math.max(0, nextExpiry - Date.now()));

    return () => window.clearTimeout(timer);
  }, [notifications]);

  const makeSuccessCallback = useCallback((tabId) => (data) => {
    const tab = TABS.find(t => t.id === tabId);
    pushNotification({
      type: 'success',
      tabId,
      label: tab?.label || tabId,
      resultUrl: data?.url || null,
    });
    // Linked local folder (online app): pull the fresh delivery in as soon
    // as the server ledger has it. Silent — skips when permission needs a
    // click (the amber folder icon in the menu is the recovery path).
    if (folderSyncSupported() && activeProjectId) {
      setTimeout(() => { syncProjectFolder(activeProjectId).catch(() => {}); }, 4000);
    }
  }, [pushNotification, activeProjectId]);

  const makeErrorCallback = useCallback((tabId) => (errorOrMessage) => {
    const tab = TABS.find(t => t.id === tabId);
    const message = typeof errorOrMessage === 'string'
      ? errorOrMessage
      : (errorOrMessage?.message || errorOrMessage?.error || String(errorOrMessage || 'Generation failed'));
    pushNotification({ type: 'error', tabId, label: tab?.label || tabId, message });
  }, [pushNotification]);

  const makeGenerationStartCallback = useCallback((tabId) => () => {
    setGenerationCounts((previous) => ({
      ...previous,
      [tabId]: (previous[tabId] || 0) + 1,
    }));
  }, []);

  const makeGenerationEndCallback = useCallback((tabId) => () => {
    setGenerationCounts((previous) => {
      const currentCount = previous[tabId] || 0;
      if (currentCount <= 1) {
        const next = { ...previous };
        delete next[tabId];
        return next;
      }

      return {
        ...previous,
        [tabId]: currentCount - 1,
      };
    });
  }, []);

  const activeGenerations = TABS
    .filter((tab) => generationCounts[tab.id] > 0)
    .map((tab) => ({
      tabId: tab.id,
      label: tab.label,
      count: generationCounts[tab.id],
    }));

  // Popstate event listener to sync tab state with URL on back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const segments = path.split('/').filter(Boolean);
      const tabId = segments[1] || 'image';
      if (TABS.find(t => t.id === tabId)) {
        setActiveTab(tabId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = useCallback((tabId) => {
    window.history.pushState(null, '', `/studio/${tabId}`);
    setActiveTab(tabId);
  }, []);

  const handleOpenNotification = useCallback((notification) => {
    handleTabChange(notification.tabId);
    dismissNotification(notification.id);
  }, [dismissNotification, handleTabChange]);

  const handleTabClick = (e, tabId) => {
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleTabChange(tabId);
      return true;
    }
    return false;
  };

  const handleNavigationItemClick = (event, tabId) => {
    if (handleTabClick(event, tabId)) {
      setIsMobileOpen(false);
    }
  };

  // Auto-hide header when inside a specific workflow view or design agent
  useEffect(() => {
    const isEditingWorkflow = (activeTab === 'workflows' || !!idFromParams) && urlWorkflowId;
    const isDesignAgent = activeTab === 'design-agent';
    
    if (isEditingWorkflow || isDesignAgent) {
      setIsHeaderVisible(false);
    } else {
      setIsHeaderVisible(true);
    }
  }, [activeTab, urlWorkflowId, idFromParams]);

  // Global builder CSS cleanup when switching away from Workflows or Design Agent tabs
  useEffect(() => {
    const fromBuilder = sessionStorage.getItem("fromWorkflowBuilder");
    const fromDesignAgent = sessionStorage.getItem("fromDesignAgent");
    
    if ((fromBuilder && activeTab !== 'workflows') || (fromDesignAgent && activeTab !== 'design-agent')) {
      sessionStorage.removeItem("fromWorkflowBuilder");
      sessionStorage.removeItem("fromDesignAgent");
      window.location.reload();
    }
  }, [activeTab]);

  const fetchBalance = useCallback(async (key) => {
    try {
      const data = await getUserBalance(key);
      setBalance(data.balance);
      getProviderBalances().then(setProviderBalances).catch(() => {});
    } catch (err) {
      console.error('Balance fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    setHasMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
      fetchBalance(stored);
      // Sync cookie immediately on mount to establish identity for background requests
      document.cookie = `muapi_key=${stored}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, [fetchBalance]);

  const handleKeySave = useCallback((key) => {
    localStorage.setItem(STORAGE_KEY, key);
    setApiKey(key);
    fetchBalance(key);
    document.cookie = `muapi_key=${key}; path=/; max-age=31536000; SameSite=Lax`;
  }, [fetchBalance]);

  const handleKeyChange = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
    setBalance(null);
    document.cookie = "muapi_key=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }, []);

  // muapi.js dispatches 'muapi:auth-required' on any 401/403 from the API.
  // The Muapi key is LEGACY (generation runs on Runware/fal): background
  // calls failing must never log the user out of the whole studio — warn
  // once and keep the session. Throttled hard: a burst of failing startup
  // requests fires many events at once.
  const lastAuthRequiredRef = useRef(0);
  useEffect(() => {
    const onAuthRequired = () => {
      const now = Date.now();
      if (now - lastAuthRequiredRef.current < 120000) return;
      lastAuthRequiredRef.current = now;
      toast('Sua chave Muapi parece inválida — uploads e templates podem falhar. Atualize em Settings (a geração via Runware continua normal).', { icon: '🔑', duration: 8000 });
    };
    window.addEventListener('muapi:auth-required', onAuthRequired);
    return () => window.removeEventListener('muapi:auth-required', onAuthRequired);
  }, []);

  // Inject API key into all outgoing Axios requests (prop-based approach)
  // We use an interceptor to be selective and NOT send the key to external domains like S3
  useEffect(() => {
    // Safety: Clear any global defaults that might have been set previously
    delete axios.defaults.headers.common['x-api-key'];

    if (!apiKey) return;

    const interceptorId = axios.interceptors.request.use((config) => {
      // Check if URL is local/proxied
      const isRelative = config.url.startsWith('/') || !config.url.startsWith('http');
      const isInternalProxy = config.url.includes('/api/app') || config.url.includes('/api/workflow') || config.url.includes('/api/agents') || config.url.includes('/api/api') || config.url.includes('/api/v1');

      if (isRelative || isInternalProxy) {
        config.headers['x-api-key'] = apiKey;
      }
      
      return config;
    });

    return () => {
      axios.interceptors.request.eject(interceptorId);
    };
  }, [apiKey]);

  // Poll for balance every 30 seconds if key is present
  useEffect(() => {
    if (!apiKey) return;
    const interval = setInterval(() => fetchBalance(apiKey), 30000);
    return () => clearInterval(interval);
  }, [apiKey, fetchBalance]);

  // Drag and Drop Handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const isFileDrag = e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');
    if (isFileDrag && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container itself, not moving between children
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setDroppedFiles(files);
    }
  }, []);

  const handleFilesHandled = useCallback(() => {
    setDroppedFiles(null);
  }, []);

  // The drag overlay must NEVER stick: capture-phase listeners clear it on
  // any drop (even ones a child handled with stopPropagation), drag end, or Esc.
  useEffect(() => {
    const clear = () => setIsDragging(false);
    const onKey = (e) => { if (e.key === 'Escape') clear(); };
    window.addEventListener('drop', clear, true);
    window.addEventListener('dragend', clear, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('drop', clear, true);
      window.removeEventListener('dragend', clear, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  // Paste-to-attach: Cmd/Ctrl+V with an image (or video) on the clipboard
  // feeds the same pipeline as drag-and-drop. Plain text pastes untouched.
  useEffect(() => {
    const handlePaste = (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const files = items
        .filter((i) => i.kind === 'file' && (i.type.startsWith('image/') || i.type.startsWith('video/')))
        .map((i) => i.getAsFile())
        .filter(Boolean);
      if (files.length === 0) return;
      e.preventDefault();
      const stamped = files.map((f, i) => {
        const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        return f.name && !/^image\.(png|jpe?g)$/i.test(f.name)
          ? f
          : new File([f], `pasted-${Date.now()}-${i}.${ext}`, { type: f.type });
      });
      setDroppedFiles(stamped);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  if (!hasMounted) return (
    <div className="min-h-screen bg-[#0f0f10] flex items-center justify-center">
      <div className="animate-spin text-white/80 text-3xl">◌</div>
    </div>
  );

  if (!apiKey) {
    return <ApiKeyModal onSave={handleKeySave} />;
  }

  return (
    <div 
      className="h-screen bg-[#0f0f10] flex flex-col overflow-hidden text-white relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay — light dim so drop targets stay visible */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-black/35 flex items-start justify-center pt-16 pointer-events-none transition-opacity duration-200">
          <div className="bg-[#1d1d1f]/95 backdrop-blur-xl px-5 py-2.5 rounded-full border border-white/[0.12] shadow-2xl flex items-center gap-2.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/70"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            <span className="text-[13px] font-medium text-white/85">Solte aqui — ou mire num campo de referência</span>
          </div>
        </div>
      )}

      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: 'rgba(29,29,31,0.96)',
            color: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            fontSize: '13px',
            backdropFilter: 'blur(20px)',
          },
        }}
      />

      {/* Header */}
      {isHeaderVisible && (
        <header className="flex-shrink-0 h-[52px] border-b border-white/[0.08] flex items-center justify-between px-4 bg-[#171719]/75 backdrop-blur-2xl z-50 gap-4">
          {/* Left: Mobile menu toggle + Logo + Desktop Sidebar Toggle */}
          <div className="flex items-center gap-3">
            {/* Mobile drawer toggle */}
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="pressable md:hidden p-2 rounded-lg bg-transparent hover:bg-white/[0.07] text-white/70 hover:text-white"
              aria-label="Toggle Navigation Menu"
            >
              <MenuIcon size={20} strokeWidth={1.75} />
            </button>

            {/* Desktop Sidebar Toggle Button (Single Toggle Button) */}
            <div className="hidden md:block relative group">
              <button
                onClick={toggleSidebar}
                className="pressable flex items-center justify-center w-8 h-8 rounded-lg bg-transparent hover:bg-white/[0.07] text-white/60 hover:text-white"
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <PanelLeft size={17} strokeWidth={1.75} />
              </button>
              {/* Custom Tooltip */}
              <div className="absolute left-0 top-full mt-2 px-2.5 py-1 bg-[#1d1d1f]/95 backdrop-blur-md text-white text-[11px] font-medium rounded-md shadow-2xl border border-white/15 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 whitespace-nowrap">
                {isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              </div>
            </div>

            {/* Logo & Title */}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-gradient-to-b from-white/15 to-white/10 rounded-[8px] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_0.5px_0_rgba(255,255,255,0.3)]">
                <Sparkles size={15} strokeWidth={1.75} color="white" />
              </div>
              <span className="text-[13px] font-semibold tracking-tight hidden sm:block text-white/90">
                Studio
              </span>
            </div>
          </div>

          {/* Project switcher */}
          <div className="relative">
            <button
              onClick={() => { setShowProjectMenu((v) => !v); if (!showProjectMenu) refreshFolderStates(projects); }}
              className="pressable flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-xs text-white/60 hover:bg-white/[0.08] hover:text-white"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeProjectId ? 'bg-[#EF0328]' : 'bg-white/40'}`} />
              <span className="font-medium text-white/80 max-w-[160px] truncate">
                {projects.find((p) => p.id === activeProjectId)?.name || 'Sem projeto'}
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {showProjectMenu && (
              <div className="absolute top-full mt-2 left-0 z-[80] min-w-[220px] bg-[#1d1d1f]/[0.98] backdrop-blur-3xl rounded-xl border border-white/[0.1] shadow-[0_16px_48px_rgba(0,0,0,0.65),inset_0_0.5px_0_rgba(255,255,255,0.08)] p-1.5">
                <button
                  onClick={() => selectProject(null)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[13px] transition-colors duration-100 ${!activeProjectId ? 'bg-white/[0.09] text-white' : 'text-white/70 hover:bg-white/[0.05] hover:text-white'}`}
                >
                  Sem projeto
                </button>
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className={`group w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors duration-100 ${activeProjectId === p.id ? 'bg-white/[0.09] text-white' : 'text-white/70 hover:bg-white/[0.05] hover:text-white'}`}
                  >
                    {editingProject?.id === p.id ? (
                      <input
                        autoFocus
                        value={editingProject.value}
                        onChange={(e) => setEditingProject({ id: p.id, value: e.target.value })}
                        onBlur={() => renameProject(p.id, editingProject.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameProject(p.id, editingProject.value);
                          if (e.key === 'Escape') setEditingProject(null);
                        }}
                        className="flex-1 min-w-0 bg-[#212123] border border-[#EF0328]/40 rounded px-1.5 py-0.5 text-[13px] text-white outline-none"
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => selectProject(p.id)}
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingProject({ id: p.id, value: p.name }); }}
                        title={p.path || 'Duplo clique para renomear'}
                        className="flex-1 min-w-0 truncate cursor-pointer"
                      >
                        {p.name}
                      </span>
                    )}
                    {!projectCaps.folders && folderSyncSupported() && editingProject?.id !== p.id && (
                      <button
                        type="button"
                        title={folderStates[p.id] === 'granted' ? 'Pasta conectada — clique para sincronizar agora' : folderStates[p.id] === 'prompt' ? 'Reconectar pasta local' : 'Conectar uma pasta local — as gerações deste projeto baixam sozinhas nela'}
                        onClick={(e) => { e.stopPropagation(); folderStates[p.id] === 'none' || !folderStates[p.id] ? linkProjectFolder(p) : resyncProjectFolder(p); }}
                        className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-colors duration-100 ${syncingProject === p.id ? 'text-white/80 animate-pulse' : folderStates[p.id] === 'granted' ? 'text-white/70 hover:text-white' : folderStates[p.id] === 'prompt' ? 'text-amber-400/80 hover:text-amber-300' : 'text-white/30 hover:text-white/70 opacity-0 group-hover:opacity-100'}`}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>{folderStates[p.id] === 'granted' && <path d="M9 13l2 2 4-4"/>}</svg>
                      </button>
                    )}
                    {editingProject?.id !== p.id && (
                      <button
                        type="button"
                        title="Excluir projeto"
                        onClick={(e) => { e.stopPropagation(); deleteProject(p); }}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-white/30 hover:text-red-400 hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-colors duration-100"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      </button>
                    )}
                  </div>
                ))}
                <div className="h-px bg-white/[0.08] my-1" />
                <button
                  onClick={() => { setShowProjectMenu(false); setShowNewProject(true); setNewProjectPath(''); }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[13px] font-medium text-[#FF2447] hover:bg-white/[0.05] transition-colors duration-100"
                >
                  + Novo projeto
                </button>
              </div>
            )}
          </div>

          {/* Projeto/Geral — app-wide gallery scope */}
          {projects.length > 0 && (
            <div className="hidden sm:flex items-center bg-white/[0.05] border border-white/[0.07] rounded-lg p-0.5 gap-0.5">
              {[['project', 'Projeto'], ['all', 'Geral']].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setGalleryScope(value)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 ${
                    galleryScope === value ? 'bg-[#636366]/90 text-white shadow-sm' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex-shrink-0 flex items-center gap-3">
            {(() => {
              const parts = [
                { label: 'Muapi', value: typeof balance === 'number' ? balance : parseFloat(balance) || null },
                { label: 'Runware', value: providerBalances.runware },
                { label: 'fal', value: providerBalances.fal },
              ].filter((p) => p.value !== null && !Number.isNaN(p.value));
              const total = parts.reduce((sum, p) => sum + p.value, 0);
              let breakdown = parts.map((p) => `${p.label} $${p.value.toFixed(2)}`).join(' · ');
              if (getProviderKey('fal') && providerBalances.fal === null) {
                breakdown += breakdown ? ' · fal: active (balance needs an admin-scope key)' : 'fal: active (balance needs an admin-scope key)';
              }
              return (
                <div
                  title={breakdown || 'No balance data'}
                  className="flex items-center gap-2 bg-white/[0.06] px-3 py-1.5 rounded-full border border-white/[0.06] cursor-default"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
                  <span className="text-xs font-medium text-white/90 tabular-nums">
                    {parts.length > 0 ? `$${total.toFixed(2)}` : '$---'}
                  </span>
                  {parts.length > 1 && (
                    <span className="text-[9px] text-white/40 font-medium">
                      {parts.length} APIs
                    </span>
                  )}
                </div>
              );
            })()}

            <button
              onClick={() => setShowSettings(true)}
              className="pressable flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.06] text-[13px] font-medium text-white/80 hover:text-white hover:bg-white/10"
              aria-label="Settings"
            >
              <SettingsIcon size={15} strokeWidth={1.75} />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </header>
      )}

      {/* Main Body Layout: Left Sidebar + Studio Content Area */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* Mobile Backdrop Overlay */}
        {isMobileOpen && (
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden animate-fade-in"
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        {/* Left Sidebar Navigation */}
        {isHeaderVisible && (
          <aside
            className={`
              fixed top-14 bottom-0 left-0 md:static md:h-full z-30 bg-[#171719]/80 backdrop-blur-2xl border-r border-white/[0.08] flex flex-col transition-[width,transform] duration-350 ease-apple flex-shrink-0 select-none
              ${isMobileOpen ? 'translate-x-0 w-60 z-50' : '-translate-x-full md:translate-x-0'}
              ${isSidebarCollapsed ? 'md:w-16' : 'md:w-52'}
            `}
          >
            <nav aria-label="Studio navigation" className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-2 px-2">
              <div className="space-y-1">
                {NAVIGATION_CATEGORIES.map((category) => {
                  const isCategoryActive = activeCategory?.id === category.id;
                  const isCollapsed = isSidebarCollapsed && !isMobileOpen;
                  const isCategoryOpen = !isCollapsed && expandedCategoryId === category.id;
                  const categoryPanelId = `navigation-category-${category.id}`;

                  return (
                    <div key={category.id} className="relative">
                      <button
                        type="button"
                        onClick={() => handleCategoryToggle(category.id)}
                        aria-label={category.label}
                        aria-expanded={isCategoryOpen}
                        aria-controls={isCollapsed ? undefined : categoryPanelId}
                        title={isCollapsed ? category.label : undefined}
                        className={`
                          pressable group relative flex items-center rounded-lg font-medium
                          ${isCollapsed ? 'h-11 w-11 justify-center mx-auto' : 'px-3 py-2.5 w-full gap-3 text-left'}
                          ${isCategoryActive
                            ? 'bg-white/[0.09] text-white'
                            : isCategoryOpen
                              ? 'bg-white/[0.06] text-white'
                              : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                          }
                        `}
                      >
                        <span className={`flex-shrink-0 transition-colors ${isCategoryActive ? 'text-white/80' : 'text-white/55 group-hover:text-white'}`}>
                          {category.icon}
                        </span>

                        {!isCollapsed && (
                          <>
                            <span className="flex-1 min-w-0 text-[13px] leading-4 tracking-tight">
                              {category.label}
                            </span>
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`flex-shrink-0 transition-transform duration-200 ${isCategoryOpen ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            >
                              <path d="M6 9l6 6 6-6"/>
                            </svg>
                          </>
                        )}
                      </button>

                      {!isCollapsed && isCategoryOpen && (
                        <div
                          id={categoryPanelId}
                          role="group"
                          aria-label={`${category.label} tools`}
                          className="mt-1 ml-2 pl-2 border-l border-white/[0.08] space-y-1 max-h-64 overflow-y-auto scrollbar-none"
                        >
                          {category.tabIds.map((tabId) => {
                            const tab = TABS.find((item) => item.id === tabId);
                            if (!tab) return null;
                            const isActive = activeTab === tab.id;

                            return (
                              <a
                                key={tab.id}
                                href={`/studio/${tab.id}`}
                                onClick={(event) => handleNavigationItemClick(event, tab.id)}
                                aria-current={isActive ? 'page' : undefined}
                                className={`
                                  pressable group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-normal
                                  ${isActive
                                    ? 'bg-[#EF0328] text-white'
                                    : 'text-white/55 hover:text-white hover:bg-white/[0.04]'
                                  }
                                `}
                              >
                                <span className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-white/45 group-hover:text-white/80'}`}>
                                  {tab.icon}
                                </span>
                                <span className="truncate">{tab.label}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {EXPLORE_APPS_TAB && (
                <div className="mt-3 pt-3 border-t border-white/[0.07]">
                  <a
                    href={`/studio/${EXPLORE_APPS_TAB.id}`}
                    onClick={(event) => handleNavigationItemClick(event, EXPLORE_APPS_TAB.id)}
                    aria-current={activeTab === EXPLORE_APPS_TAB.id ? 'page' : undefined}
                    aria-label={EXPLORE_APPS_TAB.label}
                    title={isSidebarCollapsed && !isMobileOpen ? EXPLORE_APPS_TAB.label : undefined}
                    className={`
                      group relative flex items-center rounded-xl transition-all duration-150 text-[13px] font-semibold
                      ${isSidebarCollapsed && !isMobileOpen ? 'h-11 w-11 justify-center mx-auto' : 'px-3 py-2.5 w-full gap-3'}
                      ${activeTab === EXPLORE_APPS_TAB.id
                        ? 'bg-white/[0.09] text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                      }
                    `}
                  >
                    <span className={`flex-shrink-0 ${activeTab === EXPLORE_APPS_TAB.id ? 'text-white/80' : 'text-white/50 group-hover:text-white'}`}>
                      {EXPLORE_APPS_TAB.icon}
                    </span>
                    {(!isSidebarCollapsed || isMobileOpen) && (
                      <span className="truncate">{EXPLORE_APPS_TAB.label}</span>
                    )}
                  </a>
                </div>
              )}
            </nav>
          </aside>
        )}

        {/* Studio Content */}
        <div className="flex-1 min-h-0 h-full relative overflow-hidden bg-[#0f0f10]">
        <div className={activeTab === 'image' ? "h-full w-full" : "hidden"}>
          <ImageStudio apiKey={apiKey} droppedFiles={activeTab === 'image' ? droppedFiles : null} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('image')} onGenerationEnd={makeGenerationEndCallback('image')} onGenerationComplete={makeSuccessCallback('image')} onGenerationError={makeErrorCallback('image')} />
        </div>
        <div className={activeTab === 'layers' ? "h-full w-full" : "hidden"}>
          <LayersStudio apiKey={apiKey} droppedFiles={activeTab === 'layers' ? droppedFiles : null} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('layers')} onGenerationEnd={makeGenerationEndCallback('layers')} onGenerationComplete={makeSuccessCallback('layers')} onGenerationError={makeErrorCallback('layers')} />
        </div>
        <div className={activeTab === 'video' ? "h-full w-full" : "hidden"}>
          <VideoStudio apiKey={apiKey} droppedFiles={activeTab === 'video' ? droppedFiles : null} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('video')} onGenerationEnd={makeGenerationEndCallback('video')} onGenerationComplete={makeSuccessCallback('video')} onGenerationError={makeErrorCallback('video')} />
        </div>
        <div className={activeTab === 'clipping' ? "h-full w-full" : "hidden"}>
          <ClippingStudio apiKey={apiKey} droppedFiles={activeTab === 'clipping' ? droppedFiles : null} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('clipping')} onGenerationEnd={makeGenerationEndCallback('clipping')} onGenerationComplete={makeSuccessCallback('clipping')} onGenerationError={makeErrorCallback('clipping')} />
        </div>
        <div className={activeTab === 'vibe-motion' ? "h-full w-full" : "hidden"}>
          <VibeMotionStudio apiKey={apiKey} onGenerationStart={makeGenerationStartCallback('vibe-motion')} onGenerationEnd={makeGenerationEndCallback('vibe-motion')} onGenerationComplete={makeSuccessCallback('vibe-motion')} onGenerationError={makeErrorCallback('vibe-motion')} />
        </div>
        <div className={activeTab === 'lipsync' ? "h-full w-full" : "hidden"}>
          <LipSyncStudio apiKey={apiKey} droppedFiles={activeTab === 'lipsync' ? droppedFiles : null} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('lipsync')} onGenerationEnd={makeGenerationEndCallback('lipsync')} onGenerationComplete={makeSuccessCallback('lipsync')} onGenerationError={makeErrorCallback('lipsync')} />
        </div>
        <div className={activeTab === 'body-swap' ? "h-full w-full" : "hidden"}>
          <RecastStudio apiKey={apiKey} droppedFiles={activeTab === 'body-swap' ? droppedFiles : null} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('body-swap')} onGenerationEnd={makeGenerationEndCallback('body-swap')} onGenerationComplete={makeSuccessCallback('body-swap')} onGenerationError={makeErrorCallback('body-swap')} />
        </div>
        <div className={activeTab === 'cinema' ? "h-full w-full" : "hidden"}>
          <CinemaStudio apiKey={apiKey} droppedFiles={activeTab === 'cinema' ? droppedFiles : null} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('cinema')} onGenerationEnd={makeGenerationEndCallback('cinema')} onGenerationComplete={makeSuccessCallback('cinema')} onGenerationError={makeErrorCallback('cinema')} />
        </div>
        <div className={activeTab === 'production' ? "h-full w-full" : "hidden"}>
          <ProductionStudio apiKey={apiKey} onGenerationStart={makeGenerationStartCallback('production')} onGenerationEnd={makeGenerationEndCallback('production')} onGenerationComplete={makeSuccessCallback('production')} onGenerationError={makeErrorCallback('production')} />
        </div>
        <div className={activeTab === 'audio' ? "h-full w-full" : "hidden"}>
          <AudioStudio apiKey={apiKey} droppedFiles={activeTab === 'audio' ? droppedFiles : null} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('audio')} onGenerationEnd={makeGenerationEndCallback('audio')} onGenerationComplete={makeSuccessCallback('audio')} onGenerationError={makeErrorCallback('audio')} />
        </div>
        <div className={activeTab === 'marketing' ? "h-full w-full" : "hidden"}>
          <MarketingStudio apiKey={apiKey} droppedFiles={activeTab === 'marketing' ? droppedFiles : null} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('marketing')} onGenerationEnd={makeGenerationEndCallback('marketing')} onGenerationComplete={makeSuccessCallback('marketing')} onGenerationError={makeErrorCallback('marketing')} />
        </div>
        <div className={activeTab === 'workflows' ? "h-full w-full" : "hidden"}>
          <WorkflowStudio
            apiKey={apiKey}
            isHeaderVisible={isHeaderVisible}
            onToggleHeader={setIsHeaderVisible}
            onGenerationStart={makeGenerationStartCallback('workflows')}
            onGenerationEnd={makeGenerationEndCallback('workflows')}
            onGenerationComplete={makeSuccessCallback('workflows')}
            onGenerationError={makeErrorCallback('workflows')}
          />
        </div>
        <div className={activeTab === 'agents' ? "h-full w-full" : "hidden"}>
          <AgentStudio apiKey={apiKey} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />
        </div>
        <div className={activeTab === 'design-agent' ? "h-full w-full" : "hidden"}>
          {activeTab === 'design-agent' && (
            <DesignAgentStudio
              apiKey={apiKey}
              isHeaderVisible={isHeaderVisible}
              onToggleHeader={setIsHeaderVisible}
              onGenerationStart={makeGenerationStartCallback('design-agent')}
              onGenerationEnd={makeGenerationEndCallback('design-agent')}
              onGenerationComplete={makeSuccessCallback('design-agent')}
              onGenerationError={makeErrorCallback('design-agent')}
            />
          )}
        </div>
        <div className={activeTab === 'apps' ? "h-full w-full" : "hidden"}>
          <AppsStudio apiKey={apiKey} />
        </div>
        <div className={activeTab === 'ai-influencer' ? "h-full w-full" : "hidden"}>
          <AiInfluencerStudio
            apiKey={apiKey}
            onGenerationStart={makeGenerationStartCallback('ai-influencer')}
            onGenerationEnd={makeGenerationEndCallback('ai-influencer')}
            onGenerationComplete={makeSuccessCallback('ai-influencer')}
            onGenerationError={makeErrorCallback('ai-influencer')}
          />
        </div>
      </div>
    </div>

      {/* Global generation activity and notification stack */}
      {(activeGenerations.length > 0 || notifications.length > 0) && (
        <div
          aria-live="polite"
          aria-label="Generation activity and notifications"
          className="fixed top-16 right-5 z-[200] flex max-h-[calc(100vh-80px)] w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2 overflow-x-hidden overflow-y-auto global-notif-stack pointer-events-none"
          data-testid="global-notification-stack"
        >
          {activeGenerations.map((generation) => (
            <div
              key={generation.tabId}
              role="status"
              data-generation-tab={generation.tabId}
              className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/15 bg-white px-3.5 py-3 text-[13px] text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
              data-testid="generation-activity"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/15">
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/15 border-t-blue-600"
                  aria-hidden="true"
                />
              </span>
              <p className="min-w-0 flex-1 font-semibold leading-5 text-zinc-900">
                {generation.label} is generating
                {generation.count > 1 ? ` (${generation.count})` : ''}
              </p>
            </div>
          ))}

          {notifications.map((notif) => (
            <div
              key={notif.id}
              role={notif.type === 'error' ? 'alert' : 'status'}
              data-notification-type={notif.type}
              data-notification-tab={notif.tabId}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-3.5 py-3 text-[13px] text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
              style={{
                borderColor: notif.type === 'success' ? 'rgba(6,182,212,0.4)' : 'rgba(239,68,68,0.4)',
                animation: 'slideInRight 280ms cubic-bezier(0.16,1,0.3,1) forwards',
              }}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                  notif.type === 'success'
                    ? 'border-white/15 bg-white/15 text-white/70'
                    : 'border-red-400/40 bg-red-50 text-red-600'
                }`}
              >
                {notif.type === 'success' ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v6" />
                    <path d="M12 17h.01" />
                  </svg>
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-5 text-zinc-900">
                  {notif.label}
                  <span className="font-normal text-zinc-500">
                    {notif.type === 'success' ? ' - Generation complete' : ' - Generation failed'}
                  </span>
                </p>
                {notif.type === 'error' && notif.message && (
                  <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-4 text-red-600" title={typeof notif.message === 'string' ? notif.message : String(notif.message?.message || notif.message)}>
                    {typeof notif.message === 'string' ? notif.message : String(notif.message?.message || notif.message)}
                  </p>
                )}
                {notif.type === 'success' && (
                  <p className="mt-0.5 text-[12px] leading-4 text-zinc-500">
                    Your result is ready.
                  </p>
                )}
                {notif.type === 'success' && (
                  <button
                    type="button"
                    onClick={() => handleOpenNotification(notif)}
                    className="mt-1.5 text-[11px] font-bold text-white/70 transition-colors hover:text-white/70"
                    aria-label={`Open ${notif.label} result`}
                  >
                    Open →
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismissNotification(notif.id)}
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                aria-label="Dismiss notification"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Keyframe for toast slide-in & scrollbar suppression */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .global-notif-stack::-webkit-scrollbar {
          display: none;
        }
        .global-notif-stack {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Settings Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[90] animate-fade-in-up">
          <div className="bg-[#171719] border border-white/10 rounded-xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-white font-semibold text-lg mb-1">Novo projeto</h2>
            <p className="text-white/40 text-[13px] mb-6">
              {projectCaps.folders
                ? 'Toda criação feita com este projeto ativo é salva automaticamente na pasta escolhida.'
                : 'Toda criação feita com este projeto ativo fica agrupada no histórico — filtre pelo seletor Projeto no topo.'}
            </p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-white/40 mb-1.5">Nome do projeto</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createProject()}
                  placeholder="Campanha Verão 2027"
                  autoFocus
                  className="w-full bg-white/[0.06] border border-white/[0.09] rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#EF0328]/40 focus:border-[#EF0328]/40 transition-[border-color,box-shadow] duration-150"
                />
              </div>
              {projectCaps.folders && (
              <div>
                <label className="block text-xs font-medium text-white/40 mb-1.5">Pasta no computador</label>
                <div className="flex items-center gap-2">
                  {projectCaps.picker && (
                  <button
                    type="button"
                    disabled={pickingFolder}
                    onClick={async () => {
                      if (pickingFolder) return;
                      setPickingFolder(true);
                      try {
                        const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pick-folder' }) });
                        const data = await r.json();
                        if (data.ok && data.path) setNewProjectPath(data.path);
                        else if (!data.canceled) alert(data.error || 'O seletor de pasta não respondeu — verifique a janela do Finder.');
                      } catch {
                        alert('Não consegui abrir o seletor de pasta.');
                      } finally {
                        setPickingFolder(false);
                      }
                    }}
                    className="pressable shrink-0 h-11 px-4 rounded-lg bg-white/[0.08] border border-white/[0.1] text-[13px] font-medium text-white/85 hover:bg-white/[0.12] disabled:opacity-50"
                  >
                    {pickingFolder ? 'Escolhendo… (veja o Finder)' : 'Escolher pasta…'}
                  </button>
                  )}
                  <div className="flex-1 min-w-0 h-11 px-3 flex items-center rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12px] font-mono text-white/50 truncate">
                    {newProjectPath || `~/Documents/OpenGenerativeAI/${newProjectName.trim() || '…'}`}
                  </div>
                </div>
              </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={createProject}
                className="pressable flex-1 h-10 rounded-lg bg-[#EF0328] text-white text-xs font-semibold hover:bg-[#FF2447]"
              >
                Criar projeto
              </button>
              <button
                onClick={() => setShowNewProject(false)}
                className="pressable flex-1 h-10 rounded-lg bg-white/5 text-white/80 hover:bg-white/10 text-xs font-semibold border border-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
          <div className="bg-[#171719] border border-white/10 rounded-xl p-8 w-full max-w-sm shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-2">Settings</h2>
            <p className="text-white/40 text-[13px] mb-8">
              Manage your AI studio preferences and authentication.
            </p>
            
            <div className="space-y-4 mb-8">
              <div className="bg-white/5 border border-white/[0.03] rounded-md p-4">
                <label className="block text-xs font-bold text-white/30 mb-2">
                   Muapi Key <span className="font-normal text-white/25">(legado — não gera mais)</span>
                </label>
                <div className="text-[13px] font-mono text-white/80">
                  {apiKey.slice(0, 8)}••••••••••••••••
                </div>
              </div>

              <div className="bg-white/5 border border-white/[0.03] rounded-md p-4">
                <label className="block text-xs font-bold text-white/30 mb-2">
                  Runware Key <span className="font-normal text-white/25">(principal — necessária para gerar)</span>
                </label>
                <input
                  type="password"
                  value={runwareKey}
                  onChange={(e) => setRunwareKey(e.target.value)}
                  placeholder="Paste your Runware key..."
                  className="w-full bg-white/[0.06] border border-white/[0.09] rounded-lg px-3 py-2 text-[13px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#EF0328]/40 focus:border-[#EF0328]/40 transition-[border-color,box-shadow] duration-150"
                />
              </div>

              <div className="bg-white/5 border border-white/[0.03] rounded-md p-4">
                <label className="block text-xs font-bold text-white/30 mb-2">
                  fal.ai Key <span className="font-normal text-white/25">(opcional — modelos que a Runware não tem)</span>
                </label>
                <input
                  type="password"
                  value={falKey}
                  onChange={(e) => setFalKey(e.target.value)}
                  placeholder="Paste your fal.ai key..."
                  className="w-full bg-white/[0.06] border border-white/[0.09] rounded-lg px-3 py-2 text-[13px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#EF0328]/40 focus:border-[#EF0328]/40 transition-[border-color,box-shadow] duration-150"
                />
              </div>

              <p className="text-[11px] text-white/30 leading-relaxed px-1">
                Imagens e vídeos geram na Runware (catálogo nativo) e, quando o
                modelo só existe lá, na fal. A chave Muapi permanece salva apenas
                para ferramentas antigas — ela não participa mais das gerações.
              </p>

              <button
                onClick={() => {
                  setProviderKey('runware', runwareKey.trim());
                  setProviderKey('fal', falKey.trim());
                  setShowSettings(false);
                }}
                className="pressable w-full h-10 rounded-lg bg-[#EF0328] text-white text-xs font-semibold hover:bg-[#FF2447]"
              >
                Save provider keys
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleKeyChange}
                className="flex-1 h-10 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-all"
              >
                Change Key
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 h-10 rounded-md bg-white/5 text-white/80 hover:bg-white/10 text-xs font-semibold transition-all border border-white/5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
