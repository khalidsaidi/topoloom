import { NavLink } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { navSections } from '@/data/nav';

export type NavListProps = {
  onNavigate?: () => void;
};

export function NavList({ onNavigate }: NavListProps) {
  return (
    <nav className="space-y-6">
      {navSections.map((section) => (
        <div key={section.title} className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {section.title}
          </div>
          <div className="space-y-1">
            {section.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'block rounded-lg px-3 py-2 text-sm transition',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground/80 hover:bg-muted',
                  )
                }
                end={item.path === '/'}
              >
                <div className="font-medium">{item.label}</div>
                {item.description ? (
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                ) : null}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
