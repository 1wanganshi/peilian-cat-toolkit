import type { JSX } from 'react';
import { Button } from 'antd';
import { FileText, History, ImagePlus, LogOut, MessageCircle, ServerCog } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { UserAuthSession } from '../../shared/types';

const NAV_ITEMS = [
  { path: '/scripts', label: '短视频脚本', icon: FileText },
  { path: '/moments', label: 'AI 朋友圈', icon: MessageCircle },
  { path: '/articles', label: '图文发布', icon: ImagePlus },
  { path: '/history', label: '历史记录', icon: History },
  { path: '/backend', label: '更新及授权', icon: ServerCog }
];

const PAGE_TITLES: Record<string, string> = {
  '/scripts': '短视频脚本生成器',
  '/moments': 'AI 朋友圈',
  '/articles': '图文发布工具',
  '/history': '历史记录',
  '/backend': '更新及授权'
};

interface AppLayoutProps {
  session: UserAuthSession;
  onLogout: () => void | Promise<void>;
}

export function AppLayout({ session, onLogout }: AppLayoutProps): JSX.Element {
  const location = useLocation();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">猫</div>
          <div>
            <strong>陪练猫</strong>
            <span>内容工具包</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.path} to={item.path} className="nav-item">
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-session">
          <span>当前账号</span>
          <strong>{session.phone}</strong>
          <Button size="small" icon={<LogOut size={14} />} onClick={onLogout}>
            退出
          </Button>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <span className="eyebrow">Creator Workbench</span>
            <h1>{PAGE_TITLES[location.pathname] ?? '陪练猫工具包'}</h1>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
