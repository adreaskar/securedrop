import { Shield, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type FileStatus = 'quarantine' | 'scanning' | 'approved' | 'rejected';

interface FileStatusBadgeProps {
  status: FileStatus;
}

const statusConfig: Record<FileStatus, {
  label: string;
  icon: React.ReactNode;
  className: string;
}> = {
  quarantine: {
    label: 'Quarantine',
    icon: <Clock className="h-3 w-3" />,
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  scanning: {
    label: 'Scanning',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
  approved: {
    label: 'Approved',
    icon: <CheckCircle className="h-3 w-3" />,
    className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  },
  rejected: {
    label: 'Threat Detected',
    icon: <XCircle className="h-3 w-3" />,
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

export function FileStatusBadge({ status }: FileStatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge variant="outline" className={`${config.className} gap-1.5 font-medium`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
