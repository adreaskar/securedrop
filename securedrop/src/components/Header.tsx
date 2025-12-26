import { Shield, LogOut, Upload, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Link, useLocation } from 'react-router-dom';

export function Header() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold text-foreground">SecureDrop</span>
        </Link>

        {user && (
          <nav className="flex items-center gap-2">
            <Button
              variant={location.pathname === '/dashboard' ? 'secondary' : 'ghost'}
              size="sm"
              asChild
            >
              <Link to="/dashboard" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Send Files
              </Link>
            </Button>
            <Button
              variant={location.pathname === '/inbox' ? 'secondary' : 'ghost'}
              size="sm"
              asChild
            >
              <Link to="/inbox" className="flex items-center gap-2">
                <Inbox className="h-4 w-4" />
                Inbox
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="ml-2">
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}
