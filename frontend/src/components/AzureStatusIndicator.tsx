import { Cloud, CloudOff, Loader2, AlertCircle } from 'lucide-react';
import { useAzureStatus, AzureStatus } from '@/hooks/useAzureStatus';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const statusConfig: Record<AzureStatus, { 
  icon: typeof Cloud; 
  color: string; 
  bgColor: string;
  dotColor: string;
  label: string;
  description: string;
}> = {
  loading: {
    icon: Loader2,
    color: 'text-sidebar-foreground/50',
    bgColor: 'bg-sidebar-foreground/10',
    dotColor: 'bg-sidebar-foreground/40',
    label: 'Verificando...',
    description: 'Verificando configuração Azure'
  },
  not_configured: {
    icon: CloudOff,
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    dotColor: 'bg-warning',
    label: 'Não Configurado',
    description: 'Configure as credenciais Azure em Configurações'
  },
  configured: {
    icon: Cloud,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    dotColor: 'bg-primary',
    label: 'Configurado',
    description: 'Credenciais Azure configuradas'
  },
  error: {
    icon: AlertCircle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    dotColor: 'bg-destructive',
    label: 'Erro',
    description: 'Erro ao verificar conexão Azure'
  }
};

export function AzureStatusIndicator() {
  const { status, subscriptionCount } = useAzureStatus();
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg cursor-default transition-colors",
            config.bgColor
          )}>
            <Icon className={cn(
              "h-4 w-4 shrink-0",
              config.color,
              status === 'loading' && "animate-spin"
            )} />
            <div className="flex-1 min-w-0">
              <p className={cn("text-xs font-medium", config.color)}>
                Azure
              </p>
              {subscriptionCount !== null && status === 'configured' && (
                <p className="text-[10px] text-sidebar-foreground/60">
                  {subscriptionCount} subscription{subscriptionCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {/* Dot indicator */}
            <div className={cn(
              "w-2 h-2 rounded-full shrink-0",
              config.dotColor,
              status === 'loading' && "animate-pulse"
            )} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="font-medium">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
