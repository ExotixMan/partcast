import { t, useLocale } from "../context/LocaleContext.jsx";
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Boxes, ChartNoAxesCombined, ChevronRight, CircleHelp, FileDown, History, House, ShoppingCart, Wallet, LogOut, Menu, RefreshCcw, Settings, Truck, Upload, UserRound, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {canOpenPage} from '../lib/access.js';
import SyncStatus from './SyncStatus.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import Preferences from './Preferences.jsx';
import AssistantChat from './AssistantChat.jsx';
const daily = [{
  to: '/',
  label: 'Home',
  hint: 'Start your day',
  icon: House,
  end: true
}, {
  to: '/counter',
  label: 'Sell or receive',
  hint: 'Sales and deliveries in one place',
  icon: ShoppingCart
}, {
  to: '/inventory',
  label: 'Inventory',
  hint: 'Part details and stock corrections',
  icon: Boxes
}, {
  to: '/reorder',
  label: 'Restock',
  hint: 'Check what needs ordering',
  icon: Truck
}];
const tools = [{
  to: '/debts',
  label: 'Customer utang',
  icon: Wallet
}, {
  to: '/transactions',
  label: 'Stock history',
  icon: History
}, {
  to: '/forecast',
  label: 'Demand planning',
  icon: ChartNoAxesCombined
}, {
  to: '/reports',
  label: 'Reports',
  icon: FileDown
}];
const management = [{
  to: '/imports',
  label: 'Import spreadsheets',
  icon: Upload,
  admin: true
}, {
  to: '/backups',
  label: 'Backups',
  icon: RefreshCcw,
  admin: true
}, {
  to: '/users',
  label: 'Staff accounts',
  icon: Users,
  owner: true
}, {
  to: '/settings',
  label: 'Store settings',
  icon: Settings,
  owner: true
}, {to:'/it-settings',label:'IT settings',icon:Settings}];
const allLinks = [...daily, ...tools, ...management, {
  to: '/account',
  label: 'My account'
}];
const help = () => window.dispatchEvent(new Event('partcast:help'));
function NavigationItem({
  item,
  close
}) {
  useLocale();
  return <NavLink to={item.to} end={item.end} onClick={close} className={({
    isActive
  }) => `group flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${isActive ? 'bg-red-50 font-bold text-red-700' : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
    <item.icon size={20} strokeWidth={1.8} className="shrink-0" />
    <span className="min-w-0"><span className="block">{t(item.label)}</span>{item.hint && <span className="mt-0.5 block text-xs font-normal text-slate-600">{t(item.hint)}</span>}</span>
    <ChevronRight size={15} className="ml-auto shrink-0 opacity-40" aria-hidden="true" />
  </NavLink>;
}
function SidebarContent({
  close,
  mobile = false
}) {
  useLocale();
  const {
    profile,
    signOut
  } = useAuth();
  const location = useLocation();
  const allowed = management.filter(n => canOpenPage(profile?.role,n.to));
  const dailyLinks = daily.filter(n => canOpenPage(profile?.role,n.to));
  const reviewLinks = tools.filter(n => canOpenPage(profile?.role,n.to));
  return <>
    <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-6">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><Boxes size={24} /></span>
      <div><p className="text-xl font-bold tracking-tight text-slate-950">{t("PartCast")}<span className="text-red-600">.</span></p><p className="text-xs font-medium text-slate-500">{t("NPG Auto Parts")}</p></div>
    </div>
    <nav aria-label={mobile ? t('All pages') : t('Main navigation')} className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
      <div className="space-y-1">{dailyLinks.map(item => <NavigationItem key={item.to} item={item} close={close} />)}</div>
      <div hidden={!reviewLinks.length}><p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Review & plan")}</p><div className="space-y-1">{reviewLinks.map(item => <NavigationItem key={item.to} item={item} close={close} />)}</div></div>
      {allowed.length > 0 && <details open={allowed.some(n => location.pathname.startsWith(n.to)) || undefined} className="group"><summary className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Settings size={17} />{t("Manage the store")}<ChevronRight size={16} className="ml-auto transition group-open:rotate-90" /></summary><div className="mt-2 space-y-1">{allowed.map(item => <NavigationItem key={item.to} item={item} close={close} />)}</div></details>}
      <button className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-red-100 bg-red-50/60 px-3 py-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => {
        close?.();
        help();
      }}><CircleHelp size={20} />{t("How do I\u2026?")}</button>
    </nav>
    <div className="border-t border-slate-100 p-3">
      <NavLink to="/account" onClick={close} className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><UserRound size={19} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{profile?.full_name || t('My account')}</span><span className="block text-xs text-slate-500">{t("My account")}</span></span></NavLink>
      <button onClick={signOut} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><LogOut size={18} />{t("Sign out")}</button>
    </div>
  </>;
}
export default function AppShell() {
  useLocale();
  const {profile} = useAuth();
  const quickLinks = daily.filter(n => n.to !== '/reorder' && canOpenPage(profile?.role,n.to));
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);
  const location = useLocation();
  const current = allLinks.find(n => n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to));
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement,
      oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector('button')?.focus();
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab') {
        const elements = [...drawerRef.current.querySelectorAll('a[href],button,summary')].filter(el => !el.disabled && el.getClientRects().length);
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = e => {
      if (e.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', closeOnDesktop);
      previous?.focus();
    };
  }, [open]);
  return <div className="min-h-screen bg-slate-50">
    <a href="#main-content" className="skip-link">{t("Skip to page content")}</a>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex"><SidebarContent /></aside>
    {open && <div className="fixed inset-0 z-50 bg-slate-950/25 lg:hidden" onClick={() => setOpen(false)}>
      <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label={t("All pages")} className="relative flex h-[100dvh] w-[88vw] max-w-80 flex-col bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <button aria-label={t("Close navigation")} className="absolute right-3 top-6 grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" onClick={() => setOpen(false)}><X size={21} /></button><SidebarContent mobile close={() => setOpen(false)} />
      </aside>
    </div>}
    <div className="min-w-0 lg:pl-64" inert={open ? true : undefined}>
      <header className="sticky top-0 z-20 flex min-h-18 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <button aria-label={t("Open navigation")} aria-expanded={open} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-700 lg:hidden" onClick={() => setOpen(true)}><Menu size={21} /></button>
        <div className="hidden min-w-0 sm:block"><p className="truncate text-sm font-semibold text-slate-900">{t(current?.label) || t('PartCast')}</p><p className="text-xs text-slate-500">{t("NPG Auto Parts")}</p></div>
        <div className="ml-auto flex shrink-0 items-center gap-2"><button aria-label={t("Open Store Assistant")} className="btn-secondary hidden lg:inline-flex" onClick={help}><CircleHelp size={18} />{t("Need help?")}</button><Preferences /><NotificationCenter /></div>
      </header>
      <SyncStatus />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8"><Outlet /></main>
      <nav aria-label={t("Quick navigation")} style={{gridTemplateColumns:`repeat(${quickLinks.length+2},minmax(0,1fr))`}} className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(15,23,42,0.03)] lg:hidden">
        {quickLinks.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({
          isActive
        }) => `m-1 flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold ${isActive ? 'bg-red-50 text-red-700' : 'text-slate-600'}`}><item.icon size={21} />{item.to === '/inventory' ? t('Parts') : item.to === '/counter' ? t('Sell / receive') : t(item.label)}</NavLink>)}
        <button aria-label={t("Open Store Assistant")} className="m-1 flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={help}><CircleHelp size={21} />{t("Help")}</button>
        <button aria-label={t("More pages")} aria-expanded={open} className="m-1 flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setOpen(true)}><Menu size={21} />{t("More")}</button>
      </nav>
    </div>
    <AssistantChat />
  </div>;
}
