'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Activity,
  DollarSign,
  Home,
  Menu,
  X,
  Zap,
} from 'lucide-react';

const navItems = [
  {
    href: '/',
    label: 'Inicio',
    icon: Home,
    description: 'Panel principal',
  },
  {
    href: '/liveops',
    label: 'Operaciones',
    icon: Activity,
    description: 'Métricas en vivo',
  },
  {
    href: '/finance',
    label: 'Finanzas',
    icon: DollarSign,
    description: 'Retiros y ledger',
  },
  {
    href: '/rooms',
    label: 'Salas',
    icon: LayoutDashboard,
    description: 'Gestión de salas',
  },
];

export function AdminNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // No mostrar nav en la página de login
  if (pathname === '/login') return null;

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-400" />
          <span className="font-bold text-white text-sm">BinGo! Admin</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-gray-300">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        'fixed top-0 left-0 h-full z-50 w-56 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform duration-200',
        'md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-gray-800 shrink-0">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">BinGo!</p>
            <p className="text-gray-500 text-[10px]">Admin Console</p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group',
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <div>
                  <p className="text-sm font-medium leading-none">{item.label}</p>
                  <p className={clsx(
                    'text-[10px] mt-0.5',
                    isActive ? 'text-indigo-200' : 'text-gray-600 group-hover:text-gray-400'
                  )}>
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 shrink-0">
          <p className="text-gray-600 text-[10px]">v1.0 · Local</p>
        </div>
      </aside>

      {/* Mobile spacer */}
      <div className="md:hidden h-14" />
    </>
  );
}
